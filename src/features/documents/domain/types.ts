import type { Dec } from './money';

/** A quote, a proforma or an invoice: one anchor, three independent number series. */
export const DOCUMENT_TYPES = ['quote', 'proforma', 'invoice'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Draft, then issued (immutable), then the answer it received. */
export const DOCUMENT_STATES = [
  'draft',
  'issued',
  'accepted',
  'refused',
  'unanswered',
  'cancelled',
] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];

/** Labour, transport, a discount or a tax: an ordered adjustment, never a line. */
export type AdjustmentMode = 'fixed' | 'percent';
export type AdjustmentBase = 'section' | 'items_total' | 'taxable_base';

export interface DocumentLine {
  label: string;
  description?: string | null;
  unit?: string | null;
  quantity?: Dec | null;
  unitPrice?: Dec | null;
  flatAmount?: Dec | null;
  /** False for a descriptive line, which carries no amount. */
  calculated?: boolean;
  /** True while Firmo could not read a value and asks for it. */
  confirmationRequired?: boolean;
  position: number;
}

export interface DocumentSection {
  sectionId: string;
  title?: string | null;
  showSubtotal?: boolean;
  position: number;
  lines: readonly DocumentLine[];
}

export interface DocumentAdjustment {
  label: string;
  mode: AdjustmentMode;
  value: Dec;
  sign: 1 | -1;
  base: AdjustmentBase;
  sectionId?: string | null;
  position: number;
}

export interface DocumentDraft {
  sections: readonly DocumentSection[];
  adjustments?: readonly DocumentAdjustment[];
  taxRate?: Dec | null;
  depositPercent?: Dec | null;
  payments?: readonly { amount: Dec }[];
}

export interface CalculatedLine {
  source: DocumentLine;
  amount: Dec | null;
}

export interface CalculatedSection {
  source: DocumentSection;
  lines: readonly CalculatedLine[];
  subtotal: Dec;
}

export interface CalculatedAdjustment {
  source: DocumentAdjustment;
  baseAmount: Dec;
  amount: Dec;
}

export interface DocumentCalculation {
  sections: readonly CalculatedSection[];
  adjustments: readonly CalculatedAdjustment[];
  itemsTotal: Dec;
  adjustmentsTotal: Dec;
  taxableBase: Dec;
  taxAmount: Dec;
  grandTotal: Dec;
  depositRequested: Dec | null;
  indicativeAfterDeposit: Dec | null;
  paidTotal: Dec;
  balanceDue: Dec;
}
