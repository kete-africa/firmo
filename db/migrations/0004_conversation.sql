-- Phase 3 — conversation (specs/004-conversation). Decision 0001: the inbox is a table reached
-- only through definer functions; a message's body is erased once it is processed.

CREATE TABLE public.inbound_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  provider_message_id text NOT NULL,
  sender text NOT NULL,
  -- The normalized message; erased (null) once settled.
  payload jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  leased_until timestamptz,
  -- Known once the sender is resolved; lets an operator find an incident (phase 6).
  organization_id text,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (channel, provider_message_id)
);
--> statement-breakpoint
CREATE INDEX inbound_messages_due ON public.inbound_messages (received_at)
  WHERE status IN ('pending', 'processing');
--> statement-breakpoint
-- No policy for firmo_app: bodies arrive before any organization is known.
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.inbound_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inbound_messages_owner ON public.inbound_messages TO firmo_owner
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Stores a verified message once per provider id; true when it is new.
CREATE FUNCTION public.inbound_enqueue(p_channel text, p_id text, p_sender text, p_payload jsonb)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH inserted AS (
      INSERT INTO inbound_messages (channel, provider_message_id, sender, payload)
      VALUES (p_channel, p_id, p_sender, p_payload)
      ON CONFLICT (channel, provider_message_id) DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM inserted)
  $$;
--> statement-breakpoint
-- Claims due messages for a lease; one sender's messages are handled in order, one at a time.
CREATE FUNCTION public.inbound_claim(p_limit integer, p_lease_seconds integer)
  RETURNS TABLE (id bigint, channel text, sender text, payload jsonb, attempts integer)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH due AS (
      SELECT m.id FROM inbound_messages m
      WHERE (m.status = 'pending' OR (m.status = 'processing' AND m.leased_until < now()))
        AND NOT EXISTS (
          SELECT 1 FROM inbound_messages earlier
          WHERE earlier.channel = m.channel AND earlier.sender = m.sender
            AND earlier.id < m.id AND earlier.status IN ('pending', 'processing')
        )
      ORDER BY m.id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    UPDATE inbound_messages m
    SET status = 'processing', attempts = m.attempts + 1,
        leased_until = now() + make_interval(secs => p_lease_seconds)
    FROM due WHERE m.id = due.id
    RETURNING m.id, m.channel, m.sender, m.payload, m.attempts
  $$;
--> statement-breakpoint
-- Settles a claimed message: done or failed; the body is erased either way.
CREATE FUNCTION public.inbound_settle(p_id bigint, p_status text, p_organization text, p_error text)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE inbound_messages
    SET status = p_status, organization_id = coalesce(p_organization, organization_id),
        error = p_error, payload = NULL, leased_until = NULL, settled_at = now()
    WHERE id = p_id AND p_status IN ('done', 'failed')
  $$;
--> statement-breakpoint
-- Gives a failed attempt back to the queue (a later retry), keeping the body.
CREATE FUNCTION public.inbound_release(p_id bigint, p_error text)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE inbound_messages SET status = 'pending', leased_until = NULL, error = p_error
    WHERE id = p_id AND status = 'processing'
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.inbound_enqueue(text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.inbound_claim(integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.inbound_settle(bigint, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.inbound_release(bigint, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.inbound_enqueue(text, text, text, jsonb) TO firmo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.inbound_claim(integer, integer) TO firmo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.inbound_settle(bigint, text, text, text) TO firmo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.inbound_release(bigint, text) TO firmo_app;
--> statement-breakpoint

-- One conversation per sender and channel, in its organization: the working draft, the document
-- it became, an issuance waiting for confirmation, and the recent exchanges (text only).
CREATE TABLE public.conversations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  sender text NOT NULL,
  draft jsonb,
  document_id bigint,
  pending_issue jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, sender),
  FOREIGN KEY (organization_id, document_id) REFERENCES public.documents (organization_id, id)
);
--> statement-breakpoint
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY conversations_own ON public.conversations TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
