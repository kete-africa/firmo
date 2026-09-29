-- Phase 2 — identity (specs/003-identity). A messaging identity (a channel and the sender it
-- proves) belongs to one Compte Kete person and one organization (doctrine D-024).

CREATE TABLE public.messaging_identities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  person_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  -- The sender as the channel proves it: a WhatsApp number, a Telegram user id.
  subject text NOT NULL CHECK (btrim(subject) <> ''),
  phone_number text CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, subject)
);
--> statement-breakpoint
ALTER TABLE public.messaging_identities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.messaging_identities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY messaging_identities_own ON public.messaging_identities TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint

-- The owner role reads across organizations only through the definer function below.
CREATE POLICY messaging_identities_resolver ON public.messaging_identities TO firmo_owner
  USING (true);
--> statement-breakpoint

-- Who wrote: the one crossing a message needs before any organization is known. It answers for
-- one proven sender at a time and never lists identities.
CREATE FUNCTION public.find_messaging_identity(p_channel text, p_subject text)
  RETURNS TABLE (organization_id text, person_id text, phone_number text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT m.organization_id, m.person_id, m.phone_number
    FROM messaging_identities m
    WHERE m.channel = p_channel AND m.subject = p_subject
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.find_messaging_identity(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.find_messaging_identity(text, text) TO firmo_app;
