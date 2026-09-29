-- The answers follow the document's type (src/features/documents/domain/lifecycle.ts): a quote is
-- accepted, refused or left without an answer, and can still be accepted or refused later; a
-- proforma is accepted (ordered) or refused; an invoice is only ever cancelled. An accepted
-- document can be cancelled. The content stays frozen whatever the state.
CREATE OR REPLACE FUNCTION public.documents_guard_issued() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'state' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'updated_at') THEN
    RAISE EXCEPTION 'issued document % is immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
    OLD.state = NEW.state
    OR (OLD.state = 'issued' AND NEW.state = 'cancelled')
    OR (OLD.state = 'issued' AND OLD.type <> 'invoice' AND NEW.state IN ('accepted', 'refused'))
    OR (OLD.state = 'issued' AND OLD.type = 'quote' AND NEW.state = 'unanswered')
    OR (OLD.state = 'unanswered' AND NEW.state IN ('accepted', 'refused', 'cancelled'))
    OR (OLD.state = 'accepted' AND NEW.state = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'issued document % cannot go from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
