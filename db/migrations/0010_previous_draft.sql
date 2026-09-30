-- Spec 011: « annule » brings the draft back to its version before the last change. The table
-- keeps its row-level security (migration 0004).
ALTER TABLE public.conversations ADD COLUMN previous_draft jsonb;
