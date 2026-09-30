import { canConvert, DocumentError, type Documents } from '@/features/documents';
import type { Identity, SenderProof } from '@/features/identity';
import * as m from '@/paraglide/messages.js';
import type { Transaction } from '@/platform/db';
import { inOrganization } from '@/platform/tenancy';
import { missingOf, toDraftInput, type Missing, type WorkingDraft } from './draft';
import {
  loadConversation,
  recordUsage,
  saveConversation,
  type ConversationState,
} from './infrastructure/conversations';
import { INSTRUCTIONS } from './instructions';
import type {
  ConversationMessage,
  ConversationModel,
  InboundMessage,
  MessagingChannel,
  OutboundAction,
  TurnUsage,
  UsageEvents,
} from './ports';
import { summaryForPerson, type ChatLocale } from './summary';
import {
  sameDraft,
  strictJsonSchema,
  toDraftOutput,
  toWorkingDraft,
  turnOutput,
  type TurnOutput,
} from './turn';

/**
 * The conversation (spec 010, decision 0003). One model call per message: the model reads the
 * sender's own conversation and answers with one structured output — its reply, the draft as it
 * now understands it, and at most one action. The code validates it, keeps the state, runs the
 * action with its rules (issuance only after a proposal and a yes, the plans, the numbering),
 * computes every amount and writes the summary. Every reply goes to the sender of the message it
 * answers — nobody else (constitution III).
 */
export interface ConversationDeps {
  model: ConversationModel;
  channels: Partial<Record<InboundMessage['channel'], MessagingChannel>>;
  identity: Identity;
  documents: Documents;
  /** Kete Cockpit's events; without them, nothing is announced. */
  events?: UsageEvents;
  locale?: ChatLocale;
  /** Tests: the clock a pause is measured with. */
  now?: () => Date;
}

type Outgoing =
  | { kind: 'text'; text: string; actions?: OutboundAction[] }
  | { kind: 'document'; pdf: Uint8Array; filename: string; caption: string };

export const ISSUE_CONFIRM = 'issue:confirm';
export const ISSUE_CANCEL = 'issue:cancel';
/** The buttons under a complete draft, and under an issued document (spec 011). */
export const SHOW_PREVIEW = 'draft:preview';
export const FINAL_DOCUMENT = 'draft:final';
export const EDIT_DRAFT = 'draft:edit';
export const TO_INVOICE = 'doc:invoice';
export const NEW_DOCUMENT = 'doc:new';
/** Refusals of the plans (spec 007): the code answers them, with the way to subscribe. */
const PLAN_REFUSALS = new Set(['plan_required', 'quota_reached', 'plans_unavailable']);
/** The exchanges the model reads: enough for a document, never a past document's prices. */
export const MAX_EXCHANGES = 10;
const SCHEMA = strictJsonSchema(turnOutput);

export function createConversation(deps: ConversationDeps) {
  const locale = deps.locale ?? 'fr';
  const now = deps.now ?? (() => new Date());

  function channelOf(message: InboundMessage): MessagingChannel {
    const channel = deps.channels[message.channel];
    if (!channel) throw new Error(`no adapter for ${message.channel}`);
    return channel;
  }

  async function deliver(channel: MessagingChannel, to: string, outbox: Outgoing[]) {
    for (const item of outbox) {
      if (item.kind === 'text') await channel.sendText(to, item.text, item.actions);
      else await channel.sendDocument(to, item.pdf, item.filename, item.caption);
    }
  }

  /** What the model cost this turn: kept for the document, and announced to Kete Cockpit. */
  async function costOf(
    tx: Transaction,
    organizationId: string,
    channel: InboundMessage['channel'],
    documentId: number | null,
    usage: TurnUsage[],
  ) {
    const total = await recordUsage(tx, { organizationId, channel, documentId, usage });
    if (total) await deps.events?.aiUsage(tx, { organizationId, ...total });
  }

  /** The text of the turn: the message's words, or what was heard or read in its media. */
  async function textOf(message: InboundMessage, channel: MessagingChannel, usage: TurnUsage[]) {
    if (message.kind === 'text') return message.text?.trim() ?? '';
    if (message.kind === 'voice' && message.media) {
      await channel.sendText(message.sender, m.chat_ack_voice({}, { locale }));
      const audio = await channel.download(message.media);
      const heard = await deps.model.transcribeAudio(audio);
      usage.push(heard.usage);
      return heard.text;
    }
    if (message.kind === 'photo' && message.media) {
      await channel.sendText(message.sender, m.chat_ack_photo({}, { locale }));
      const image = await channel.download(message.media);
      const read = await deps.model.transcribeImage(image);
      usage.push(read.usage);
      return [message.text?.trim(), read.text].filter(Boolean).join('\n');
    }
    return '';
  }

  /** What the code knows and the model must take as given, with the person's new message. */
  async function stateFor(
    actor: { organizationId: string },
    state: ConversationState,
    text: string,
  ): Promise<string> {
    const profile = await deps.documents.profile(actor);
    const recent = (await deps.documents.list(actor, 20))
      .filter((d) => d.state !== 'draft')
      .slice(0, 5)
      .map((d) => `${d.type} ${d.number ?? ''} pour ${d.clientName} (${d.subject}, ${d.state})`);
    const missing = state.draft ? missingOf(state.draft).map(describeMissing) : [];
    const pause = state.history.length ? sinceText(state.lastActivityAt, now()) : 'première fois';
    return [
      '[État tenu par Firmo — fait foi]',
      `Son dernier message avant celui-ci : ${pause}`,
      `Nom d'émetteur : ${profile?.name ?? 'pas encore donné'}`,
      `Émission proposée en attente de sa réponse : ${state.pendingIssue ? 'oui' : 'non'}`,
      `Documents émis récents : ${recent.join(' ; ') || 'aucun'}`,
      `Brouillon en cours : ${state.draft ? JSON.stringify(toDraftOutput(state.draft)) : 'aucun'}`,
      `Ce qui manque au brouillon : ${missing.join(', ') || 'rien'}`,
      '',
      '[Son message]',
      text,
    ].join('\n');
  }

  /**
   * One structured decision of the model. A schema error or a draft the code cannot accept goes
   * back to the model once, with what to fix; then the turn falls back to a neutral reply.
   */
  async function decide(
    messages: ConversationMessage[],
    safetyId: string,
    usage: TurnUsage[],
  ): Promise<{ output: TurnOutput; draft: WorkingDraft | null } | null> {
    const conversation = [...messages];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await deps.model.decide({
        instructions: INSTRUCTIONS,
        messages: conversation,
        schema: SCHEMA,
        schemaName: 'firmo_turn',
        safetyId,
      });
      usage.push(result.usage);
      const parsed = turnOutput.safeParse(result.output);
      const problems: string[] = [];
      if (parsed.success) {
        if (!parsed.data.draft) return { output: parsed.data, draft: null };
        const converted = toWorkingDraft(parsed.data.draft);
        if (converted.draft) return { output: parsed.data, draft: converted.draft };
        problems.push(...converted.problems);
      } else {
        problems.push(...parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`));
      }
      conversation.push(
        { role: 'firmo', text: JSON.stringify(result.output) },
        {
          role: 'person',
          text: `[Firmo] Ta sortie est à corriger : ${problems.join(' ; ')}. Rends-la corrigée.`,
        },
      );
    }
    return null;
  }

  return {
    /**
     * Handles one verified inbound message. Returns the sender's organization once known, for
     * the inbox to record.
     */
    async handle(
      message: InboundMessage,
    ): Promise<{ organizationId: string | null; usage: TurnUsage[] }> {
      const channel = channelOf(message);
      const to = message.sender;
      const usage: TurnUsage[] = [];
      const proof: SenderProof =
        message.channel === 'whatsapp'
          ? { channel: 'whatsapp', subject: message.sender, displayName: message.displayName }
          : {
              channel: 'telegram',
              subject: message.sender,
              displayName: message.displayName,
              contact: message.contact ?? null,
            };
      const sender = await deps.identity.resolveSender(proof);
      if (sender.status === 'needs_contact') {
        await channel.askForContact(
          to,
          m.chat_share_number({}, { locale }),
          m.chat_share_number_button({}, { locale }),
        );
        return { organizationId: null, usage };
      }
      if (sender.status === 'refused') {
        await channel.sendText(to, m.chat_contact_refused({}, { locale }));
        return { organizationId: null, usage };
      }
      const actor = { organizationId: sender.organizationId };
      if (message.kind === 'contact') {
        await channel.sendText(to, m.chat_welcome({}, { locale }));
        await channel.sendText(to, m.chat_privacy_note({}, { locale }));
        return { organizationId: actor.organizationId, usage };
      }
      if (message.kind === 'unsupported') {
        await channel.sendText(to, m.chat_unsupported({}, { locale }));
        return { organizationId: actor.organizationId, usage };
      }

      // This sender's own conversation, in her organization: nobody else's is ever read.
      const state = await inOrganization(actor.organizationId, (tx) =>
        loadConversation(tx, actor.organizationId, message.channel, message.sender),
      );
      const turn = createTurn({ deps, locale, actor, personId: sender.personId, state });

      if (message.kind === 'action') {
        // A button runs its action at once, without the model.
        await channel.acknowledgeAction?.(message);
        const stopTyping = channel.typing?.(message) ?? (() => undefined);
        try {
          await turn.press(message.action ?? '');
        } finally {
          stopTyping();
        }
        turn.remember(`[${turn.buttonLabel(message.action ?? '')}]`);
        await inOrganization(actor.organizationId, (tx) => saveConversation(tx, turn.state));
        await deliver(channel, to, turn.outbox);
        return { organizationId: actor.organizationId, usage };
      }

      const text = await textOf(message, channel, usage);
      if (!text) {
        await inOrganization(actor.organizationId, (tx) =>
          costOf(tx, actor.organizationId, message.channel, turn.workedOn(), usage),
        );
        await channel.sendText(to, m.chat_unsupported({}, { locale }));
        return { organizationId: actor.organizationId, usage };
      }

      const messages: ConversationMessage[] = [
        ...turn.state.history.flatMap((h): ConversationMessage[] => [
          { role: 'person', text: h.person },
          { role: 'firmo', text: h.firmo },
        ]),
        { role: 'person', text: await stateFor(actor, turn.state, text) },
      ];
      const stopTyping = channel.typing?.(message) ?? (() => undefined);
      try {
        const decision = await decide(messages, actor.organizationId, usage);
        if (decision) {
          await turn.apply(decision.output, decision.draft, { first: sender.status === 'new' });
        } else turn.say(m.chat_fallback_reply({}, { locale }));
      } finally {
        stopTyping();
      }
      // Said at first use, not buried in terms: what is kept, and what is not.
      if (sender.status === 'new') turn.say(m.chat_privacy_note({}, { locale }));
      turn.remember(text);
      await inOrganization(actor.organizationId, async (tx) => {
        await saveConversation(tx, turn.state);
        await costOf(tx, actor.organizationId, message.channel, turn.workedOn(), usage);
      });
      await deliver(channel, to, turn.outbox);
      return { organizationId: actor.organizationId, usage };
    },

    /** Tells the sender, after the last attempt failed, that her draft is safe. */
    async apologize(message: InboundMessage): Promise<void> {
      const text =
        message.kind === 'voice'
          ? m.chat_degraded_voice({}, { locale })
          : message.kind === 'photo'
            ? m.chat_degraded_photo({}, { locale })
            : m.chat_degraded_text({}, { locale });
      await channelOf(message).sendText(message.sender, text);
    },
  };
}

export type Conversation = ReturnType<typeof createConversation>;

/** How long ago, in words the model reads: « il y a 3 heures ». */
export function sinceText(from: string, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60_000));
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
  return `il y a ${Math.round(hours / 24)} jours`;
}

/** The action of a pressed button, as if the model had decided it. */
function action(name: TurnOutput['action']): TurnOutput {
  return {
    reply: '',
    draft: null,
    new_document: false,
    issuer_name: null,
    action: name,
    document_number: null,
  };
}

/** A missing element, as the model and the person read it. */
function describeMissing(item: Missing): string {
  if (item.kind === 'quantity') return `quantité de « ${item.label} »`;
  if (item.kind === 'unit_price') return `prix unitaire de « ${item.label} »`;
  if (item.kind === 'adjustment_value') return `valeur de « ${item.label} »`;
  return { items: 'postes chiffrés', client_name: 'client', subject: 'objet' }[item.kind];
}

// --- One turn ------------------------------------------------------------------------------------

function createTurn(input: {
  deps: ConversationDeps;
  locale: ChatLocale;
  actor: { organizationId: string };
  personId: string;
  state: ConversationState;
}) {
  const { deps, locale, actor, personId } = input;
  const state: ConversationState = structuredClone(input.state);
  const outbox: Outgoing[] = [];
  let draftChanged = false;
  /** The code asked or answered itself: the model's reply would repeat it. */
  let codeAnswered = false;
  let issuedId: number | null = null;
  /** The document issued this turn: what the next buttons offer. */
  let justIssued: { type: 'quote' | 'proforma' | 'invoice'; client: string } | null = null;
  let previewSent = false;
  let undone = false;

  const typeLabel = (type: 'quote' | 'proforma' | 'invoice') =>
    ({
      quote: m.chat_type_quote({}, { locale }),
      proforma: m.chat_type_proforma({}, { locale }),
      invoice: m.chat_type_invoice({}, { locale }),
    })[type];

  const say = (text: string) => outbox.push({ kind: 'text', text });

  /** The code's own question, when an action cannot be done yet. */
  function ask(text: string) {
    say(text);
    codeAnswered = true;
  }

  function resetDocument() {
    state.draft = null;
    state.previousDraft = null;
    state.documentId = null;
    state.pendingIssue = null;
    // A new document starts a new exchange: a past document's prices never reach the next one.
    state.history = [];
  }

  /** The draft as a document draft, previewed — or the code asks what is missing. */
  async function prepare(): Promise<{
    documentId: number;
    sha256: string;
    pdf: Uint8Array;
  } | null> {
    const draft = state.draft;
    if (!draft) {
      ask(m.chat_need_items({}, { locale }));
      return null;
    }
    const [missing] = missingOf(draft);
    if (missing) {
      ask(m.chat_need({ what: describeMissing(missing) }, { locale }));
      return null;
    }
    if (!(await deps.documents.profile(actor))) {
      ask(m.chat_ask_issuer_name({}, { locale }));
      return null;
    }
    const draftInput = toDraftInput(draft);
    if (state.documentId !== null) {
      try {
        await deps.documents.updateDraft(actor, state.documentId, draftInput);
      } catch (error) {
        if (!(error instanceof DocumentError) || error.code === 'invalid_input') throw error;
        state.documentId = null;
      }
    }
    state.documentId ??= await deps.documents.createDraft(actor, draftInput);
    const preview = await deps.documents.preview(actor, state.documentId);
    return { documentId: state.documentId, sha256: preview.sha256, pdf: preview.pdf };
  }

  function sendPreview(pdf: Uint8Array) {
    previewSent = true;
    outbox.push({
      kind: 'document',
      pdf,
      filename: 'apercu.pdf',
      caption: m.chat_preview_caption({}, { locale }),
    });
  }

  function propose(documentId: number, sha256: string, pdf: Uint8Array) {
    state.pendingIssue = { documentId, sha256 };
    sendPreview(pdf);
    outbox.push({
      kind: 'text',
      text: m.chat_issue_proposal({}, { locale }),
      actions: [
        { id: ISSUE_CONFIRM, label: m.chat_issue_confirm_button({}, { locale }) },
        { id: ISSUE_CANCEL, label: m.chat_issue_cancel_button({}, { locale }) },
      ],
    });
    codeAnswered = true;
  }

  /** Issuance: only the proposed document, exactly as previewed (its hash), within the plans. */
  async function confirmIssue(): Promise<void> {
    const pending = state.pendingIssue;
    if (!pending) return;
    try {
      const issued = await deps.documents.issue(actor, pending.documentId, {
        sha256: pending.sha256,
      });
      const document = await deps.documents.get(actor, pending.documentId);
      const pdf = issued.pdf ?? (await deps.documents.pdf(actor, pending.documentId)).pdf;
      outbox.push({
        kind: 'document',
        pdf,
        filename: `${issued.number.replace(/[/\\]/g, '-')}.pdf`,
        caption: m.chat_issued_caption(
          { type: typeLabel(document.type), number: issued.number },
          { locale },
        ),
      });
      issuedId = pending.documentId;
      justIssued = { type: document.type, client: document.clientName };
      resetDocument();
    } catch (error) {
      if (error instanceof DocumentError && PLAN_REFUSALS.has(error.code)) {
        // The proposal stays pending: once subscribed, "oui" issues it.
        const link =
          error.code === 'plans_unavailable'
            ? null
            : await deps.identity.spaceLink(personId, '/espace/abonnement');
        ask(
          error.code === 'plan_required'
            ? m.chat_plan_required({ url: link?.url ?? '' }, { locale })
            : error.code === 'quota_reached'
              ? m.chat_quota_reached({ url: link?.url ?? '' }, { locale })
              : m.chat_plans_unavailable({}, { locale }),
        );
        return;
      }
      if (error instanceof DocumentError) {
        state.pendingIssue = null;
        ask(m.chat_issue_changed({}, { locale }));
        return;
      }
      throw error;
    }
  }

  /** An issued document by its number, or the latest one. */
  async function issuedDocument(number: string | null) {
    if (!number) return deps.documents.latestIssued(actor);
    const wanted = number.trim().toLowerCase();
    const found = (await deps.documents.list(actor, 200)).find(
      (d) => d.state !== 'draft' && d.number?.toLowerCase() === wanted,
    );
    return found ?? null;
  }

  async function sendLink(path: string) {
    const link = await deps.identity.spaceLink(personId, path);
    say(m.chat_space_link({ url: link.url }, { locale }));
  }

  async function act(output: TurnOutput) {
    switch (output.action) {
      case 'none':
        return;
      case 'show_preview': {
        const prepared = await prepare();
        if (prepared) sendPreview(prepared.pdf);
        return;
      }
      case 'propose_issue': {
        const prepared = await prepare();
        if (prepared) propose(prepared.documentId, prepared.sha256, prepared.pdf);
        return;
      }
      case 'confirm_issue':
        return confirmIssue();
      case 'cancel_issue':
        state.pendingIssue = null;
        return;
      case 'undo_last_change': {
        if (!state.previousDraft) {
          ask(m.chat_nothing_to_undo({}, { locale }));
          return;
        }
        state.draft = state.previousDraft;
        state.previousDraft = null;
        state.pendingIssue = null;
        draftChanged = true;
        undone = true;
        codeAnswered = true;
        return;
      }
      case 'send_pdf': {
        const document = await issuedDocument(output.document_number);
        if (!document?.number) {
          ask(m.chat_document_not_found({}, { locale }));
          return;
        }
        const { pdf } = await deps.documents.pdf(actor, document.id);
        outbox.push({
          kind: 'document',
          pdf,
          filename: `${document.number.replace(/[/\\]/g, '-')}.pdf`,
          caption: m.chat_issued_caption(
            { type: typeLabel(document.type), number: document.number },
            { locale },
          ),
        });
        return;
      }
      case 'convert_to_proforma':
      case 'convert_to_invoice': {
        const document = await issuedDocument(output.document_number);
        if (!document) {
          ask(m.chat_document_not_found({}, { locale }));
          return;
        }
        const target = output.action === 'convert_to_invoice' ? 'invoice' : 'proforma';
        try {
          const converted = await deps.documents.convert(actor, document.id, target);
          const preview = await deps.documents.preview(actor, converted);
          resetDocument();
          state.documentId = converted;
          propose(converted, preview.sha256, preview.pdf);
        } catch (error) {
          if (!(error instanceof DocumentError)) throw error;
          ask(m.chat_convert_refused({}, { locale }));
        }
        return;
      }
      case 'open_space':
        return sendLink('/espace');
      case 'open_documents':
        return sendLink('/espace/documents');
      case 'open_presentation':
        return sendLink('/espace/presentation');
      case 'open_subscription':
        return sendLink('/espace/abonnement');
    }
  }

  /** The summary of a changed draft, first — after « c'est annulé » when it was an undo. */
  function showSummary() {
    if (!draftChanged || !state.draft) return;
    outbox.unshift({ kind: 'text', text: summaryForPerson(state.draft, locale) });
    if (undone) outbox.unshift({ kind: 'text', text: m.chat_undone({}, { locale }) });
    draftChanged = false;
  }

  /**
   * The next step as buttons (spec 011): after an issued document, what comes next; under a
   * complete draft whose issuer is known, the preview and the final document. Never when the
   * code already asked its own question.
   */
  async function offerNext() {
    if (outbox.some((item) => item.kind === 'text' && item.actions?.length)) return;
    let actions: OutboundAction[] = [];
    if (justIssued) {
      if (canConvert(justIssued.type, 'issued', 'invoice')) {
        actions.push({ id: TO_INVOICE, label: m.chat_button_invoice({}, { locale }) });
      }
      actions.push({ id: NEW_DOCUMENT, label: m.chat_button_new({}, { locale }) });
      outbox.push({
        kind: 'text',
        text: m.chat_issued_forward(
          { type: typeLabel(justIssued.type), client: justIssued.client },
          { locale },
        ),
        actions,
      });
      return;
    }
    if (codeAnswered || !state.draft || state.pendingIssue) return;
    if (missingOf(state.draft).length > 0 || !(await deps.documents.profile(actor))) return;
    actions = [
      ...(previewSent ? [] : [{ id: SHOW_PREVIEW, label: m.chat_button_preview({}, { locale }) }]),
      { id: FINAL_DOCUMENT, label: m.chat_button_final({}, { locale }) },
      { id: EDIT_DRAFT, label: m.chat_button_edit({}, { locale }) },
    ];
    const last = outbox.at(-1);
    if (last?.kind === 'text') last.actions = actions;
    else outbox.push({ kind: 'text', text: m.chat_next_step({}, { locale }), actions });
  }

  return {
    state,
    outbox,
    say,
    /** The document this turn worked on — to count what the model cost for each document. */
    workedOn: () => issuedId ?? state.pendingIssue?.documentId ?? state.documentId,

    /** The model's decision, applied in order: name, document, draft, action, then its reply. */
    async apply(output: TurnOutput, draft: WorkingDraft | null, options: { first: boolean }) {
      const name = output.issuer_name?.trim();
      if (name) await deps.documents.setIssuerName(actor, name);
      if (output.new_document) resetDocument();
      if (draft && !sameDraft(draft, state.draft)) {
        // The version before this change is what « annule » brings back.
        state.previousDraft = state.draft;
        state.draft = draft;
        // A changed draft is not the one previewed: its proposal is void.
        state.pendingIssue = null;
        draftChanged = true;
      }
      await act(output);
      showSummary();
      const reply = output.reply.trim();
      // Her very first message, with nothing to price yet: Firmo presents itself with an example.
      if (options.first && !draft && output.action === 'none') say(m.chat_welcome({}, { locale }));
      else if (reply && !codeAnswered) say(reply);
      await offerNext();
    },

    /** A pressed button: its action, run at once. */
    async press(id: string) {
      if (id === ISSUE_CONFIRM) await confirmIssue();
      else if (id === ISSUE_CANCEL) {
        state.pendingIssue = null;
        say(m.chat_issue_cancelled({}, { locale }));
      } else if (id === SHOW_PREVIEW) await act(action('show_preview'));
      else if (id === FINAL_DOCUMENT) await act(action('propose_issue'));
      else if (id === TO_INVOICE) await act(action('convert_to_invoice'));
      else if (id === EDIT_DRAFT) {
        ask(m.chat_edit_hint({}, { locale }));
        return;
      } else if (id === NEW_DOCUMENT) {
        resetDocument();
        ask(m.chat_new_document({}, { locale }));
        return;
      } else return;
      showSummary();
      await offerNext();
    },

    /** What a button said, for the conversation's memory. */
    buttonLabel(id: string): string {
      return (
        {
          [ISSUE_CONFIRM]: m.chat_issue_confirm_button({}, { locale }),
          [ISSUE_CANCEL]: m.chat_issue_cancel_button({}, { locale }),
          [SHOW_PREVIEW]: m.chat_button_preview({}, { locale }),
          [FINAL_DOCUMENT]: m.chat_button_final({}, { locale }),
          [EDIT_DRAFT]: m.chat_button_edit({}, { locale }),
          [TO_INVOICE]: m.chat_button_invoice({}, { locale }),
          [NEW_DOCUMENT]: m.chat_button_new({}, { locale }),
        }[id] ?? id
      );
    },

    /** The exchange, as the person saw it: links are never kept, documents by their caption. */
    remember(text: string) {
      const firmo = outbox
        .map((item) =>
          item.kind === 'text'
            ? item.text.replace(/https?:\/\/\S+/g, '[lien]')
            : `[PDF : ${item.caption}]`,
        )
        .join('\n');
      state.history.push({ person: text.slice(0, 1500), firmo: firmo.slice(0, 1500) });
      state.history = state.history.slice(-MAX_EXCHANGES);
    },
  };
}
