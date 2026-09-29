import { createHash, randomBytes } from 'node:crypto';
import type { Transaction } from '@/platform/db';
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
import { canConvert, canRevise, nextAnswers } from './domain/lifecycle';
import type { DocumentState, DocumentType } from './domain/types';
import * as repo from './infrastructure/repository';
import type {
  DocumentEvents,
  DocumentFiles,
  DocumentRenderer,
  IssuanceGate,
  IssuedCount,
} from './ports';

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
  /** Firmo's plans; without one (tests, tools), every issuance is allowed. */
  gate?: IssuanceGate;
  /** Kete Cockpit's events; without them (tests, tools), nothing is announced. */
  events?: DocumentEvents;
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
      | 'not_available'
      | 'plan_required'
      | 'quota_reached'
      | 'plans_unavailable',
    readonly status: 400 | 402 | 404 | 409 | 422 | 503,
    readonly field?: string,
  ) {
    super(code);
  }
}

const notFound = () => new DocumentError('not_found', 404);

function issuedCount(tx: Transaction): IssuedCount {
  return {
    total: () => repo.countFirstIssuances(tx),
    since: (date, excludingFirst) => repo.countFirstIssuances(tx, { since: date, excludingFirst }),
  };
}

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

  /** The draft's canonical snapshot as the tradesman sees it; not issuable if it cannot be exact. */
  async function currentSnapshot(actor: Actor, id: number) {
    return inOrganization(actor.organizationId, async (tx) => {
      const document = await repo.loadDocument(tx, id);
      if (!document) throw notFound();
      if (document.state !== 'draft') throw new DocumentError('not_a_draft', 409);
      const profile = await requireProfile(tx);
      const logo = await logoOf(profile);
      const source = await sourceOf(tx, document);
      try {
        const snapshot = draftSnapshot(
          facts(document, source.number, source.type),
          header(profile, Boolean(logo)),
        );
        return { snapshot, logo };
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
    });
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
        // His clauses written once, enabled by default, join every new document.
        const clauseIds = draft.clauseIds ?? (await repo.defaultClauseIds(tx));
        return repo.insertDocument(
          tx,
          actor.organizationId,
          { ...withDefaults(draft, profile), clauseIds },
          { validityDays: profile?.defaultValidityDays ?? 30, documentDate: today(now()) },
        );
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
      const { snapshot, logo } = await currentSnapshot(actor, id);
      const shown = (JSON.parse(snapshot.canonicalJson) as { document: Record<string, unknown> })
        .document;
      const rendered = await deps.renderer.render(renderInput(shown, { number: 'BROUILLON' }), {
        createdAt: now(),
        logo,
      });
      return { sha256: snapshot.sha256, pdf: rendered.pdf };
    },

    /** The organization's first issuances, counted each in its own read. */
    issued(actor: Actor): IssuedCount {
      const read = <T>(work: (count: IssuedCount) => Promise<T>) =>
        inOrganization(actor.organizationId, (tx) => work(issuedCount(tx)));
      return {
        total: () => read((count) => count.total()),
        since: (date, excludingFirst) => read((count) => count.since(date, excludingFirst)),
      };
    },

    /** The hash of the current preview, without rendering it (the PDF is the same snapshot). */
    async previewHash(actor: Actor, id: number): Promise<string> {
      return (await currentSnapshot(actor, id)).snapshot.sha256;
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
        if (deps.gate && document.revision === 1) {
          await repo.lockIssuances(tx, actor.organizationId);
          const verdict = await deps.gate.admit(actor, issuedCount(tx));
          if (verdict !== 'allowed') {
            throw new DocumentError(verdict, verdict === 'plans_unavailable' ? 503 : 402);
          }
        }

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
        await deps.events?.issued(tx, {
          organizationId: actor.organizationId,
          type: document.type,
          correction: document.revision > 1,
        });
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
        if (!canConvert(source.type, source.state, target)) {
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
        if (!canRevise(source.type, source.state)) throw new DocumentError('not_available', 409);
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
        if (!nextAnswers(document.type, document.state).includes(state)) {
          throw new DocumentError('not_available', 409);
        }
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

    // --- Presentation: clauses, numbering, logo ------------------------------------------------

    async clauses(actor: Actor) {
      return inOrganization(actor.organizationId, (tx) => repo.listClauses(tx));
    },

    /** A clause written once, reused on his documents; Firmo shapes wording, never substance. */
    async saveClause(
      actor: Actor,
      clause: { id?: number | null; title: string; body: string; enabledByDefault: boolean },
    ): Promise<number> {
      const title = clause.title.trim();
      const body = clause.body.trim();
      if (!title || !body || title.length > 200 || body.length > 2000) {
        throw new DocumentError('invalid_input', 422);
      }
      const id = await inOrganization(actor.organizationId, (tx) =>
        repo.saveClause(tx, actor.organizationId, { ...clause, title, body }),
      );
      if (!id) throw notFound();
      return id;
    },

    async archiveClause(actor: Actor, id: number): Promise<void> {
      const archived = await inOrganization(actor.organizationId, (tx) =>
        repo.archiveClause(tx, id),
      );
      if (!archived) throw notFound();
    },

    /** How each document type is numbered, with an example of its next number. */
    async numbering(actor: Actor) {
      return inOrganization(actor.organizationId, async (tx) => {
        const types = ['quote', 'proforma', 'invoice'] as const;
        const year = now().getUTCFullYear();
        return Promise.all(
          types.map(async (type) => {
            const settings = await repo.numberingOf(tx, type);
            const example = formatSeriesNumber(
              { ...settings, year: settings.cadence === 'annual' ? year : 0 },
              1,
            );
            return { type, ...settings, example };
          }),
        );
      });
    },

    /** Changing the format never resets a counter; a format the domain refuses is refused. */
    async saveNumbering(
      actor: Actor,
      type: DocumentType,
      settings: {
        prefix: string;
        separator: string;
        cadence: 'annual' | 'continuous';
        width: number;
      },
    ): Promise<void> {
      const prefix = settings.prefix.trim();
      try {
        formatSeriesNumber(
          { prefix, separator: settings.separator, width: settings.width, year: 0 },
          1,
        );
      } catch {
        throw new DocumentError('invalid_input', 422);
      }
      if (
        !/^[A-Za-z0-9._/-]{0,24}$/.test(prefix) ||
        !['-', '_', '/', '.'].includes(settings.separator)
      ) {
        throw new DocumentError('invalid_input', 422);
      }
      await inOrganization(actor.organizationId, (tx) =>
        repo.saveNumbering(tx, actor.organizationId, type, { ...settings, prefix }),
      );
    },

    /** His logo (a PNG already made safe by the caller): used by his next documents. */
    async setLogo(actor: Actor, png: Uint8Array): Promise<void> {
      const key = `organizations/${actor.organizationId}/logo-${createHash('sha256').update(png).digest('hex').slice(0, 16)}.png`;
      await deps.files.put(key, png, 'image/png');
      const updated = await inOrganization(actor.organizationId, (tx) => repo.setLogoKey(tx, key));
      if (!updated) throw new DocumentError('profile_required', 409);
    },

    async removeLogo(actor: Actor): Promise<void> {
      await inOrganization(actor.organizationId, (tx) => repo.setLogoKey(tx, null));
    },

    /** The first page of a sample document with his current presentation, as a PNG. */
    async presentationPreview(actor: Actor): Promise<Uint8Array> {
      if (!deps.renderer.renderFirstPagePng) throw new DocumentError('not_available', 409);
      const profile = await inOrganization(actor.organizationId, (tx) => repo.loadProfile(tx));
      if (!profile) throw new DocumentError('profile_required', 409);
      const logo = await logoOf(profile);
      const snapshot = draftSnapshot(sampleFacts(today(now())), header(profile, Boolean(logo)));
      const shown = (JSON.parse(snapshot.canonicalJson) as { document: Record<string, unknown> })
        .document;
      return deps.renderer.renderFirstPagePng(renderInput(shown, { number: 'DEV-0001' }), {
        createdAt: now(),
        logo,
      });
    },

    // --- Sharing -----------------------------------------------------------------------------

    /**
     * A link for his client: ONE issued document, read-only; a new link revokes the previous one.
     * The token is returned once; only its hash is kept.
     */
    async share(actor: Actor, id: number): Promise<{ token: string }> {
      const token = randomBytes(24).toString('base64url');
      await inOrganization(actor.organizationId, async (tx) => {
        const document = await repo.loadDocument(tx, id);
        if (!document) throw notFound();
        if (document.state === 'draft' || !document.pdfKey) {
          throw new DocumentError('not_available', 409);
        }
        await repo.createShare(tx, actor.organizationId, id, hashToken(token));
        await deps.events?.shared(tx, {
          organizationId: actor.organizationId,
          type: document.type,
        });
      });
      return { token };
    },

    async revokeShare(actor: Actor, id: number): Promise<void> {
      await inOrganization(actor.organizationId, async (tx) => {
        if (!(await repo.loadDocument(tx, id))) throw notFound();
        await repo.revokeShares(tx, id);
      });
    },

    async shareStatus(actor: Actor, id: number) {
      return inOrganization(actor.organizationId, (tx) => repo.shareOf(tx, id));
    },

    /** What a share link opens, for anyone holding it: the PDF, or nothing. */
    async openShare(token: string): Promise<{ pdf: Uint8Array; number: string } | null> {
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
      const opened = await repo.openShare(hashToken(token));
      if (!opened) return null;
      const pdf = await deps.files.get(opened.pdfKey);
      return pdf ? { pdf, number: opened.number } : null;
    },
  };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A sample document to preview a presentation: synthetic, never a real client or price. */
function sampleFacts(date: string): DocumentFacts {
  const d = (value: string) => new Dec(value);
  return {
    type: 'quote',
    date,
    subject: 'Fabrication d’un portail',
    client: { name: 'Client exemple' },
    validityDays: 30,
    revision: 1,
    draft: {
      sections: [
        {
          sectionId: 'sample',
          title: null,
          position: 0,
          lines: [
            { label: 'Ouvrage exemple', quantity: d('1'), unitPrice: d('100000'), position: 0 },
          ],
        },
      ],
    },
    clauses: [],
    payments: [],
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
