import { sql } from 'drizzle-orm';
import { db, type Transaction } from '@/platform/db';
import type { Draft } from '../contracts';
import { Dec } from '../domain/money';
import type { SeriesCadence } from '../domain/numbering';
import type { Header } from '../domain/presentation';
import type {
  AdjustmentBase,
  AdjustmentMode,
  DocumentDraft,
  DocumentState,
  DocumentType,
} from '../domain/types';

/**
 * SQL for the documents feature. Every function runs inside `inOrganization`, so row-level
 * security limits it to that organization; `organizationId` is written, never trusted for reads.
 */

type Row = Record<string, unknown>;
const dec = (value: unknown) =>
  value === null || value === undefined ? null : new Dec(String(value));
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

async function rows<T extends Row>(tx: Transaction, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await tx.execute(query);
  return result.rows as T[];
}

export interface StoredLine {
  label: string;
  description: string | null;
  unit: string | null;
  quantity: Dec | null;
  unitPrice: Dec | null;
  flatAmount: Dec | null;
  calculated: boolean;
  confirmationRequired: boolean;
  position: number;
}

export interface StoredSection {
  id: number;
  title: string | null;
  showSubtotal: boolean;
  position: number;
  lines: StoredLine[];
}

export interface StoredDocument {
  id: number;
  type: DocumentType;
  state: DocumentState;
  number: string | null;
  subject: string;
  clientId: number | null;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
  documentDate: string;
  validityDays: number;
  site: string | null;
  delivery: string | null;
  warranty: string | null;
  assumptions: string | null;
  depositPercent: Dec | null;
  taxRate: Dec | null;
  snapshot: Row | null;
  snapshotSha256: string | null;
  templateVersion: string | null;
  pdfKey: string | null;
  pdfSha256: string | null;
  issuedAt: string | null;
  rootDocumentId: number | null;
  revision: number;
  sourceDocumentId: number | null;
  sections: StoredSection[];
  adjustments: {
    label: string;
    mode: AdjustmentMode;
    sign: 1 | -1;
    base: AdjustmentBase;
    baseSectionId: number | null;
    value: Dec;
    position: number;
  }[];
  clauses: { clauseId: number | null; title: string; body: string; position: number }[];
  payments: { amount: Dec; paidOn: string; method: string; reference: string | null }[];
}

export interface StoredProfile extends Header {
  logoKey: string | null;
  defaultWarranty: string | null;
  defaultDelivery: string | null;
  defaultDepositPercent: Dec | null;
  defaultValidityDays: number;
  /** How his clients pay him, printed on his invoices. */
  paymentInstructions: string | null;
  /** Whether the conversation already asked it (once). */
  paymentAsked: boolean;
}

// --- Profile -------------------------------------------------------------------------------

export async function loadProfile(tx: Transaction): Promise<StoredProfile | null> {
  const [row] = await rows(tx, sql`select * from organization_profiles`);
  if (!row) return null;
  return {
    name: String(row.name),
    legalName: str(row.legal_name),
    trade: str(row.trade),
    phone: str(row.phone),
    email: str(row.email),
    address: str(row.address),
    legalMentions: str(row.legal_mentions),
    rccm: str(row.rccm),
    taxId: str(row.tax_id),
    currency: String(row.currency),
    brandColor: str(row.brand_color),
    logoKey: str(row.logo_key),
    defaultWarranty: str(row.default_warranty),
    defaultDelivery: str(row.default_delivery),
    defaultDepositPercent: dec(row.default_deposit_percent),
    defaultValidityDays: Number(row.default_validity_days),
    paymentInstructions: str(row.payment_instructions),
    paymentAsked: row.payment_asked === true,
  };
}

export async function saveProfile(
  tx: Transaction,
  organizationId: string,
  p: {
    name: string;
    legalName: string | null;
    trade: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    legalMentions: string | null;
    rccm: string | null;
    taxId: string | null;
    brandColor: string | null;
    defaultWarranty: string | null;
    defaultDelivery: string | null;
    defaultDepositPercent: string | null;
    defaultValidityDays: number | null;
    paymentInstructions: string | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into organization_profiles (
      organization_id, name, legal_name, trade, phone, email, address, legal_mentions, rccm,
      tax_id, brand_color, default_warranty, default_delivery, default_deposit_percent,
      default_validity_days, payment_instructions, payment_asked)
    values (${organizationId}, ${p.name}, ${p.legalName}, ${p.trade}, ${p.phone}, ${p.email},
      ${p.address}, ${p.legalMentions}, ${p.rccm}, ${p.taxId}, ${p.brandColor},
      ${p.defaultWarranty}, ${p.defaultDelivery}, ${p.defaultDepositPercent},
      ${p.defaultValidityDays ?? 30}, ${p.paymentInstructions}, ${p.paymentInstructions !== null})
    on conflict (organization_id) do update set
      name = excluded.name, legal_name = excluded.legal_name, trade = excluded.trade,
      phone = excluded.phone, email = excluded.email, address = excluded.address,
      legal_mentions = excluded.legal_mentions, rccm = excluded.rccm, tax_id = excluded.tax_id,
      brand_color = excluded.brand_color, default_warranty = excluded.default_warranty,
      default_delivery = excluded.default_delivery,
      default_deposit_percent = excluded.default_deposit_percent,
      default_validity_days = excluded.default_validity_days,
      payment_instructions = excluded.payment_instructions,
      payment_asked = organization_profiles.payment_asked or excluded.payment_asked,
      updated_at = now()`);
}

/** The name documents leave under; the rest of the profile is kept as it is. */
export async function setIssuerName(
  tx: Transaction,
  organizationId: string,
  name: string,
): Promise<void> {
  await tx.execute(sql`
    insert into organization_profiles (organization_id, name) values (${organizationId}, ${name})
    on conflict (organization_id) do update set name = excluded.name, updated_at = now()`);
}

/** How his clients pay him — or null when he said he does not want it printed. Asked once. */
export async function setPaymentInstructions(
  tx: Transaction,
  instructions: string | null,
): Promise<boolean> {
  const result = await tx.execute(sql`
    update organization_profiles
    set payment_instructions = ${instructions}, payment_asked = true, updated_at = now()`);
  return (result.rowCount ?? 0) > 0;
}

/** The last issued document (any state after issuance), or null. */
export async function latestIssuedId(tx: Transaction): Promise<number | null> {
  const [row] = await rows<{ id: string }>(
    tx,
    sql`select id from documents where state <> 'draft' order by issued_at desc, id desc limit 1`,
  );
  return row ? Number(row.id) : null;
}

/**
 * Serializes the organization's issuances until the transaction ends: the quota is counted and
 * consumed under this lock, so two issuances never share the last document.
 */
export async function lockIssuances(tx: Transaction, organizationId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`firmo.issue:${organizationId}`}, 0))`,
  );
}

/** First issuances (a correction /R2 excluded), optionally since a date, after the first few. */
export async function countFirstIssuances(
  tx: Transaction,
  options: { since?: Date; excludingFirst?: number } = {},
): Promise<number> {
  const since = options.since ? options.since.toISOString() : null;
  const [row] = await rows<{ count: string }>(
    tx,
    sql`select count(*) as count from (
          select issued_at from documents
          where revision = 1 and issued_at is not null
          order by issued_at, id
          offset ${options.excludingFirst ?? 0}
        ) as counted
        where ${since}::timestamptz is null or issued_at >= ${since}::timestamptz`,
  );
  return Number(row?.count ?? 0);
}

export async function setLogoKey(tx: Transaction, logoKey: string | null): Promise<boolean> {
  const result = await tx.execute(
    sql`update organization_profiles set logo_key = ${logoKey}, updated_at = now()`,
  );
  return (result.rowCount ?? 0) > 0;
}

// --- Documents -----------------------------------------------------------------------------

function documentRow(
  row: Row,
): Omit<StoredDocument, 'sections' | 'adjustments' | 'clauses' | 'payments'> {
  return {
    id: Number(row.id),
    type: row.type as DocumentType,
    state: row.state as DocumentState,
    number: str(row.number),
    subject: String(row.subject),
    clientId: row.client_id === null ? null : Number(row.client_id),
    clientName: String(row.client_name),
    clientPhone: str(row.client_phone),
    clientAddress: str(row.client_address),
    documentDate: String(row.document_date),
    validityDays: Number(row.validity_days),
    site: str(row.site),
    delivery: str(row.delivery_text),
    warranty: str(row.warranty_text),
    assumptions: str(row.assumptions),
    depositPercent: dec(row.deposit_percent),
    taxRate: dec(row.tax_rate),
    snapshot: (row.snapshot as Row | null) ?? null,
    snapshotSha256: str(row.snapshot_sha256),
    templateVersion: str(row.template_version),
    pdfKey: str(row.pdf_key),
    pdfSha256: str(row.pdf_sha256),
    issuedAt: row.issued_at === null ? null : new Date(String(row.issued_at)).toISOString(),
    rootDocumentId: row.root_document_id === null ? null : Number(row.root_document_id),
    revision: Number(row.revision),
    sourceDocumentId: row.source_document_id === null ? null : Number(row.source_document_id),
  };
}

export async function loadDocument(
  tx: Transaction,
  id: number,
  options: { lock?: boolean } = {},
): Promise<StoredDocument | null> {
  const [row] = await rows(
    tx,
    options.lock
      ? sql`select *, document_date::text as document_date from documents where id = ${id} for update`
      : sql`select *, document_date::text as document_date from documents where id = ${id}`,
  );
  if (!row) return null;
  const sectionRows = await rows(
    tx,
    sql`select * from document_sections where document_id = ${id} order by position`,
  );
  const lineRows = await rows(
    tx,
    sql`select l.* from document_lines l join document_sections s on s.id = l.section_id
        where s.document_id = ${id} order by l.position`,
  );
  const adjustmentRows = await rows(
    tx,
    sql`select * from document_adjustments where document_id = ${id} order by position`,
  );
  const clauseRows = await rows(
    tx,
    sql`select * from document_clauses where document_id = ${id} order by position`,
  );
  const paymentRows = await rows(
    tx,
    sql`select amount, paid_on::text as paid_on, method, reference from document_payments
        where document_id = ${id} order by paid_on, id`,
  );
  return {
    ...documentRow(row),
    sections: sectionRows.map((section) => ({
      id: Number(section.id),
      title: str(section.title),
      showSubtotal: Boolean(section.show_subtotal),
      position: Number(section.position),
      lines: lineRows
        .filter((line) => Number(line.section_id) === Number(section.id))
        .map((line) => ({
          label: String(line.label),
          description: str(line.description),
          unit: str(line.unit),
          quantity: dec(line.quantity),
          unitPrice: dec(line.unit_price),
          flatAmount: dec(line.flat_amount),
          calculated: Boolean(line.calculated),
          confirmationRequired: Boolean(line.confirmation_required),
          position: Number(line.position),
        })),
    })),
    adjustments: adjustmentRows.map((adjustment) => ({
      label: String(adjustment.label),
      mode: adjustment.mode as AdjustmentMode,
      sign: Number(adjustment.sign) === -1 ? -1 : 1,
      base: adjustment.base as AdjustmentBase,
      baseSectionId:
        adjustment.base_section_id === null ? null : Number(adjustment.base_section_id),
      value: new Dec(String(adjustment.value)),
      position: Number(adjustment.position),
    })),
    clauses: clauseRows.map((clause) => ({
      clauseId: clause.clause_id === null ? null : Number(clause.clause_id),
      title: String(clause.title),
      body: String(clause.body),
      position: Number(clause.position),
    })),
    payments: paymentRows.map((payment) => ({
      amount: new Dec(String(payment.amount)),
      paidOn: String(payment.paid_on),
      method: String(payment.method),
      reference: str(payment.reference),
    })),
  };
}

/** The document's lines as the calculation reads them. */
export function draftOf(document: StoredDocument): DocumentDraft {
  return {
    sections: document.sections.map((section) => ({
      sectionId: String(section.id),
      title: section.title,
      showSubtotal: section.showSubtotal,
      position: section.position,
      lines: section.lines,
    })),
    adjustments: document.adjustments.map((adjustment) => ({
      label: adjustment.label,
      mode: adjustment.mode,
      value: adjustment.value,
      sign: adjustment.sign,
      base: adjustment.base,
      sectionId: adjustment.baseSectionId === null ? null : String(adjustment.baseSectionId),
      position: adjustment.position,
    })),
    taxRate: document.taxRate,
    depositPercent: document.depositPercent,
    payments: document.payments.map((payment) => ({ amount: payment.amount })),
  };
}

export interface DocumentSummary {
  id: number;
  type: DocumentType;
  state: DocumentState;
  number: string | null;
  subject: string;
  clientName: string;
  documentDate: string;
  validityDays: number;
  updatedAt: string;
}

export async function listDocuments(tx: Transaction, limit: number): Promise<DocumentSummary[]> {
  const result = await rows(
    tx,
    sql`select id, type, state, number, subject, client_name, document_date::text as document_date,
               validity_days, updated_at
        from documents order by updated_at desc, id desc limit ${limit}`,
  );
  return result.map((row) => ({
    id: Number(row.id),
    type: row.type as DocumentType,
    state: row.state as DocumentState,
    number: str(row.number),
    subject: String(row.subject),
    clientName: String(row.client_name),
    documentDate: String(row.document_date),
    validityDays: Number(row.validity_days),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export interface Lineage {
  rootDocumentId?: number | null;
  revision?: number;
  sourceDocumentId?: number | null;
}

export async function insertDocument(
  tx: Transaction,
  organizationId: string,
  draft: Draft,
  defaults: { validityDays: number; documentDate: string },
  lineage: Lineage = {},
): Promise<number> {
  const [row] = await rows<{ id: number }>(
    tx,
    sql`insert into documents (
          organization_id, type, subject, client_id, client_name, client_phone, client_address,
          document_date, validity_days, site, delivery_text, warranty_text, assumptions,
          deposit_percent, tax_rate, root_document_id, revision, source_document_id)
        values (${organizationId}, ${draft.type}, ${draft.subject}, ${draft.clientId ?? null},
          ${draft.client.name}, ${draft.client.phone}, ${draft.client.address},
          ${draft.documentDate ?? defaults.documentDate}, ${draft.validityDays ?? defaults.validityDays},
          ${draft.site}, ${draft.delivery}, ${draft.warranty}, ${draft.assumptions},
          ${draft.depositPercent ?? null}, ${draft.taxRate ?? null},
          ${lineage.rootDocumentId ?? null}, ${lineage.revision ?? 1},
          ${lineage.sourceDocumentId ?? null})
        returning id`,
  );
  const id = Number(row?.id);
  await insertContent(tx, organizationId, id, draft);
  return id;
}

/** Replaces the facts and content of a draft; the database refuses it for an issued document. */
export async function replaceDraft(
  tx: Transaction,
  organizationId: string,
  id: number,
  draft: Draft,
): Promise<void> {
  await tx.execute(sql`
    update documents set type = ${draft.type}, subject = ${draft.subject},
      client_id = ${draft.clientId ?? null}, client_name = ${draft.client.name},
      client_phone = ${draft.client.phone}, client_address = ${draft.client.address},
      document_date = coalesce(${draft.documentDate ?? null}::date, document_date),
      validity_days = coalesce(${draft.validityDays ?? null}::integer, validity_days),
      site = ${draft.site}, delivery_text = ${draft.delivery}, warranty_text = ${draft.warranty},
      assumptions = ${draft.assumptions}, deposit_percent = ${draft.depositPercent ?? null},
      tax_rate = ${draft.taxRate ?? null}, updated_at = now()
    where id = ${id} and state = 'draft'`);
  await tx.execute(sql`delete from document_adjustments where document_id = ${id}`);
  await tx.execute(sql`delete from document_clauses where document_id = ${id}`);
  await tx.execute(sql`delete from document_sections where document_id = ${id}`);
  await insertContent(tx, organizationId, id, draft);
}

async function insertContent(
  tx: Transaction,
  organizationId: string,
  documentId: number,
  draft: Draft,
): Promise<void> {
  const sectionIds: number[] = [];
  for (const [position, section] of draft.sections.entries()) {
    const [row] = await rows<{ id: number }>(
      tx,
      sql`insert into document_sections (organization_id, document_id, title, show_subtotal, position)
          values (${organizationId}, ${documentId}, ${section.title}, ${section.showSubtotal}, ${position})
          returning id`,
    );
    const sectionId = Number(row?.id);
    sectionIds.push(sectionId);
    for (const [linePosition, line] of section.lines.entries()) {
      await tx.execute(sql`
        insert into document_lines (organization_id, section_id, label, description, unit,
          quantity, unit_price, flat_amount, calculated, confirmation_required, position)
        values (${organizationId}, ${sectionId}, ${line.label}, ${line.description}, ${line.unit},
          ${line.quantity ?? null}, ${line.unitPrice ?? null}, ${line.flatAmount ?? null},
          ${line.calculated}, ${line.confirmationRequired}, ${linePosition})`);
    }
  }
  for (const [position, adjustment] of draft.adjustments.entries()) {
    const baseSectionId =
      adjustment.base === 'section' ? (sectionIds[adjustment.sectionIndex ?? -1] ?? null) : null;
    await tx.execute(sql`
      insert into document_adjustments (organization_id, document_id, label, mode, sign, base,
        base_section_id, value, position)
      values (${organizationId}, ${documentId}, ${adjustment.label}, ${adjustment.mode},
        ${adjustment.sign}, ${adjustment.base}, ${baseSectionId}, ${adjustment.value}, ${position})`);
  }
  // Only this organization's clauses are visible here (RLS): a foreign id copies nothing.
  let clausePosition = 0;
  for (const clauseId of draft.clauseIds ?? []) {
    const result = await tx.execute(sql`
      insert into document_clauses (organization_id, document_id, clause_id, title, body, position)
      select ${organizationId}, ${documentId}, c.id, c.title, c.body, ${clausePosition}
      from clauses c where c.id = ${clauseId} and c.archived_at is null`);
    clausePosition += result.rowCount ?? 0;
  }
}

/** A stored document back into a draft, to convert or revise it without retyping. */
export function draftFromStored(document: StoredDocument, type: DocumentType): Draft {
  const sectionIndex = new Map(document.sections.map((section, index) => [section.id, index]));
  return {
    type,
    subject: document.subject,
    client: {
      name: document.clientName,
      phone: document.clientPhone,
      address: document.clientAddress,
    },
    clientId: document.clientId,
    documentDate: null,
    validityDays: document.validityDays,
    site: document.site,
    delivery: document.delivery,
    warranty: document.warranty,
    assumptions: document.assumptions,
    depositPercent: document.depositPercent?.toFixed() ?? null,
    taxRate: document.taxRate?.toFixed() ?? null,
    sections: document.sections.map((section) => ({
      title: section.title,
      showSubtotal: section.showSubtotal,
      lines: section.lines.map((line) => ({
        label: line.label,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity?.toFixed() ?? null,
        unitPrice: line.unitPrice?.toFixed() ?? null,
        flatAmount: line.flatAmount?.toFixed() ?? null,
        calculated: line.calculated,
        confirmationRequired: line.confirmationRequired,
      })),
    })),
    adjustments: document.adjustments.map((adjustment) => ({
      label: adjustment.label,
      mode: adjustment.mode,
      value: adjustment.value.toFixed(),
      sign: adjustment.sign,
      base: adjustment.base,
      sectionIndex:
        adjustment.baseSectionId === null
          ? null
          : (sectionIndex.get(adjustment.baseSectionId) ?? null),
    })),
    clauseIds: document.clauses.flatMap((clause) => (clause.clauseId ? [clause.clauseId] : [])),
  };
}

export async function copyClausesFrom(
  tx: Transaction,
  organizationId: string,
  sourceId: number,
  targetId: number,
): Promise<void> {
  await tx.execute(sql`delete from document_clauses where document_id = ${targetId}`);
  await tx.execute(sql`
    insert into document_clauses (organization_id, document_id, clause_id, title, body, position)
    select ${organizationId}, ${targetId}, clause_id, title, body, position
    from document_clauses where document_id = ${sourceId}`);
}

// --- Numbering -----------------------------------------------------------------------------

const DEFAULT_PREFIX: Record<DocumentType, string> = {
  quote: 'DEV',
  proforma: 'PRO',
  invoice: 'FAC',
};

export async function numberingOf(
  tx: Transaction,
  type: DocumentType,
): Promise<{ prefix: string; separator: string; cadence: SeriesCadence; width: number }> {
  const [row] = await rows(tx, sql`select * from numbering_settings where document_type = ${type}`);
  if (!row) return { prefix: DEFAULT_PREFIX[type], separator: '-', cadence: 'annual', width: 3 };
  return {
    prefix: String(row.prefix),
    separator: String(row.separator),
    cadence: row.cadence as SeriesCadence,
    width: Number(row.width),
  };
}

/** Locks the series' counter until commit: two issuances never share a number. */
export async function lockCounter(
  tx: Transaction,
  organizationId: string,
  type: DocumentType,
  year: number,
): Promise<number> {
  await tx.execute(sql`
    insert into document_counters (organization_id, document_type, year)
    values (${organizationId}, ${type}, ${year}) on conflict do nothing`);
  const [row] = await rows<{ last_value: string }>(
    tx,
    sql`select last_value from document_counters
        where document_type = ${type} and year = ${year} for update`,
  );
  return Number(row?.last_value ?? 0);
}

export async function advanceCounter(
  tx: Transaction,
  type: DocumentType,
  year: number,
  value: number,
): Promise<void> {
  await tx.execute(sql`
    update document_counters set last_value = ${value}
    where document_type = ${type} and year = ${year} and last_value < ${value}`);
}

export async function numberExists(
  tx: Transaction,
  type: DocumentType,
  number: string,
): Promise<boolean> {
  const [row] = await rows(
    tx,
    sql`select 1 from documents where type = ${type} and number = ${number}`,
  );
  return Boolean(row);
}

export async function rootNumber(tx: Transaction, rootId: number): Promise<string | null> {
  const [row] = await rows(tx, sql`select number from documents where id = ${rootId}`);
  return str(row?.number);
}

export async function nextRevision(tx: Transaction, rootId: number): Promise<number> {
  const [row] = await rows<{ revision: number }>(
    tx,
    sql`select coalesce(max(revision), 1) + 1 as revision from documents
        where id = ${rootId} or root_document_id = ${rootId}`,
  );
  return Number(row?.revision ?? 2);
}

// --- Issuance, answers, payments -----------------------------------------------------------

export async function markIssued(
  tx: Transaction,
  id: number,
  issued: {
    number: string;
    issuedAt: string;
    snapshot: string;
    snapshotSha256: string;
    templateVersion: string;
    pdfKey: string;
    pdfSha256: string;
    manualNumber: boolean;
  },
): Promise<void> {
  await tx.execute(sql`
    update documents set state = 'issued', number = ${issued.number}, issued_at = ${issued.issuedAt},
      snapshot = ${issued.snapshot}::jsonb, snapshot_sha256 = ${issued.snapshotSha256},
      template_version = ${issued.templateVersion}, pdf_key = ${issued.pdfKey},
      pdf_sha256 = ${issued.pdfSha256}, manual_number = ${issued.manualNumber}, updated_at = now()
    where id = ${id} and state = 'draft'`);
}

export async function setState(tx: Transaction, id: number, state: DocumentState): Promise<void> {
  await tx.execute(sql`update documents set state = ${state}, updated_at = now() where id = ${id}`);
}

export async function insertPayment(
  tx: Transaction,
  organizationId: string,
  id: number,
  payment: {
    amount: string;
    paidOn: string;
    method: string;
    reference: string | null;
    balanceAfter: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into document_payments (organization_id, document_id, amount, paid_on, method, reference,
      balance_after)
    values (${organizationId}, ${id}, ${payment.amount}, ${payment.paidOn}, ${payment.method},
      ${payment.reference}, ${payment.balanceAfter})`);
}

/** What he priced, remembered as he wrote it — for his memory, never to suggest a price. */
export async function rememberItems(
  tx: Transaction,
  organizationId: string,
  items: { label: string; unit: string | null; unitPrice: string | null }[],
): Promise<void> {
  for (const item of items) {
    await tx.execute(sql`
      insert into frequent_items (organization_id, label, unit, last_price, last_seen_at)
      values (${organizationId}, ${item.label}, ${item.unit}, ${item.unitPrice}, now())
      on conflict (organization_id, lower(btrim(label)), coalesce(lower(btrim(unit)), ''))
      do update set last_price = coalesce(excluded.last_price, frequent_items.last_price),
                    last_seen_at = now()`);
  }
}

// --- Clauses, numbering, shares ------------------------------------------------------------

export interface StoredClause {
  id: number;
  title: string;
  body: string;
  enabledByDefault: boolean;
}

export async function listClauses(tx: Transaction): Promise<StoredClause[]> {
  const result = await rows(
    tx,
    sql`select id, title, body, enabled_by_default from clauses where archived_at is null order by id`,
  );
  return result.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    body: String(row.body),
    enabledByDefault: Boolean(row.enabled_by_default),
  }));
}

export async function saveClause(
  tx: Transaction,
  organizationId: string,
  clause: { id?: number | null; title: string; body: string; enabledByDefault: boolean },
): Promise<number> {
  if (clause.id) {
    const result = await rows<{ id: string }>(
      tx,
      sql`update clauses set title = ${clause.title}, body = ${clause.body},
            enabled_by_default = ${clause.enabledByDefault}, updated_at = now()
          where id = ${clause.id} and archived_at is null returning id`,
    );
    return result[0] ? Number(result[0].id) : 0;
  }
  const [row] = await rows<{ id: string }>(
    tx,
    sql`insert into clauses (organization_id, title, body, enabled_by_default)
        values (${organizationId}, ${clause.title}, ${clause.body}, ${clause.enabledByDefault})
        returning id`,
  );
  return Number(row?.id);
}

export async function archiveClause(tx: Transaction, id: number): Promise<boolean> {
  const result = await tx.execute(
    sql`update clauses set archived_at = now() where id = ${id} and archived_at is null`,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function defaultClauseIds(tx: Transaction): Promise<number[]> {
  const result = await rows<{ id: string }>(
    tx,
    sql`select id from clauses where enabled_by_default and archived_at is null order by id`,
  );
  return result.map((row) => Number(row.id));
}

export async function saveNumbering(
  tx: Transaction,
  organizationId: string,
  type: DocumentType,
  settings: { prefix: string; separator: string; cadence: SeriesCadence; width: number },
): Promise<void> {
  await tx.execute(sql`
    insert into numbering_settings (organization_id, document_type, prefix, separator, cadence, width)
    values (${organizationId}, ${type}, ${settings.prefix}, ${settings.separator},
            ${settings.cadence}, ${settings.width})
    on conflict (organization_id, document_type) do update set
      prefix = excluded.prefix, separator = excluded.separator, cadence = excluded.cadence,
      width = excluded.width, updated_at = now()`);
}

export async function createShare(
  tx: Transaction,
  organizationId: string,
  documentId: number,
  tokenHash: string,
): Promise<void> {
  await tx.execute(
    sql`update document_shares set revoked_at = now()
        where document_id = ${documentId} and revoked_at is null`,
  );
  await tx.execute(sql`
    insert into document_shares (organization_id, document_id, token_hash)
    values (${organizationId}, ${documentId}, ${tokenHash})`);
}

export async function revokeShares(tx: Transaction, documentId: number): Promise<void> {
  await tx.execute(
    sql`update document_shares set revoked_at = now()
        where document_id = ${documentId} and revoked_at is null`,
  );
}

export async function shareOf(
  tx: Transaction,
  documentId: number,
): Promise<{ active: boolean; viewCount: number; lastOpenedAt: string | null }> {
  const [row] = await rows(
    tx,
    sql`select coalesce(sum(view_count), 0)::int as views,
               bool_or(revoked_at is null) as active,
               max(last_opened_at) as last_opened
        from document_shares where document_id = ${documentId}`,
  );
  return {
    active: row?.active === true,
    viewCount: Number(row?.views ?? 0),
    lastOpenedAt: row?.last_opened ? new Date(String(row.last_opened)).toISOString() : null,
  };
}

/** Opens a share by its token's hash, outside any organization: only through the definer function. */
export async function openShare(
  tokenHash: string,
): Promise<{ pdfKey: string; number: string } | null> {
  const result = await db.execute(
    sql`select pdf_key, number from public.open_document_share(${tokenHash})`,
  );
  const row = result.rows[0] as { pdf_key: string; number: string } | undefined;
  return row ? { pdfKey: row.pdf_key, number: row.number } : null;
}
