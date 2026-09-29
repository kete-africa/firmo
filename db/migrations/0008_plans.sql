-- Spec 007: what the model cost, per conversation turn and per document it worked on — measured,
-- never a message body. Counted per organization, like everything else (RLS).
CREATE TABLE public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  document_id bigint,
  model_calls integer NOT NULL CHECK (model_calls >= 0),
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, document_id) REFERENCES public.documents (organization_id, id)
);
--> statement-breakpoint
CREATE INDEX ai_usage_document ON public.ai_usage (organization_id, document_id);
--> statement-breakpoint
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ai_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_usage_own ON public.ai_usage TO firmo_app
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
--> statement-breakpoint
-- The quota counts first issuances (a correction /R2 is free) over a rolling period.
CREATE INDEX documents_first_issuances ON public.documents (organization_id, issued_at)
  WHERE revision = 1 AND issued_at IS NOT NULL;
