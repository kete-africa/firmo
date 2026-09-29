import type { DocumentState, DocumentType } from './types';

/**
 * What each type of document may become once issued (docs/product/model.md, "cycle de vie"):
 * - a quote is answered by the client: accepted, refused, or left without an answer;
 * - a proforma is ordered (accepted) or refused;
 * - an invoice is paid (its balance says so) — it is never "accepted"; it can only be cancelled.
 * Any issued document may be cancelled.
 */
export type Answer = Extract<DocumentState, 'accepted' | 'refused' | 'unanswered' | 'cancelled'>;

const ANSWERS: Record<DocumentType, readonly Answer[]> = {
  quote: ['accepted', 'refused', 'unanswered', 'cancelled'],
  proforma: ['accepted', 'refused', 'cancelled'],
  invoice: ['cancelled'],
};

export function answersOf(type: DocumentType): readonly Answer[] {
  return ANSWERS[type];
}

/**
 * The answers still possible from a state: an issued document gets its type's answers; a quote
 * left without an answer can still be accepted or refused later; an accepted one can be cancelled.
 */
export function nextAnswers(type: DocumentType, state: DocumentState): readonly Answer[] {
  if (state === 'issued') return ANSWERS[type];
  if (state === 'unanswered') return ANSWERS[type].filter((a) => a !== 'unanswered');
  if (state === 'accepted') return ['cancelled'];
  return [];
}

/** Quote → proforma or invoice; proforma → invoice. Never from a refused or cancelled one. */
export function canConvert(
  type: DocumentType,
  state: DocumentState,
  target: DocumentType,
): boolean {
  const forward: Record<DocumentType, DocumentType[]> = {
    quote: ['proforma', 'invoice'],
    proforma: ['invoice'],
    invoice: [],
  };
  return (state === 'issued' || state === 'accepted') && forward[type].includes(target);
}

/**
 * A correction is a new version /R2 of a quote or a proforma. An issued invoice is never
 * rewritten: it is cancelled and a new invoice is issued, with its own number.
 */
export function canRevise(type: DocumentType, state: DocumentState): boolean {
  return type !== 'invoice' && state !== 'draft';
}

/** The last day a quote or a proforma holds — computed, never stored (null for an invoice). */
export function validUntil(
  type: DocumentType,
  documentDate: string,
  validityDays: number,
): string | null {
  if (type === 'invoice') return null;
  const date = new Date(`${documentDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + validityDays);
  return date.toISOString().slice(0, 10);
}

/** An issued quote or proforma nobody answered, past its validity. */
export function isExpired(
  type: DocumentType,
  state: DocumentState,
  documentDate: string,
  validityDays: number,
  today: string,
): boolean {
  const until = validUntil(type, documentDate, validityDays);
  return state === 'issued' && until !== null && until < today;
}
