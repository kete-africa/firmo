import { calculateDocument, Dec, moneyToString, type DraftInput } from '@/features/documents';

/**
 * The working draft of a conversation: the document as the model understood it from the whole
 * conversation, rewritten by the model in full each time something changes (spec 010). Numbers
 * are canonical decimal text; the code computes every total from them.
 */
export interface DraftLine {
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
  title: string | null;
  show_subtotal: boolean;
  lines: DraftLine[];
}

export interface DraftAdjustment {
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
}

// --- Completeness ----------------------------------------------------------------------------

export type Missing =
  | { kind: 'items' }
  | { kind: 'client_name' }
  | { kind: 'subject' }
  | { kind: 'quantity' | 'unit_price'; label: string }
  | { kind: 'adjustment_value'; label: string };

/** Everything still to ask, in order; the agent asks the first, one question at a time. */
export function missingOf(draft: WorkingDraft): Missing[] {
  const missing: Missing[] = [];
  if (!draft.sections.some((s) => s.lines.some((l) => l.calculated)))
    missing.push({ kind: 'items' });
  if (!draft.client_name?.trim()) missing.push({ kind: 'client_name' });
  for (const line of draft.sections.flatMap((section) => section.lines)) {
    if (!line.calculated || line.flat_amount !== null) continue;
    if (line.quantity === null) missing.push({ kind: 'quantity', label: line.label });
    else if (line.unit_price === null) {
      missing.push({ kind: 'unit_price', label: line.label });
    }
  }
  for (const adjustment of draft.adjustments) {
    if (adjustment.value === null) {
      missing.push({ kind: 'adjustment_value', label: adjustment.label });
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

/** Every level of a complete draft's calculation, as the person reads it — the code's, exact. */
export interface DraftTotals {
  /** Each section's line amounts (null for a descriptive line) and subtotal. */
  sections: { lines: (string | null)[]; subtotal: string }[];
  itemsTotal: string;
  /** Each adjustment's signed amount, in the draft's order. */
  adjustments: string[];
  taxableBase: string;
  taxAmount: string | null;
  grandTotal: string;
  depositRequested: string | null;
}

/** Code-computed totals of what is complete, for the summary — never the model's arithmetic. */
export function totalsOf(draft: WorkingDraft): DraftTotals | null {
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
      sections: calculation.sections.map((section) => ({
        lines: section.lines.map((line) =>
          line.amount === null ? null : moneyToString(line.amount),
        ),
        subtotal: moneyToString(section.subtotal),
      })),
      itemsTotal: moneyToString(calculation.itemsTotal),
      adjustments: calculation.adjustments.map((a) => moneyToString(a.amount)),
      taxableBase: moneyToString(calculation.taxableBase),
      taxAmount: input.taxRate ? moneyToString(calculation.taxAmount) : null,
      grandTotal: moneyToString(calculation.grandTotal),
      depositRequested:
        calculation.depositRequested === null ? null : moneyToString(calculation.depositRequested),
    };
  } catch {
    return null;
  }
}
