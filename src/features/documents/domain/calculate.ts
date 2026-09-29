import type { Dec } from './money';
import { asDecimal, multiplyMoney, percentageOf, quantizeMoney, ZERO } from './money';
import type {
  CalculatedAdjustment,
  CalculatedLine,
  CalculatedSection,
  DocumentAdjustment,
  DocumentCalculation,
  DocumentDraft,
  DocumentLine,
  DocumentSection,
} from './types';

/**
 * The totals of a document, in a fixed order: lines, section subtotals, items total, ordered
 * adjustments on an explicit base, taxable base, tax, grand total, requested deposit and its
 * indicative balance, payments and balance due. Pure; never changes a price. Ported from the
 * reference's `calculations.py`, with its error codes.
 */
export class CalculationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new CalculationError(code, message);
}

function finite(value: Dec, field: string): Dec {
  try {
    return asDecimal(value);
  } catch {
    return fail('invalid_decimal', `${field} must be a finite decimal`);
  }
}

function checkPosition(position: number, subject: string): void {
  if (!Number.isInteger(position) || position < 0) {
    fail('invalid_position', `${subject} position must be a non-negative integer`);
  }
}

function ordered<T extends { position: number }>(values: readonly T[], subject: string): T[] {
  const seen = new Set<number>();
  for (const value of values) {
    checkPosition(value.position, subject);
    if (seen.has(value.position)) fail('duplicate_position', `${subject} positions must be unique`);
    seen.add(value.position);
  }
  return [...values].sort((a, b) => a.position - b.position);
}

export function calculateLine(line: DocumentLine, requireConfirmation = true): CalculatedLine {
  if (!line.label.trim()) fail('blank_line_label', 'line label must not be blank');
  checkPosition(line.position, 'line');
  const { quantity, unitPrice, flatAmount } = line;
  if (line.calculated === false) {
    if (quantity != null || unitPrice != null || flatAmount != null) {
      fail('invalid_descriptive_line', 'descriptive line cannot contain monetary values');
    }
    return { source: line, amount: null };
  }
  if (requireConfirmation && line.confirmationRequired) {
    fail('confirmation_required', 'calculated line still requires confirmation');
  }
  if (flatAmount != null) {
    if (quantity != null || unitPrice != null) {
      fail('contradictory_line', 'flat and quantity-based values are mutually exclusive');
    }
    const amount = finite(flatAmount, 'flat amount');
    if (amount.lt(ZERO)) fail('negative_line_value', 'flat amount must not be negative');
    return { source: line, amount: quantizeMoney(amount) };
  }
  if (quantity == null || unitPrice == null) {
    return fail('incomplete_line', 'calculated line requires quantity and unit price');
  }
  const q = finite(quantity, 'quantity');
  const p = finite(unitPrice, 'unit price');
  if (q.lte(ZERO)) fail('invalid_quantity', 'quantity must be greater than zero');
  if (p.lt(ZERO)) fail('negative_line_value', 'unit price must not be negative');
  return { source: line, amount: multiplyMoney(q, p) };
}

export function calculateSection(
  section: DocumentSection,
  requireConfirmation = true,
): CalculatedSection {
  checkPosition(section.position, 'section');
  if (section.title != null && !section.title.trim()) {
    fail('blank_section_title', 'section title must not be blank');
  }
  if (section.lines.length === 0) fail('empty_section', 'section must contain at least one line');
  const lines = ordered(section.lines, 'line').map((line) =>
    calculateLine(line, requireConfirmation),
  );
  const subtotal = lines.reduce((sum, line) => (line.amount ? sum.plus(line.amount) : sum), ZERO);
  return { source: section, lines, subtotal };
}

function adjustmentBase(
  adjustment: DocumentAdjustment,
  sectionSubtotals: Map<string, Dec>,
  itemsTotal: Dec,
  taxableBase: Dec,
): Dec {
  if (!['section', 'items_total', 'taxable_base'].includes(adjustment.base)) {
    fail('invalid_adjustment_base', 'adjustment base is not supported');
  }
  if (adjustment.base === 'section') {
    const subtotal =
      adjustment.sectionId == null ? undefined : sectionSubtotals.get(adjustment.sectionId);
    if (subtotal === undefined) {
      return fail(
        'unknown_adjustment_section',
        'adjustment section does not belong to the document',
      );
    }
    return subtotal;
  }
  if (adjustment.sectionId != null) {
    fail('unexpected_adjustment_section', 'non-section adjustment cannot name a section');
  }
  return adjustment.base === 'items_total' ? itemsTotal : taxableBase;
}

function adjustmentAmount(adjustment: DocumentAdjustment, base: Dec): Dec {
  if (!adjustment.label.trim())
    fail('blank_adjustment_label', 'adjustment label must not be blank');
  checkPosition(adjustment.position, 'adjustment');
  if (adjustment.sign !== 1 && adjustment.sign !== -1) {
    fail('invalid_adjustment_sign', 'adjustment sign must be -1 or 1');
  }
  const value = finite(adjustment.value, 'adjustment value');
  if (value.lt(ZERO)) fail('negative_adjustment_value', 'adjustment value must not be negative');
  let unsigned: Dec;
  if (adjustment.mode === 'percent') unsigned = percentageOf(base, value);
  else if (adjustment.mode === 'fixed') unsigned = quantizeMoney(value);
  else return fail('invalid_adjustment_mode', 'adjustment mode is not supported');
  const amount = adjustment.sign === -1 ? unsigned.negated() : unsigned;
  if (amount.lt(ZERO) && base.plus(amount).lt(ZERO)) {
    fail('negative_adjustment_base', 'discount cannot make its calculation base negative');
  }
  return amount;
}

export function calculateDocument(
  draft: DocumentDraft,
  options: { requireConfirmation?: boolean } = {},
): DocumentCalculation {
  const requireConfirmation = options.requireConfirmation ?? true;
  if (draft.sections.length === 0) fail('missing_sections', 'document must contain a section');

  const ids = new Set<string>();
  const sections = ordered(draft.sections, 'section').map((section) => {
    if (ids.has(section.sectionId)) {
      fail('duplicate_section_id', 'section identifiers must be unique');
    }
    ids.add(section.sectionId);
    return calculateSection(section, requireConfirmation);
  });
  if (!sections.some((section) => section.lines.some((line) => line.amount !== null))) {
    fail('missing_billable_line', 'document must contain at least one calculated line');
  }

  const itemsTotal = sections.reduce((sum, section) => sum.plus(section.subtotal), ZERO);
  const subtotals = new Map(
    sections.map((section) => [section.source.sectionId, section.subtotal]),
  );
  let taxableBase = itemsTotal;
  const adjustments: CalculatedAdjustment[] = [];
  for (const adjustment of ordered(draft.adjustments ?? [], 'adjustment')) {
    const baseAmount = adjustmentBase(adjustment, subtotals, itemsTotal, taxableBase);
    const amount = adjustmentAmount(adjustment, baseAmount);
    taxableBase = taxableBase.plus(amount);
    if (taxableBase.lt(ZERO)) {
      fail('negative_total', 'adjustments cannot make the taxable base negative');
    }
    adjustments.push({ source: adjustment, baseAmount, amount });
  }
  const adjustmentsTotal = adjustments.reduce((sum, item) => sum.plus(item.amount), ZERO);

  let taxAmount = ZERO;
  if (draft.taxRate != null) {
    const rate = finite(draft.taxRate, 'tax rate');
    if (rate.lt(ZERO) || rate.gt(100)) fail('invalid_tax_rate', 'tax rate must be 0 to 100');
    taxAmount = percentageOf(taxableBase, rate);
  }
  const grandTotal = taxableBase.plus(taxAmount);
  if (grandTotal.lt(ZERO)) fail('negative_total', 'grand total must not be negative');

  let depositRequested: Dec | null = null;
  let indicativeAfterDeposit: Dec | null = null;
  if (draft.depositPercent != null) {
    const percent = finite(draft.depositPercent, 'deposit percent');
    if (percent.lt(ZERO) || percent.gt(100)) {
      fail('invalid_deposit_percent', 'deposit percent must be between 0 and 100');
    }
    depositRequested = percentageOf(grandTotal, percent);
    indicativeAfterDeposit = grandTotal.minus(depositRequested);
  }

  let paidTotal = ZERO;
  for (const payment of draft.payments ?? []) {
    const amount = finite(payment.amount, 'payment amount');
    if (amount.lte(ZERO)) fail('invalid_payment', 'payment amount must be greater than zero');
    paidTotal = paidTotal.plus(quantizeMoney(amount));
  }
  if (paidTotal.gt(grandTotal)) fail('excess_payment', 'payments cannot exceed the grand total');

  return {
    sections,
    adjustments,
    itemsTotal,
    adjustmentsTotal,
    taxableBase,
    taxAmount,
    grandTotal,
    depositRequested,
    indicativeAfterDeposit,
    paidTotal,
    balanceDue: grandTotal.minus(paidTotal),
  };
}
