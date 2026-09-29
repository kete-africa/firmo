import { calculateDocument, Dec, type DraftInput } from '@/features/documents';

/**
 * The working draft of a conversation: what Firmo understood so far, before it becomes a
 * document. Every element has a stable id (S1, L3, A1) the agent names to change it — never a
 * position. Numbers are decimal text; each one entered the draft with words of the person's own
 * message that contain it (constitution I).
 */
export interface DraftLine {
  id: string;
  label: string;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  unit_price: string | null;
  flat_amount: string | null;
  /** False for a descriptive line, which carries no amount. */
  calculated: boolean;
}

export interface DraftSection {
  id: string;
  title: string | null;
  show_subtotal: boolean;
  lines: DraftLine[];
}

export interface DraftAdjustment {
  id: string;
  label: string;
  mode: 'percent' | 'fixed';
  value: string | null;
  sign: 1 | -1;
  base: 'items_total' | 'taxable_base';
}

export interface WorkingDraft {
  document_type: 'quote' | 'proforma' | 'invoice';
  subject: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_address: string | null;
  sections: DraftSection[];
  adjustments: DraftAdjustment[];
  site: string | null;
  delivery_text: string | null;
  warranty_text: string | null;
  conditions: string[];
  validity_days: string | null;
  tax_rate: string | null;
  deposit_percent: string | null;
  /** The next free number for ids. */
  next_id: number;
}

export const EMPTY_DRAFT: WorkingDraft = {
  document_type: 'quote',
  subject: null,
  client_name: null,
  client_phone: null,
  client_address: null,
  sections: [],
  adjustments: [],
  site: null,
  delivery_text: null,
  warranty_text: null,
  conditions: [],
  validity_days: null,
  tax_rate: null,
  deposit_percent: null,
  next_id: 1,
};

// --- Evidence --------------------------------------------------------------------------------

const squash = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .trim();

/** "20 000", "20.000 F", "12,5" in running text → "20000", "12.5". */
export function numbersIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\d[\d\s\u00a0\u202f.,]*/g)) {
    let raw = match[0].replace(/[\s\u00a0\u202f]+$/, '').replace(/[.,]$/, '');
    raw = raw.replace(/[\s\u00a0\u202f]/g, '');
    // "20.000" or "1.250.000": dots grouping thousands; "12,5" or "12.5": a decimal part.
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
    else if (/^\d{1,3}(,\d{3})+$/.test(raw)) raw = raw.replace(/,/g, '');
    else raw = raw.replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(raw)) found.push(new Dec(raw).toFixed());
  }
  return found;
}

export class EvidenceError extends Error {}

/**
 * A number enters the draft only if its evidence is words of the message, and those words
 * contain that very number. Returns its canonical text.
 */
export function provenNumber(
  value: string | null | undefined,
  evidence: string | null | undefined,
  message: string,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new EvidenceError(`not a number: ${value}`);
  const canonical = new Dec(cleaned).toFixed();
  if (!evidence || !squash(message).includes(squash(evidence))) {
    throw new EvidenceError(`the evidence of ${canonical} is not in the message`);
  }
  if (!numbersIn(evidence).includes(canonical)) {
    throw new EvidenceError(`${canonical} is not in its evidence`);
  }
  return canonical;
}

/** Text the person said (a name, a place): it must be in her message, apart from case. */
export function saidText(value: string | null | undefined, message: string): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (!squash(message).includes(squash(text))) {
    throw new EvidenceError(`"${text}" is not in the message`);
  }
  return text;
}

// --- Completeness ----------------------------------------------------------------------------

export type Missing =
  | { kind: 'items' }
  | { kind: 'client_name' }
  | { kind: 'subject' }
  | { kind: 'quantity' | 'unit_price'; lineId: string; label: string }
  | { kind: 'adjustment_value'; adjustmentId: string; label: string };

/** Everything still to ask, in order; the agent asks the first, one question at a time. */
export function missingOf(draft: WorkingDraft): Missing[] {
  const missing: Missing[] = [];
  if (!draft.sections.some((s) => s.lines.some((l) => l.calculated)))
    missing.push({ kind: 'items' });
  if (!draft.client_name?.trim()) missing.push({ kind: 'client_name' });
  for (const line of draft.sections.flatMap((section) => section.lines)) {
    if (!line.calculated || line.flat_amount !== null) continue;
    if (line.quantity === null)
      missing.push({ kind: 'quantity', lineId: line.id, label: line.label });
    else if (line.unit_price === null) {
      missing.push({ kind: 'unit_price', lineId: line.id, label: line.label });
    }
  }
  for (const adjustment of draft.adjustments) {
    if (adjustment.value === null) {
      missing.push({
        kind: 'adjustment_value',
        adjustmentId: adjustment.id,
        label: adjustment.label,
      });
    }
  }
  if (!draft.subject?.trim()) missing.push({ kind: 'subject' });
  return missing;
}

// --- Into a document ---------------------------------------------------------------------------

/** The draft, as the documents feature takes it (incomplete values ask for confirmation). */
export function toDraftInput(draft: WorkingDraft): DraftInput {
  return {
    type: draft.document_type,
    subject: draft.subject ?? '',
    client: {
      name: draft.client_name ?? '',
      phone: draft.client_phone,
      address: draft.client_address,
    },
    validityDays: draft.validity_days ? Number(draft.validity_days) : null,
    site: draft.site,
    delivery: draft.delivery_text,
    warranty: draft.warranty_text,
    assumptions: draft.conditions.join('\n') || null,
    depositPercent: draft.deposit_percent,
    taxRate: draft.tax_rate,
    sections: draft.sections
      .filter((section) => section.lines.length > 0)
      .map((section) => ({
        title: section.title,
        showSubtotal: section.show_subtotal,
        lines: section.lines.map((line) => ({
          label: line.label,
          description: line.description,
          unit: line.unit,
          quantity: line.flat_amount === null ? line.quantity : null,
          unitPrice: line.flat_amount === null ? line.unit_price : null,
          flatAmount: line.flat_amount,
          calculated: line.calculated,
          confirmationRequired:
            line.calculated &&
            line.flat_amount === null &&
            (line.quantity === null || line.unit_price === null),
        })),
      })),
    adjustments: draft.adjustments
      .filter((adjustment) => adjustment.value !== null)
      .map((adjustment) => ({
        label: adjustment.label,
        mode: adjustment.mode,
        value: adjustment.value ?? '0',
        sign: adjustment.sign,
        base: adjustment.base,
      })),
  };
}

/** Code-computed totals of what is complete, for the summary — never the model's arithmetic. */
export function totalsOf(draft: WorkingDraft): { itemsTotal: string; grandTotal: string } | null {
  const input = toDraftInput(draft);
  if (
    input.sections.length === 0 ||
    missingOf(draft).some((m) => m.kind !== 'client_name' && m.kind !== 'subject')
  ) {
    return null;
  }
  try {
    const calculation = calculateDocument({
      sections: input.sections.map((section, s) => ({
        sectionId: `s${s}`,
        title: section.title ?? null,
        showSubtotal: section.showSubtotal ?? false,
        position: s,
        lines: section.lines.map((line, l) => ({
          label: line.label,
          unit: line.unit ?? null,
          quantity: line.quantity ? new Dec(line.quantity) : null,
          unitPrice: line.unitPrice ? new Dec(line.unitPrice) : null,
          flatAmount: line.flatAmount ? new Dec(line.flatAmount) : null,
          calculated: line.calculated ?? true,
          position: l,
        })),
      })),
      adjustments: (input.adjustments ?? []).map((adjustment, position) => ({
        label: adjustment.label,
        mode: adjustment.mode,
        value: new Dec(adjustment.value),
        sign: adjustment.sign ?? 1,
        base: adjustment.base ?? 'items_total',
        position,
      })),
      taxRate: input.taxRate ? new Dec(input.taxRate) : null,
      depositPercent: input.depositPercent ? new Dec(input.depositPercent) : null,
    });
    return {
      itemsTotal: calculation.itemsTotal.toFixed(0),
      grandTotal: calculation.grandTotal.toFixed(0),
    };
  } catch {
    return null;
  }
}
