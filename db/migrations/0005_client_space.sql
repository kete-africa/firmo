-- Phase 4 — client space (specs/005-client-space). A share link opens ONE issued document for the
-- tradesman's client: read-only, revocable, never a list; its openings are counted without any
-- address or fingerprint (docs/product/model.md, "consulter_partage").

CREATE TABLE public.document_shares (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  document_id bigint NOT NULL,
  -- SHA-256 of the token; the token itself is shown once, in the link.
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES public.documents (organization_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.document_shares FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY document_shares_own ON public.document_shares TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint
CREATE POLICY document_shares_opener ON public.document_shares TO firmo_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint
-- The owner reads the shared document's file key through the function below only.
CREATE POLICY documents_shared_opener ON public.documents FOR SELECT TO firmo_owner USING (true);
--> statement-breakpoint

-- Opens a share: the file of one issued document, if the link is live; counts the opening.
CREATE FUNCTION public.open_document_share(p_token_hash text)
  RETURNS TABLE (pdf_key text, number text, document_type text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH opened AS (
      UPDATE document_shares s
      SET view_count = s.view_count + 1,
          first_opened_at = coalesce(s.first_opened_at, now()),
          last_opened_at = now()
      FROM documents d
      WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL
        AND d.organization_id = s.organization_id AND d.id = s.document_id
        AND d.state <> 'draft' AND d.pdf_key IS NOT NULL
      RETURNING d.pdf_key, d.number, d.type
    )
    SELECT pdf_key, number, type FROM opened
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.open_document_share(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.open_document_share(text) TO firmo_app;
