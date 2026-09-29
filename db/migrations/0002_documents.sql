-- Phase 1 — the document (specs/002-documents). Every table carries organization_id and is created
-- with its RLS policy (constitution III): firmo_app sees only the organization set for the
-- transaction. An issued document is immutable, enforced here as well as in the code.

-- The organization's commercial identity: what its documents carry in their header.
CREATE TABLE public.organization_profiles (
  organization_id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  legal_name text,
  trade text,
  phone text,
  email text,
  address text,
  legal_mentions text,
  rccm text,
  tax_id text,
  logo_key text,
  currency char(3) NOT NULL DEFAULT 'XOF',
  brand_color text CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_warranty text,
  default_delivery text,
  default_deposit_percent numeric(5,2) CHECK (default_deposit_percent BETWEEN 0 AND 100),
  default_validity_days integer NOT NULL DEFAULT 30 CHECK (default_validity_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.organization_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.organization_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_profiles_own ON public.organization_profiles TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- How each document type is numbered; changing it never resets a counter.
CREATE TABLE public.numbering_settings (
  organization_id text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('quote', 'proforma', 'invoice')),
  prefix text NOT NULL DEFAULT '' CHECK (prefix ~ '^[A-Za-z0-9._/-]{0,24}$'),
  separator text NOT NULL DEFAULT '-' CHECK (separator IN ('-', '_', '/', '.')),
  cadence text NOT NULL DEFAULT 'annual' CHECK (cadence IN ('annual', 'continuous')),
  width smallint NOT NULL DEFAULT 3 CHECK (width BETWEEN 1 AND 12),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, document_type)
);
--> statement-breakpoint
ALTER TABLE public.numbering_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.numbering_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY numbering_settings_own ON public.numbering_settings TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- One counter per series (type, and year for an annual series; 0 for a continuous one).
CREATE TABLE public.document_counters (
  organization_id text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('quote', 'proforma', 'invoice')),
  year integer NOT NULL CHECK (year = 0 OR year BETWEEN 2000 AND 9999),
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (organization_id, document_type, year)
);
--> statement-breakpoint
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_counters FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_counters_own ON public.document_counters TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

CREATE TABLE public.clients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text,
  address text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
--> statement-breakpoint
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clients_own ON public.clients TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- Conditions written once, reused, enabled per document; Firmo adjusts the wording, never the
-- substance.
CREATE TABLE public.clauses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  enabled_by_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
--> statement-breakpoint
ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.clauses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clauses_own ON public.clauses TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- What he has already priced, as he wrote it: memory, never a suggested price.
CREATE TABLE public.frequent_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  unit text,
  last_price numeric(18,2) CHECK (last_price IS NULL OR last_price >= 0),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX frequent_items_label ON public.frequent_items
  (organization_id, lower(btrim(label)), coalesce(lower(btrim(unit)), ''));
--> statement-breakpoint
ALTER TABLE public.frequent_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.frequent_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY frequent_items_own ON public.frequent_items TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- The anchor. A draft has no number; issuance burns the number and freezes the snapshot (totals,
-- header, clauses) and the PDF's fingerprint.
CREATE TABLE public.documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('quote', 'proforma', 'invoice')),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'issued', 'accepted', 'refused', 'unanswered', 'cancelled')),
  number text,
  subject text NOT NULL CHECK (btrim(subject) <> ''),
  client_id bigint,
  client_name text NOT NULL CHECK (btrim(client_name) <> ''),
  client_phone text,
  client_address text,
  document_date date NOT NULL DEFAULT current_date,
  validity_days integer NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  site text,
  delivery_text text,
  warranty_text text,
  assumptions text,
  deposit_percent numeric(5,2) CHECK (deposit_percent BETWEEN 0 AND 100),
  tax_rate numeric(5,2) CHECK (tax_rate BETWEEN 0 AND 100),
  snapshot jsonb,
  snapshot_sha256 text,
  template_version text,
  pdf_key text,
  pdf_sha256 text,
  manual_number boolean NOT NULL DEFAULT false,
  issued_at timestamptz,
  root_document_id bigint,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_document_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, type, number),
  FOREIGN KEY (organization_id, client_id) REFERENCES public.clients (organization_id, id),
  FOREIGN KEY (organization_id, root_document_id) REFERENCES public.documents (organization_id, id),
  FOREIGN KEY (organization_id, source_document_id)
    REFERENCES public.documents (organization_id, id),
  CONSTRAINT documents_issuance_shape CHECK (
    (state = 'draft' AND number IS NULL AND issued_at IS NULL AND snapshot IS NULL)
    OR (state <> 'draft' AND number IS NOT NULL AND issued_at IS NOT NULL
        AND snapshot IS NOT NULL AND snapshot_sha256 IS NOT NULL
        AND template_version IS NOT NULL AND pdf_sha256 IS NOT NULL)
  ),
  CONSTRAINT documents_revision_shape CHECK (
    (revision = 1 AND root_document_id IS NULL) OR (revision > 1 AND root_document_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX documents_recent ON public.documents (organization_id, updated_at DESC);
--> statement-breakpoint
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY documents_own ON public.documents TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

CREATE TABLE public.document_sections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  document_id bigint NOT NULL,
  title text CHECK (title IS NULL OR btrim(title) <> ''),
  show_subtotal boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (organization_id, id),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES public.documents (organization_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_sections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_sections_own ON public.document_sections TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

CREATE TABLE public.document_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  section_id bigint NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  description text,
  unit text,
  quantity numeric(18,4) CHECK (quantity IS NULL OR quantity > 0),
  unit_price numeric(18,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  flat_amount numeric(18,2) CHECK (flat_amount IS NULL OR flat_amount >= 0),
  calculated boolean NOT NULL DEFAULT true,
  confirmation_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (section_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, section_id)
    REFERENCES public.document_sections (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT document_lines_exclusive_amount
    CHECK (flat_amount IS NULL OR (quantity IS NULL AND unit_price IS NULL)),
  CONSTRAINT document_lines_descriptive
    CHECK (calculated OR (quantity IS NULL AND unit_price IS NULL AND flat_amount IS NULL)),
  CONSTRAINT document_lines_complete_or_confirm CHECK (
    NOT calculated OR flat_amount IS NOT NULL
    OR (quantity IS NOT NULL AND unit_price IS NOT NULL) OR confirmation_required
  )
);
--> statement-breakpoint
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_lines_own ON public.document_lines TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

CREATE TABLE public.document_adjustments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  document_id bigint NOT NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  mode text NOT NULL CHECK (mode IN ('fixed', 'percent')),
  sign smallint NOT NULL CHECK (sign IN (-1, 1)),
  base text NOT NULL CHECK (base IN ('section', 'items_total', 'taxable_base')),
  base_section_id bigint,
  value numeric(18,4) NOT NULL CHECK (value >= 0),
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES public.documents (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, base_section_id)
    REFERENCES public.document_sections (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT document_adjustments_base_shape CHECK (
    (base = 'section' AND base_section_id IS NOT NULL)
    OR (base <> 'section' AND base_section_id IS NULL)
  )
);
--> statement-breakpoint
ALTER TABLE public.document_adjustments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_adjustments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_adjustments_own ON public.document_adjustments TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- The clauses enabled on a document, copied: a later edit of the clause never changes it.
CREATE TABLE public.document_clauses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  document_id bigint NOT NULL,
  clause_id bigint,
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (document_id, position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES public.documents (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, clause_id) REFERENCES public.clauses (organization_id, id)
);
--> statement-breakpoint
ALTER TABLE public.document_clauses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_clauses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_clauses_own ON public.document_clauses TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- A payment received on an invoice: simple follow-up, never accounting.
CREATE TABLE public.document_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  document_id bigint NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (btrim(method) <> ''),
  reference text,
  balance_after numeric(18,2) NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, document_id)
    REFERENCES public.documents (organization_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE public.document_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_payments_own ON public.document_payments TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- Immutability, enforced by the database: once issued, a document only changes state (issued →
-- accepted, refused, unanswered or cancelled), and its content can no longer change.
CREATE FUNCTION public.documents_guard_issued() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'updated_at')
     OR NOT (OLD.state = 'issued' AND NEW.state IN ('issued', 'accepted', 'refused', 'unanswered', 'cancelled')
             OR OLD.state = NEW.state) THEN
    RAISE EXCEPTION 'issued document % is immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER documents_guard_issued BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_issued();
--> statement-breakpoint
CREATE FUNCTION public.documents_guard_issued_delete() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'draft' THEN
    RAISE EXCEPTION 'issued document % cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER documents_guard_issued_delete BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_issued_delete();
--> statement-breakpoint

-- The content of an issued document (sections, lines, adjustments, clauses) is frozen too.
CREATE FUNCTION public.document_content_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(coalesce(NEW, OLD));
  target bigint;
  current_state text;
BEGIN
  IF TG_TABLE_NAME = 'document_lines' THEN
    SELECT s.document_id INTO target FROM public.document_sections s
      WHERE s.id = (row_data ->> 'section_id')::bigint;
  ELSE
    target := (row_data ->> 'document_id')::bigint;
  END IF;
  SELECT d.state INTO current_state FROM public.documents d WHERE d.id = target;
  IF current_state IS NOT NULL AND current_state <> 'draft' THEN
    RAISE EXCEPTION 'issued document % is immutable', target USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER document_sections_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.document_content_guard();
--> statement-breakpoint
CREATE TRIGGER document_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_lines
  FOR EACH ROW EXECUTE FUNCTION public.document_content_guard();
--> statement-breakpoint
CREATE TRIGGER document_adjustments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.document_content_guard();
--> statement-breakpoint
CREATE TRIGGER document_clauses_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_clauses
  FOR EACH ROW EXECUTE FUNCTION public.document_content_guard();
