import { calculateDocument } from './calculate';
import { decimalText, moneyToString, type Dec } from './money';
import { buildSnapshot, type DocumentSnapshot } from './snapshot';
import type { DocumentDraft, DocumentType } from './types';

/**
 * From a document to its canonical snapshot (what the tradesman confirms and what issuance
 * freezes), and from a snapshot to the template's input. Wording is shaped, prices never touched.
 * Ported from the reference's `_document_payload` and `_render_payload_from_mapping`.
 */

/** The organization's header, as it is when the snapshot is taken (frozen at issuance). */
export interface Header {
  name: string;
  legalName?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  legalMentions?: string | null;
  rccm?: string | null;
  taxId?: string | null;
  currency: string;
  brandColor?: string | null;
  /** True when a logo is attached to the rendering. */
  hasLogo?: boolean;
}

export interface DocumentFacts {
  type: DocumentType;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  subject: string;
  client: { name: string; phone?: string | null; address?: string | null };
  validityDays: number;
  site?: string | null;
  delivery?: string | null;
  warranty?: string | null;
  assumptions?: string | null;
  revision: number;
  /** The number of the document it was converted from, if any. */
  sourceNumber?: string | null;
  sourceType?: DocumentType | null;
  draft: DocumentDraft;
  clauses: readonly { title: string; body: string }[];
  payments: readonly { amount: Dec; paidOn: string; method: string; reference?: string | null }[];
}

const DEFAULT_COLOR = '#A8391F';

/** French typography: the first letter upper-case, the rest as written. */
export function capitalizeInitial(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase('fr') + trimmed.slice(1) : trimmed;
}

/**
 * What each type is for — and so what it prints:
 * - a quote proposes a price, valid for a time, accepted by the client's signature;
 * - a proforma announces the invoice for the client's own procedures (a budget, a bank, customs):
 *   valid for a time, it may request a deposit, and has no accounting value;
 * - an invoice claims payment: no validity, no requested deposit — the payments received and the
 *   balance due speak instead.
 */
export const PROFORMA_MENTION = 'Facture proforma : document sans valeur comptable.';

function conditions(facts: DocumentFacts): { title: string; body: string; position: number }[] {
  const list = facts.clauses.map((clause, position) => ({ ...clause, position }));
  const extra: [string, string][] = [];
  if (facts.type === 'proforma') extra.push(['Proforma', PROFORMA_MENTION]);
  if (facts.warranty?.trim()) extra.push(['Garantie', `Garantie : ${facts.warranty.trim()}`]);
  for (const body of (facts.assumptions ?? '').split(/\r?\n/)) {
    if (body.trim()) extra.push(['Condition', body.trim()]);
  }
  const known = new Set(list.map((item) => item.body.trim().toLocaleLowerCase('fr')));
  for (const [title, body] of extra) {
    const key = body.toLocaleLowerCase('fr');
    if (known.has(key)) continue;
    list.push({ title, body, position: list.length });
    known.add(key);
  }
  return list;
}

/** The snapshot's document: every amount computed here, as canonical text. */
export function documentPayload(facts: DocumentFacts, header: Header): Record<string, unknown> {
  const calculation = calculateDocument(facts.draft);
  const issuerName = header.name.trim() || 'Atelier';
  const invoice = facts.type === 'invoice';
  return {
    type: facts.type,
    date: facts.date,
    issuer: {
      name: issuerName,
      legal_name: header.legalName ?? null,
      trade: header.trade ?? null,
      phone: header.phone ?? null,
      email: header.email ?? null,
      address: header.address ?? null,
      mentions: header.legalMentions ?? null,
      rccm: header.rccm ?? null,
      tax_id: header.taxId ?? null,
      currency: header.currency,
      color: header.brandColor ?? DEFAULT_COLOR,
      mark: issuerName.charAt(0).toLocaleUpperCase('fr') || 'F',
      logo: header.hasLogo ?? false,
    },
    client: {
      name: capitalizeInitial(facts.client.name),
      phone: facts.client.phone ?? null,
      address: facts.client.address ?? null,
    },
    object: facts.subject,
    validity_days: invoice ? null : facts.validityDays,
    site: facts.site ?? null,
    delivery: facts.delivery ?? null,
    warranty: facts.warranty ?? null,
    revision: facts.revision,
    origin: facts.sourceNumber
      ? { type: facts.sourceType ?? null, number: facts.sourceNumber }
      : null,
    sections: calculation.sections.map((section) => ({
      title: section.source.title ?? null,
      show_subtotal: section.source.showSubtotal ?? false,
      position: section.source.position,
      subtotal: moneyToString(section.subtotal),
      lines: section.lines.map(({ source, amount }) => ({
        label: capitalizeInitial(source.label),
        description: source.description ?? null,
        unit: source.unit ?? null,
        quantity: decimalText(source.quantity),
        unit_price: decimalText(source.unitPrice),
        flat_amount: decimalText(source.flatAmount),
        calculated: source.calculated ?? true,
        position: source.position,
        line_amount: amount === null ? null : moneyToString(amount),
      })),
    })),
    adjustments: calculation.adjustments.map(({ source, baseAmount, amount }) => ({
      label: source.label,
      mode: source.mode,
      sign: source.sign,
      base: source.base,
      section_id: source.sectionId ?? null,
      value: decimalText(source.value),
      base_amount: moneyToString(baseAmount),
      amount: moneyToString(amount),
      position: source.position,
    })),
    tax_rate:
      facts.draft.taxRate && !facts.draft.taxRate.isZero()
        ? decimalText(facts.draft.taxRate)
        : null,
    deposit_percent: invoice ? null : decimalText(facts.draft.depositPercent),
    payments: facts.payments.map((payment) => ({
      amount: moneyToString(payment.amount),
      paid_on: payment.paidOn,
      method: payment.method,
      reference: payment.reference ?? null,
    })),
    conditions: conditions(facts),
    items_total: moneyToString(calculation.itemsTotal),
    adjustments_total: moneyToString(calculation.adjustmentsTotal),
    taxable_base: moneyToString(calculation.taxableBase),
    tax_amount: calculation.taxAmount.isZero() ? null : moneyToString(calculation.taxAmount),
    grand_total: moneyToString(calculation.grandTotal),
    deposit_requested:
      invoice || calculation.depositRequested === null
        ? null
        : moneyToString(calculation.depositRequested),
    indicative_after_deposit:
      invoice || calculation.indicativeAfterDeposit === null
        ? null
        : moneyToString(calculation.indicativeAfterDeposit),
    paid_total: moneyToString(calculation.paidTotal),
    balance_due: moneyToString(calculation.balanceDue),
  };
}

export function draftSnapshot(facts: DocumentFacts, header: Header): DocumentSnapshot {
  return buildSnapshot(documentPayload(facts, header));
}

/** The issued snapshot: the confirmed preview, plus its number and issuance time. */
export function issuedSnapshot(
  facts: DocumentFacts,
  header: Header,
  issued: { number: string; issuedAt: string; confirmedPreviewSha256: string },
): DocumentSnapshot {
  return buildSnapshot({
    ...documentPayload(facts, header),
    number: issued.number,
    issued_at: issued.issuedAt,
    confirmed_preview_sha256: issued.confirmedPreviewSha256,
  });
}

/** How each type presents itself on paper: its title, its total, what the signature says. */
const TYPE_PRINT: Record<
  DocumentType,
  { title: string; signature: string; hint: string; total: string | null }
> = {
  quote: {
    title: 'DEVIS',
    signature: 'BON POUR ACCORD',
    hint: 'Date, nom et signature du client',
    total: null,
  },
  proforma: {
    title: 'FACTURE PROFORMA',
    signature: 'BON POUR COMMANDE',
    hint: 'Date, nom, signature et cachet du client',
    total: null,
  },
  invoice: {
    title: 'FACTURE',
    signature: 'POUR ACQUIT',
    hint: "Cachet et signature de l'émetteur",
    total: 'NET À PAYER',
  },
};

const ORIGIN_LABELS: Record<DocumentType, string> = {
  quote: 'Devis source',
  proforma: 'Proforma source',
  invoice: 'Facture source',
};

/** A decimal text as a template number: integers stay exact, decimals become numbers to print. */
function templateNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === 'object' ? (value as Json) : {};
const asList = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/**
 * The template's input from a snapshot's document. `number` is "BROUILLON" for a preview, which
 * the template marks as such.
 */
export function renderInput(
  document: Json,
  options: { number: string; logoPath?: string | null },
): Json {
  const issuer = asRecord(document.issuer);
  const type = String(document.type) as DocumentType;
  const origin = document.origin ? asRecord(document.origin) : null;
  const [year, month, day] = String(document.date).split('-');
  const print = TYPE_PRINT[type];
  const taxed = document.tax_rate !== null && document.tax_rate !== undefined;
  return {
    ...document,
    type: print.title,
    signature_label: print.signature,
    signature_hint: print.hint,
    // With a tax the template says TOTAL TTC; an invoice without tax says what is owed.
    ...(print.total && !taxed ? { total_label: print.total } : {}),
    number: options.number,
    date: `${day}.${month}.${year}`,
    issuer: { ...issuer, logo: options.logoPath ?? null, nif: issuer.tax_id ?? null },
    origin: origin
      ? {
          label: ORIGIN_LABELS[String(origin.type) as DocumentType] ?? 'Document source',
          number: origin.number,
        }
      : null,
    sections: asList(document.sections).map((section) => ({
      ...section,
      lines: asList(section.lines).map((line) => ({
        ...line,
        quantity: templateNumber(line.quantity),
        unit_price: templateNumber(line.unit_price),
        flat_amount: templateNumber(line.flat_amount),
      })),
    })),
    adjustments: asList(document.adjustments).map((adjustment) => ({
      ...adjustment,
      value: (templateNumber(adjustment.value) ?? 0) * Number(adjustment.sign ?? 1),
    })),
    tax_rate: templateNumber(document.tax_rate),
    deposit_percent: templateNumber(document.deposit_percent),
    payments: asList(document.payments).map((payment) => ({
      ...payment,
      amount: templateNumber(payment.amount),
    })),
    conditions: asList(document.conditions).map((condition) => String(condition.body ?? '')),
  };
}
