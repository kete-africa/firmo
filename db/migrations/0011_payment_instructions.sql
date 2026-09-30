-- Spec 011, lot 2: how his clients pay him (a mobile money number…), printed on his invoices;
-- asked once in the conversation. The table keeps its row-level security (migration 0002).
ALTER TABLE public.organization_profiles
  ADD COLUMN payment_instructions text
    CHECK (payment_instructions IS NULL OR char_length(payment_instructions) BETWEEN 1 AND 300);
--> statement-breakpoint
ALTER TABLE public.organization_profiles
  ADD COLUMN payment_asked boolean NOT NULL DEFAULT false;
