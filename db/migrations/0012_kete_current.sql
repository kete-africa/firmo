-- Spec 012: what the Kete chassis expects of an app today — the feedback button and the day's
-- figures. Each table is created with its RLS policy.

-- The feedback button of every Kete app (@kete/feedback): what goes wrong, an idea or what works,
-- said in the space, kept in the person's organization. Append-only: the application role adds
-- and reads, never changes. Kete operators read the latest through a definer function.
CREATE TABLE public.kete_feedback (
  feedback_id text PRIMARY KEY,
  organization_id text NOT NULL,
  person_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('problem', 'idea', 'praise')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  page text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX kete_feedback_recent ON public.kete_feedback (organization_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE public.kete_feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.kete_feedback FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kete_feedback_read ON public.kete_feedback FOR SELECT TO firmo_app
  USING (organization_id = public.current_organization_id());
--> statement-breakpoint
CREATE POLICY kete_feedback_add ON public.kete_feedback FOR INSERT TO firmo_app
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint
CREATE POLICY kete_feedback_reader ON public.kete_feedback FOR SELECT TO firmo_owner USING (true);
--> statement-breakpoint
REVOKE ALL ON public.kete_feedback FROM firmo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.kete_feedback TO firmo_app;
--> statement-breakpoint
-- The latest feedback, for the operator space: what was said and where — never who said it.
CREATE FUNCTION public.operator_feedback(p_limit integer)
  RETURNS TABLE (feedback_id text, organization_id text, kind text, message text, page text,
                 created_at timestamptz)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT feedback_id, organization_id, kind, message, page, created_at
    FROM kete_feedback ORDER BY created_at DESC LIMIT least(greatest(p_limit, 1), 200)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.operator_feedback(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.operator_feedback(integer) TO firmo_app;
--> statement-breakpoint
-- The days whose figures were announced (`metrics.daily`): one row per day, written in the
-- transaction that records the event, so a day is announced once. They belong to Kete's own
-- organization, the one that runs Firmo.
CREATE TABLE public.metrics_days (
  day date PRIMARY KEY,
  organization_id text NOT NULL,
  announced_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.metrics_days ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.metrics_days FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY metrics_days_read ON public.metrics_days FOR SELECT TO firmo_app
  USING (organization_id = public.current_organization_id());
--> statement-breakpoint
CREATE POLICY metrics_days_add ON public.metrics_days FOR INSERT TO firmo_app
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint
REVOKE ALL ON public.metrics_days FROM firmo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.metrics_days TO firmo_app;
--> statement-breakpoint
-- The owner role counts the model's calls across organizations for the day's figures.
CREATE POLICY ai_usage_counter ON public.ai_usage FOR SELECT TO firmo_owner USING (true);
--> statement-breakpoint
-- A day's figures across every organization (UTC): counters only — never a price, a client, a
-- number nor a sender.
CREATE FUNCTION public.daily_counters(p_day date)
  RETURNS TABLE (name text, value bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH bounds AS (
      SELECT (p_day::timestamp AT TIME ZONE 'UTC') AS from_at,
             ((p_day + 1)::timestamp AT TIME ZONE 'UTC') AS to_at
    )
    SELECT 'documents_issued', count(*) FROM documents, bounds
      WHERE issued_at >= from_at AND issued_at < to_at
    UNION ALL
    SELECT 'organizations_issuing', count(DISTINCT organization_id) FROM documents, bounds
      WHERE issued_at >= from_at AND issued_at < to_at
    UNION ALL
    SELECT 'shares_first_opened', count(*) FROM document_shares, bounds
      WHERE first_opened_at >= from_at AND first_opened_at < to_at
    UNION ALL
    SELECT 'messages_received', count(*) FROM inbound_messages, bounds
      WHERE received_at >= from_at AND received_at < to_at
    UNION ALL
    SELECT 'messages_failed', count(*) FROM inbound_messages, bounds
      WHERE status = 'failed' AND received_at >= from_at AND received_at < to_at
    UNION ALL
    SELECT 'senders_active', count(DISTINCT sender) FROM inbound_messages, bounds
      WHERE received_at >= from_at AND received_at < to_at
    UNION ALL
    SELECT 'model_calls', coalesce(sum(model_calls), 0)::bigint FROM ai_usage, bounds
      WHERE created_at >= from_at AND created_at < to_at
    UNION ALL
    SELECT 'feedback_received', count(*) FROM kete_feedback, bounds
      WHERE created_at >= from_at AND created_at < to_at
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.daily_counters(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.daily_counters(date) TO firmo_app;
