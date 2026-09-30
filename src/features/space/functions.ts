import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  calculateDocument,
  DocumentError,
  isExpired,
  validUntil,
  moneyToString,
  type Dec,
  type DocumentState,
  type DocumentType,
  type DraftInput,
} from '@/features/documents';
import { FREE_DOCUMENTS, PERIOD_DAYS, PERIOD_DOCUMENTS } from '@/features/plans';
import { env } from '@/platform/env';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';

/**
 * The web space's server functions. Each one finds the person from her session — never from its
 * input — and works in her organization only (constitution III).
 */
async function member() {
  const signedIn = await currentMember(getRequest());
  if (!signedIn) throw new Error('unauthenticated');
  return { actor: { organizationId: signedIn.organizationId }, name: signedIn.name };
}

/** The channels where he creates documents, from Firmo's configuration. */
function channelLinks() {
  const whatsapp = process.env.FIRMO_WHATSAPP_NUMBER?.replace(/\D/g, '');
  const telegram = process.env.FIRMO_TELEGRAM_BOT?.replace(/^@/, '');
  return {
    whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : null,
    telegram: telegram ? `https://t.me/${telegram}` : null,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

const failure = (error: unknown) => {
  if (error instanceof DocumentError) return { ok: false as const, reason: error.code };
  throw error;
};

/** Who is in Firmo's web space: signed out, or a member of her organization. */
export const fetchMember = createServerFn({ method: 'GET' }).handler(async () => {
  const signedIn = await currentMember(getRequest());
  if (!signedIn) return { status: 'signed_out' as const };
  const profile = await services().documents.profile({ organizationId: signedIn.organizationId });
  return {
    status: 'member' as const,
    name: signedIn.name,
    organizationName: profile?.name ?? null,
    channels: channelLinks(),
  };
});

export interface DocumentRow {
  id: number;
  type: DocumentType;
  state: DocumentState;
  number: string | null;
  subject: string;
  clientName: string;
  updatedAt: string;
  /** An issued quote or proforma past its validity without an answer. */
  expired: boolean;
}

export const fetchDocuments = createServerFn({ method: 'GET' }).handler(async () => {
  const { actor } = await member();
  const rows = await services().documents.list(actor, 200);
  const day = today();
  return rows.map((row): DocumentRow => ({
    expired: isExpired(row.type, row.state, row.documentDate, row.validityDays, day),
    id: row.id,
    type: row.type,
    state: row.state,
    number: row.number,
    subject: row.subject,
    clientName: row.clientName,
    updatedAt: row.updatedAt,
  }));
});

const idInput = z.object({ id: z.number().int().positive() });
const text = (value: Dec | null) => (value === null ? null : value.toFixed());

export const fetchDocument = createServerFn({ method: 'GET' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    const { documents } = services();
    let document;
    try {
      document = await documents.get(actor, data.id);
    } catch (error) {
      // Another organization's document is not found — never forbidden (constitution III).
      if (error instanceof DocumentError && error.code === 'not_found') return null;
      throw error;
    }
    let totals: { grandTotal: string; balanceDue: string; paidTotal: string } | null = null;
    const subtotals: Record<string, string> = {};
    try {
      const calculation = calculateDocument(
        {
          sections: document.sections.map((section) => ({
            sectionId: String(section.id),
            title: section.title,
            showSubtotal: section.showSubtotal,
            position: section.position,
            lines: section.lines,
          })),
          adjustments: document.adjustments.map((a) => ({
            label: a.label,
            mode: a.mode,
            value: a.value,
            sign: a.sign,
            base: a.base,
            sectionId: a.baseSectionId === null ? null : String(a.baseSectionId),
            position: a.position,
          })),
          taxRate: document.taxRate,
          depositPercent: document.depositPercent,
          payments: document.payments.map((p) => ({ amount: p.amount })),
        },
        { requireConfirmation: false },
      );
      totals = {
        grandTotal: moneyToString(calculation.grandTotal),
        balanceDue: moneyToString(calculation.balanceDue),
        paidTotal: moneyToString(calculation.paidTotal),
      };
      for (const section of calculation.sections) {
        subtotals[section.source.sectionId] = moneyToString(section.subtotal);
      }
    } catch {
      totals = null;
    }
    const share = document.state === 'draft' ? null : await documents.shareStatus(actor, data.id);
    return {
      id: document.id,
      type: document.type,
      state: document.state,
      number: document.number,
      subject: document.subject,
      client: {
        name: document.clientName,
        phone: document.clientPhone,
        address: document.clientAddress,
      },
      validityDays: document.validityDays,
      validUntil: validUntil(document.type, document.documentDate, document.validityDays),
      expired: isExpired(
        document.type,
        document.state,
        document.documentDate,
        document.validityDays,
        today(),
      ),
      paid:
        document.type === 'invoice' &&
        document.state === 'issued' &&
        totals !== null &&
        totals.balanceDue === '0',
      site: document.site,
      delivery: document.delivery,
      warranty: document.warranty,
      assumptions: document.assumptions,
      depositPercent: text(document.depositPercent),
      taxRate: text(document.taxRate),
      sections: document.sections.map((section) => ({
        id: section.id,
        title: section.title,
        showSubtotal: section.showSubtotal,
        subtotal: subtotals[String(section.id)] ?? null,
        lines: section.lines.map((line) => ({
          label: line.label,
          description: line.description,
          unit: line.unit,
          quantity: text(line.quantity),
          unitPrice: text(line.unitPrice),
          flatAmount: text(line.flatAmount),
          calculated: line.calculated,
        })),
      })),
      adjustments: document.adjustments.map((a) => ({
        label: a.label,
        mode: a.mode,
        value: a.value.toFixed(),
        sign: a.sign,
        base: a.base,
      })),
      clauses: document.clauses.map((c) => ({ title: c.title, body: c.body })),
      payments: document.payments.map((p) => ({
        amount: p.amount.toFixed(0),
        paidOn: p.paidOn,
        method: p.method,
      })),
      totals,
      share,
      channels: channelLinks(),
    };
  });

export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof fetchDocument>>>;

const draftSchema = z.custom<DraftInput>((value) => typeof value === 'object' && value !== null);

export const saveDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ id: z.number().int().positive(), draft: draftSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      await services().documents.updateDraft(actor, data.id, data.draft);
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

/** The snapshot the person is about to confirm: its hash, once she saw the preview. */
export const prepareIssue = createServerFn({ method: 'POST' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      return { ok: true as const, sha256: await services().documents.previewHash(actor, data.id) };
    } catch (error) {
      return failure(error);
    }
  });

export const issueDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({ id: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      const issued = await services().documents.issue(actor, data.id, { sha256: data.sha256 });
      return { ok: true as const, number: issued.number };
    } catch (error) {
      return failure(error);
    }
  });

export const convertDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({ id: z.number().int().positive(), target: z.enum(['proforma', 'invoice']) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      return {
        ok: true as const,
        id: await services().documents.convert(actor, data.id, data.target),
      };
    } catch (error) {
      return failure(error);
    }
  });

export const reviseDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      return { ok: true as const, id: await services().documents.revise(actor, data.id) };
    } catch (error) {
      return failure(error);
    }
  });

export const answerDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        state: z.enum(['accepted', 'refused', 'unanswered', 'cancelled']),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      await services().documents.answer(actor, data.id, data.state);
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export const recordPayment = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        amount: z.string(),
        paidOn: z.string(),
        method: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      const result = await services().documents.recordPayment(actor, data.id, {
        amount: data.amount.replace(/[\s\u00a0\u202f]/g, ''),
        paidOn: data.paidOn,
        method: data.method,
      });
      return { ok: true as const, ...result };
    } catch (error) {
      return failure(error);
    }
  });

export const shareDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      const { token } = await services().documents.share(actor, data.id);
      return { ok: true as const, url: `${process.env.FIRMO_URL ?? ''}/d/${token}` };
    } catch (error) {
      return failure(error);
    }
  });

export const revokeShare = createServerFn({ method: 'POST' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    await services().documents.revokeShare(actor, data.id);
    return { ok: true as const };
  });

// --- Presentation --------------------------------------------------------------------------------

export const fetchPresentation = createServerFn({ method: 'GET' }).handler(async () => {
  const { actor } = await member();
  const { documents } = services();
  const [profile, clauses, numbering] = await Promise.all([
    documents.profile(actor),
    documents.clauses(actor),
    documents.numbering(actor),
  ]);
  return {
    profile: profile
      ? {
          name: profile.name,
          legalName: profile.legalName ?? null,
          trade: profile.trade ?? null,
          phone: profile.phone ?? null,
          email: profile.email ?? null,
          address: profile.address ?? null,
          legalMentions: profile.legalMentions ?? null,
          rccm: profile.rccm ?? null,
          taxId: profile.taxId ?? null,
          brandColor: profile.brandColor ?? null,
          hasLogo: Boolean(profile.logoKey),
          defaultWarranty: profile.defaultWarranty,
          defaultDelivery: profile.defaultDelivery,
          defaultDepositPercent: profile.defaultDepositPercent?.toFixed() ?? null,
          defaultValidityDays: profile.defaultValidityDays,
          paymentInstructions: profile.paymentInstructions,
        }
      : null,
    clauses,
    numbering,
  };
});

export type Presentation = Awaited<ReturnType<typeof fetchPresentation>>;

const profileFields = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  trade: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  legalMentions: z.string().nullable(),
  rccm: z.string().nullable(),
  taxId: z.string().nullable(),
  brandColor: z.string().nullable(),
  defaultWarranty: z.string().nullable(),
  defaultDelivery: z.string().nullable(),
  defaultDepositPercent: z.string().nullable(),
  defaultValidityDays: z.number().int().positive(),
  paymentInstructions: z.string().nullable(),
});

export const savePresentation = createServerFn({ method: 'POST' })
  .validator((input: unknown) => profileFields.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    const empty = (value: string | null) => (value?.trim() ? value.trim() : null);
    try {
      await services().documents.saveProfile(actor, {
        name: data.name,
        legalName: empty(data.legalName),
        trade: empty(data.trade),
        phone: empty(data.phone),
        email: empty(data.email),
        address: empty(data.address),
        legalMentions: empty(data.legalMentions),
        rccm: empty(data.rccm),
        taxId: empty(data.taxId),
        brandColor: empty(data.brandColor),
        defaultWarranty: empty(data.defaultWarranty),
        defaultDelivery: empty(data.defaultDelivery),
        defaultDepositPercent: empty(data.defaultDepositPercent),
        defaultValidityDays: data.defaultValidityDays,
        paymentInstructions: empty(data.paymentInstructions),
      });
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export const saveClause = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive().nullable(),
        title: z.string(),
        body: z.string(),
        enabledByDefault: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      return { ok: true as const, id: await services().documents.saveClause(actor, data) };
    } catch (error) {
      return failure(error);
    }
  });

export const archiveClause = createServerFn({ method: 'POST' })
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      await services().documents.archiveClause(actor, data.id);
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export const saveNumbering = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        type: z.enum(['quote', 'proforma', 'invoice']),
        prefix: z.string(),
        separator: z.string(),
        cadence: z.enum(['annual', 'continuous']),
        width: z.number().int(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor } = await member();
    try {
      const { type, ...settings } = data;
      await services().documents.saveNumbering(actor, type, settings);
      return { ok: true as const };
    } catch (error) {
      return failure(error);
    }
  });

export interface PlanView {
  /** `unavailable`: the Compte Kete did not answer; nothing is guessed. */
  kind: 'free' | 'subscribed' | 'plan_required' | 'unavailable';
  remaining: number | null;
  until: string | null;
  free: number;
  period: { documents: number; days: number };
  /** The Compte Kete's subscriptions, where the payment happens. */
  subscribeUrl: string;
}

/** Where his organization stands with Firmo's plans (spec 007). */
export const fetchPlan = createServerFn({ method: 'GET' }).handler(async (): Promise<PlanView> => {
  const { actor } = await member();
  const { plans, documents } = services();
  const base = {
    free: FREE_DOCUMENTS,
    period: { documents: PERIOD_DOCUMENTS, days: PERIOD_DAYS },
    subscribeUrl: `${env.accountUrl}/espace/abonnements`,
  };
  try {
    const standing = await plans.standing(actor, documents.issued(actor));
    return {
      ...base,
      kind: standing.kind,
      remaining: standing.kind === 'plan_required' ? 0 : standing.remaining,
      until: standing.kind === 'subscribed' ? standing.until.slice(0, 10) : null,
    };
  } catch {
    return { ...base, kind: 'unavailable', remaining: null, until: null };
  }
});
