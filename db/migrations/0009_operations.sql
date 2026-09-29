-- Spec 008: what Kete operators do in Firmo leaves a trace. The journal is written in the same
-- transaction as the reading it records, inside the organization read (RLS); the application role
-- never reads it back directly: the operator space reads it through a definer function.
CREATE TABLE public.operator_journal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  operator_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('document_read')),
  subject text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.operator_journal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.operator_journal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY operator_journal_write ON public.operator_journal FOR INSERT TO firmo_app
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint
CREATE POLICY operator_journal_reader ON public.operator_journal FOR SELECT TO firmo_owner
  USING (true);
--> statement-breakpoint
-- The latest entries, for the operator space.
CREATE FUNCTION public.operator_journal_recent(p_limit integer)
  RETURNS TABLE (id bigint, organization_id text, operator_id text, action text, subject text,
                 reason text, created_at timestamptz)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT id, organization_id, operator_id, action, subject, reason, created_at
    FROM operator_journal ORDER BY id DESC LIMIT least(greatest(p_limit, 1), 200)
  $$;
--> statement-breakpoint
-- Messages that failed after their attempts: never a body (erased once settled, decision 0001),
-- the sender masked to its last four characters.
CREATE FUNCTION public.operator_incidents(p_limit integer)
  RETURNS TABLE (id bigint, channel text, sender_hint text, error text, attempts integer,
                 organization_id text, received_at timestamptz, settled_at timestamptz)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT id, channel, '…' || right(sender, 4), left(coalesce(error, ''), 200), attempts,
           organization_id, received_at, settled_at
    FROM inbound_messages WHERE status = 'failed'
    ORDER BY settled_at DESC NULLS LAST, id DESC LIMIT least(greatest(p_limit, 1), 200)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.operator_journal_recent(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.operator_incidents(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.operator_journal_recent(integer) TO firmo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.operator_incidents(integer) TO firmo_app;
