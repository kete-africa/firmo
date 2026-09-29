import { inOrganization } from '@/platform/tenancy';
import {
  draftInput,
  paymentInput,
  profileInput,
  type Draft,
  type DraftInput,
  type PaymentInput,
  type ProfileInput,
} from './contracts';
import { calculateDocument, CalculationError } from './domain/calculate';
import { Dec, moneyToString, quantizeMoney } from './domain/money';
import {
  counterYear,
  formatRevisionNumber,
  formatSeriesNumber,
  NumberingError,
  validateManualNumber,
} from './domain/numbering';
import {
  draftSnapshot,
  issuedSnapshot,
  renderInput,
  type DocumentFacts,
  type Header,
} from './domain/presentation';
import { confirms, SnapshotError } from './domain/snapshot';
import type { DocumentState, DocumentType } from './domain/types';
import * as repo from './infrastructure/repository';
import type { DocumentFiles, DocumentRenderer } from './ports';

/**
 * The documents feature's use cases. Every one runs inside the actor's organization, which comes
 * from a verified proof (a messaging sender, a Compte Kete session) — never from the input.
 */
export interface Actor {
  organizationId: string;
}

export interface DocumentsDeps {
  renderer: DocumentRenderer;
  files: DocumentFiles;
  now?: () => Date;
}

export class DocumentError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'profile_required'
      | 'not_a_draft'
      | 'draft_changed'
      | 'not_issuable'
      | 'number_taken'
      | 'not_available',
    readonly status: 400 | 404 | 409 | 422,
    readonly field?: string,
  ) {
    super(code);
  }
}

const notFound = () => new DocumentError('not_found', 404);

function parse<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DocumentError('invalid_input', 422);
  return result.data;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

function facts(
  document: repo.StoredDocument,
  sourceNumber: string | null,
  sourceType: DocumentType | null,
): DocumentFacts {
  return {
    type: document.type,
    date: document.documentDate,
    subject: document.subject,
    client: {
      name: document.clientName,
      phone: document.clientPhone,
      address: document.clientAddress,
    },
    validityDays: document.validityDays,
    site: document.site,
    delivery: document.delivery,
    warranty: document.warranty,
    assumptions: document.assumptions,
    revision: document.revision,
    sourceNumber,
    sourceType,
    draft: repo.draftOf(document),
    clauses: document.clauses,
    payments: document.payments,
  };
}

export function createDocuments(deps: DocumentsDeps) {
  const now = deps.now ?? (() => new Date());

  async function requireProfile(tx: Parameters<Parameters<typeof inOrganization>[1]>[0]) {
    const profile = await repo.loadProfile(tx);
    if (!profile) throw new DocumentError('profile_required', 409);
    return profile;
  }

  async function logoOf(profile: repo.StoredProfile) {
    if (!profile.logoKey) return null;
    const content = await deps.files.get(profile.logoKey);
    if (!content) return null;
    const mediaType = profile.logoKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { mediaType, content };
  }

  async function sourceOf(
    tx: Parameters<Parameters<typeof inOrganization>[1]>[0],
    document: repo.StoredDocument,
  ) {
    if (!document.sourceDocumentId) return { number: null, type: null };
    const source = await repo.loadDocument(tx, document.sourceDocumentId);
    return { number: source?.number ?? null, type: source?.type ?? null };
  }

  function header(profile: repo.StoredProfile, hasLogo: boolean): Header {
    return { ...profile, hasLogo };
  }

  return {
    /** The organization's commercial identity; the first document asks only for its name. */
    async saveProfile(actor: Actor, input: ProfileInput): Promise<void> {
      const profile = parse(profileInput, input);
      await inOrganization(actor.organizationId, (tx) =>
        repo.saveProfile(tx, actor.organizationId, {
          ...profile,
          defaultDepositPercent: profile.defaultDepositPercent ?? null,
          defaultValidityDays: profile.defaultValidityDays ?? null,
        }),
      );
    },

    async profile(actor: Actor) {
      return inOrganization(actor.organizationId, (tx) => repo.loadProfile(tx));
    },

    /** The only question before a first document: the name it leaves under. */
    async setIssuerName(actor: Actor, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 200) throw new DocumentError('invalid_input', 422, 'name');
      await inOrganization(actor.organizationId, (tx) =>
        repo.setIssuerName(tx, actor.organizationId, trimmed),
      );
    },

    /** The last issued document, or null. */
    async latestIssued(actor: Actor) {
      return inOrganization(actor.organizationId, async (tx) => {
        const id = await repo.latestIssuedId(tx);
        return id === null ? null : repo.loadDocument(tx, id);
      });
    },

    async createDraft(actor: Actor, input: DraftInput): Promise<number> {
      const draft = parse(draftInput, input);
      return inOrganization(actor.organizationId, async (tx) => {
        const profile = await repo.loadProfile(tx);
        return repo.insertDocument(tx, actor.organizationId, withDefaults(draft, profile), {
          validityDays: profile?.defaultValidityDays ?? 30,
          documentDate: today(now()),
        });
      });
    },

    async updateDraft(actor: Actor, id: number, input: DraftInput): Promise<void> {
      const draft = parse(draftInput, input);
      await inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id, { lock: true });
        if (!document) throw notFound();
        if (document.state !== 'draft') throw new DocumentError('not_a_draft', 409);
        await repo.replaceDraft(tx, actor.organizationId, id, draft);
      });
    },

    async get(actor: Actor, id: number) {
      const document = await inOrganization(actor.organizationId, (tx) =>
        repo.loadDocument(tx, id),
      );
      if (!document) throw notFound();
      return document;
    },

    async list(actor: Actor, limit = 50) {
      return inOrganization(actor.organizationId, (tx) =>
        repo.listDocuments(tx, Math.min(limit, 200)),
      );
    },

    /**
     * The preview: the exact snapshot the tradesman will confirm, and its PDF marked as a draft.
     * Values Firmo could not read (lines to confirm) make it not issuable, never guessed.
     */
    async preview(actor: Actor, id: number): Promise<{ sha256: string; pdf: Uint8Array }> {
      return inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id);
        if (!document) throw notFound();
        if (document.state !== 'draft') throw new DocumentError('not_a_draft', 409);
        const profile = await requireProfile(tx);
        const logo = await logoOf(profile);
        const source = await sourceOf(tx, document);
        let snapshot;
        try {
          snapshot = draftSnapshot(
            facts(document, source.number, source.type),
            header(profile, Boolean(logo)),
          );
        } catch (error) {
          if (error instanceof CalculationError || error instanceof SnapshotError) {
            throw new DocumentError(
              'not_issuable',
              409,
              error instanceof CalculationError ? error.code : undefined,
            );
          }
          throw error;
        }
        const shown = (JSON.parse(snapshot.canonicalJson) as { document: Record<string, unknown> })
          .document;
        const rendered = await deps.renderer.render(renderInput(shown, { number: 'BROUILLON' }), {
          createdAt: now(),
          logo,
        });
        return { sha256: snapshot.sha256, pdf: rendered.pdf };
      });
    },

    /**
     * Issuance: only if the confirmed hash is exactly the current preview's. Burns the number,
     * freezes totals, header and clauses, renders and keeps the PDF. Repeating it with the same
     * confirmation returns the same document.
     */
    async issue(
      actor: Actor,
      id: number,
      confirmation: { sha256: string; manualNumber?: string | null },
    ): Promise<{ number: string; pdfKey: string; pdf: Uint8Array | null; repeated: boolean }> {
      return inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id, { lock: true });
        if (!document) throw notFound();
        if (document.state !== 'draft') {
          const confirmed = document.snapshot?.document as Record<string, unknown> | undefined;
          if (
            document.number &&
            document.pdfKey &&
            confirmed?.confirmed_preview_sha256 === confirmation.sha256
          ) {
            return { number: document.number, pdfKey: document.pdfKey, pdf: null, repeated: true };
          }
          throw new DocumentError('not_a_draft', 409);
        }
        const profile = await requireProfile(tx);
        const logo = await logoOf(profile);
        const source = await sourceOf(tx, document);
        const documentFacts = facts(document, source.number, source.type);
        const documentHeader = header(profile, Boolean(logo));
        let preview;
        try {
          preview = draftSnapshot(documentFacts, documentHeader);
        } catch {
          throw new DocumentError('not_issuable', 409);
        }
        if (!confirms(preview, confirmation.sha256)) throw new DocumentError('draft_changed', 409);

        const issuedAt = now();
        const year = counterYear('annual', new Date(`${document.documentDate}T00:00:00Z`));
        let number: string;
        let counter: { year: number; value: number } | null = null;
        const manual = confirmation.manualNumber?.trim() || null;
        try {
          const settings = await repo.numberingOf(tx, document.type);
          const seriesYear = settings.cadence === 'annual' ? year : 0;
          const series = {
            prefix: settings.prefix,
            separator: settings.separator,
            width: settings.width,
            year: seriesYear,
          };
          if (manual) {
            if (document.revision > 1)
              throw new DocumentError('invalid_input', 422, 'manualNumber');
            number = validateManualNumber(manual, { automaticSeries: series });
          } else if (document.revision > 1 && document.rootDocumentId) {
            const root = await repo.rootNumber(tx, document.rootDocumentId);
            if (!root) throw new DocumentError('not_issuable', 409);
            number = formatRevisionNumber(root, document.revision);
          } else {
            const last = await repo.lockCounter(
              tx,
              actor.organizationId,
              document.type,
              seriesYear,
            );
            counter = { year: seriesYear, value: last + 1 };
            number = formatSeriesNumber(series, counter.value);
          }
        } catch (error) {
          if (error instanceof NumberingError)
            throw new DocumentError('invalid_input', 422, 'manualNumber');
          throw error;
        }
        if (await repo.numberExists(tx, document.type, number)) {
          throw new DocumentError('number_taken', 409, manual ? 'manualNumber' : undefined);
        }

        const snapshot = issuedSnapshot(documentFacts, documentHeader, {
          number,
          issuedAt: issuedAt.toISOString(),
          confirmedPreviewSha256: preview.sha256,
        });
        const frozen = (JSON.parse(snapshot.canonicalJson) as { document: Record<string, unknown> })
          .document;
        const rendered = await deps.renderer.render(renderInput(frozen, { number }), {
          createdAt: issuedAt,
          logo,
        });
        const pdfKey = `organizations/${actor.organizationId}/documents/${id}/${rendered.sha256}.pdf`;
        await deps.files.put(pdfKey, rendered.pdf, 'application/pdf');
        await repo.markIssued(tx, id, {
          number,
          issuedAt: issuedAt.toISOString(),
          snapshot: snapshot.canonicalJson,
          snapshotSha256: snapshot.sha256,
          templateVersion: deps.renderer.templateVersion,
          pdfKey,
          pdfSha256: rendered.sha256,
          manualNumber: Boolean(manual),
        });
        if (counter) await repo.advanceCounter(tx, document.type, counter.year, counter.value);
        await repo.rememberItems(
          tx,
          actor.organizationId,
          document.sections.flatMap((section) =>
            section.lines
              .filter((line) => line.calculated)
              .map((line) => ({
                label: line.label,
                unit: line.unit,
                unitPrice: line.unitPrice?.toFixed() ?? null,
              })),
          ),
        );
        return { number, pdfKey, pdf: rendered.pdf, repeated: false };
      });
    },

    /** The issued PDF, exactly as it was issued. */
    async pdf(actor: Actor, id: number): Promise<{ number: string; pdf: Uint8Array }> {
      const document = await inOrganization(actor.organizationId, (tx) =>
        repo.loadDocument(tx, id),
      );
      if (!document) throw notFound();
      if (!document.pdfKey || !document.number) throw new DocumentError('not_available', 409);
      const pdf = await deps.files.get(document.pdfKey);
      if (!pdf) throw new DocumentError('not_available', 409);
      return { number: document.number, pdf };
    },

    /** Quote → proforma or invoice, proforma → invoice: a new draft, without retyping. */
    async convert(actor: Actor, id: number, target: DocumentType): Promise<number> {
      return inOrganization(actor.organizationId, async (tx) => {
        const source = await repo.loadDocument(tx, id, { lock: true });
        if (!source) throw notFound();
        const allowed: Record<DocumentType, DocumentType[]> = {
          quote: ['proforma', 'invoice'],
          proforma: ['invoice'],
          invoice: [],
        };
        if (source.state === 'draft' || !allowed[source.type].includes(target)) {
          throw new DocumentError('not_available', 409);
        }
        const draft = repo.draftFromStored(source, target);
        const created = await repo.insertDocument(
          tx,
          actor.organizationId,
          { ...draft, clauseIds: [] },
          { validityDays: source.validityDays, documentDate: today(now()) },
          { sourceDocumentId: source.id },
        );
        await repo.copyClausesFrom(tx, actor.organizationId, source.id, created);
        return created;
      });
    },

    /** A correction of an issued document: a new draft linked to its root, numbered /R2, /R3. */
    async revise(actor: Actor, id: number): Promise<number> {
      return inOrganization(actor.organizationId, async (tx) => {
        const source = await repo.loadDocument(tx, id, { lock: true });
        if (!source) throw notFound();
        if (source.state === 'draft') throw new DocumentError('not_available', 409);
        const rootId = source.rootDocumentId ?? source.id;
        const revision = await repo.nextRevision(tx, rootId);
        const draft = repo.draftFromStored(source, source.type);
        const created = await repo.insertDocument(
          tx,
          actor.organizationId,
          { ...draft, clauseIds: [] },
          { validityDays: source.validityDays, documentDate: today(now()) },
          { rootDocumentId: rootId, revision, sourceDocumentId: source.sourceDocumentId },
        );
        await repo.copyClausesFrom(tx, actor.organizationId, source.id, created);
        return created;
      });
    },

    /** The client's answer, or a cancellation: the only change an issued document accepts. */
    async answer(
      actor: Actor,
      id: number,
      state: Extract<DocumentState, 'accepted' | 'refused' | 'unanswered' | 'cancelled'>,
    ) {
      await inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id, { lock: true });
        if (!document) throw notFound();
        if (document.state !== 'issued') throw new DocumentError('not_available', 409);
        await repo.setState(tx, id, state);
      });
    },

    /** A payment received on an issued invoice; never more than the balance due. */
    async recordPayment(actor: Actor, id: number, input: PaymentInput) {
      const payment = parse(paymentInput, input);
      return inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id, { lock: true });
        if (!document) throw notFound();
        if (document.type !== 'invoice' || document.state !== 'issued') {
          throw new DocumentError('not_available', 409);
        }
        const amount = quantizeMoney(new Dec(payment.amount));
        const calculation = calculateDocument(repo.draftOf(document));
        if (amount.lte(0)) throw new DocumentError('invalid_input', 422, 'amount');
        if (amount.gt(calculation.balanceDue))
          throw new DocumentError('not_available', 409, 'amount');
        const balanceAfter = calculation.balanceDue.minus(amount);
        await repo.insertPayment(tx, actor.organizationId, id, {
          amount: moneyToString(amount),
          paidOn: payment.paidOn,
          method: payment.method,
          reference: payment.reference,
          balanceAfter: moneyToString(balanceAfter),
        });
        return {
          paidTotal: moneyToString(calculation.paidTotal.plus(amount)),
          balanceDue: moneyToString(balanceAfter),
        };
      });
    },
  };
}

/** The organization's defaults fill what the draft left empty — never a price. */
function withDefaults(draft: Draft, profile: repo.StoredProfile | null): Draft {
  if (!profile) return draft;
  return {
    ...draft,
    warranty: draft.warranty ?? profile.defaultWarranty,
    delivery: draft.delivery ?? profile.defaultDelivery,
    depositPercent: draft.depositPercent ?? profile.defaultDepositPercent?.toFixed() ?? null,
  };
}

export type Documents = ReturnType<typeof createDocuments>;
