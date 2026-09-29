import { z } from 'zod';
import { DocumentError, type Documents } from '@/features/documents';
import type { Identity, SenderProof } from '@/features/identity';
import * as m from '@/paraglide/messages.js';
import { inOrganization } from '@/platform/tenancy';
import {
  EvidenceError,
  missingOf,
  numbersIn,
  saidText,
  toDraftInput,
  type WorkingDraft,
} from './draft';
import {
  loadConversation,
  saveConversation,
  type ConversationState,
} from './infrastructure/conversations';
import { INSTRUCTIONS } from './instructions';
import type {
  ConversationModel,
  InboundMessage,
  MessagingChannel,
  ModelTool,
  OutboundAction,
  ToolCall,
  TurnUsage,
} from './ports';
import { draftForModel, summaryForPerson, type ChatLocale } from './summary';
import {
  addToDraft,
  changeDraft,
  jsonSchemaOf,
  removeFromDraft,
  TOOLS,
  type ToolName,
} from './tools';

/**
 * The conversation: a bounded agent. One model turn per message; the model acts only through
 * tools, each a use case with its guard; the code writes every amount the person reads, and
 * every reply goes to the sender of the message it answers — nobody else (constitution III).
 */
export interface ConversationDeps {
  model: ConversationModel;
  channels: Partial<Record<InboundMessage['channel'], MessagingChannel>>;
  identity: Identity;
  documents: Documents;
  locale?: ChatLocale;
}

type Outgoing =
  | { kind: 'text'; text: string; actions?: OutboundAction[] }
  | { kind: 'document'; pdf: Uint8Array; filename: string; caption: string };

export const ISSUE_CONFIRM = 'issue:confirm';
export const ISSUE_CANCEL = 'issue:cancel';
const AFFIRMATIVE =
  /\b(oui|ouais|ok|okay|d'?accord|vas[- ]y|valide|valid[ée]|c'?est bon|[ée]mets?|confirme|yes|go)\b/i;

const toolList: ModelTool[] = Object.entries(TOOLS).map(([name, tool]) => ({
  name,
  description: tool.description,
  parameters: jsonSchemaOf(tool.args),
}));

export function createConversation(deps: ConversationDeps) {
  const locale = deps.locale ?? 'fr';

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
        return { organizationId: actor.organizationId, usage };
      }
      if (message.kind === 'unsupported') {
        await channel.sendText(to, m.chat_unsupported({}, { locale }));
        return { organizationId: actor.organizationId, usage };
      }

      const state = await inOrganization(actor.organizationId, (tx) =>
        loadConversation(tx, actor.organizationId, message.channel, message.sender),
      );
      const turn = createTurn({ deps, locale, actor, personId: sender.personId, state });

      if (message.kind === 'action') {
        await channel.acknowledgeAction?.(message);
        if (message.action === ISSUE_CONFIRM) await turn.confirmIssue(true);
        else if (message.action === ISSUE_CANCEL) turn.cancelIssue();
        await inOrganization(actor.organizationId, (tx) => saveConversation(tx, turn.state));
        await deliver(channel, to, turn.outbox);
        return { organizationId: actor.organizationId, usage };
      }

      const text = await textOf(message, channel, usage);
      if (!text) {
        await channel.sendText(to, m.chat_unsupported({}, { locale }));
        return { organizationId: actor.organizationId, usage };
      }
      const profile = await deps.documents.profile(actor);
      const latest = await deps.documents.latestIssued(actor);
      const input = [
        `Nom d'émetteur : ${profile?.name ?? 'pas encore donné (à demander avant le premier aperçu)'}`,
        `Émission proposée en attente de confirmation : ${turn.state.pendingIssue ? 'oui' : 'non'}`,
        `Dernier document émis : ${latest ? `${latest.type} ${latest.number ?? ''} pour ${latest.clientName}` : 'aucun'}`,
        'Échanges récents :',
        ...(turn.state.history.length
          ? turn.state.history.map((h) => `- Personne : ${h.person}\n  Firmo : ${h.firmo}`)
          : ['- aucun']),
        'Brouillon :',
        draftForModel(turn.state.draft),
        '',
        `Dernier message de la personne :\n${text}`,
      ].join('\n');

      const result = await deps.model.runTurn(
        { instructions: INSTRUCTIONS, input, tools: toolList, safetyId: actor.organizationId },
        (call) => turn.execute(call, text),
      );
      usage.push(result.usage);
      const reply = guardReply(result.reply, text, turn.state.draft, locale);
      turn.finish(text, reply);
      await inOrganization(actor.organizationId, (tx) => saveConversation(tx, turn.state));
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

/**
 * The model's reply may not state an amount the code did not produce: a large number absent from
 * the person's message and from the draft replaces the reply with a neutral one.
 */
export function guardReply(
  reply: string,
  message: string,
  draft: WorkingDraft | null,
  locale: ChatLocale,
): string {
  const trimmed = reply.trim();
  if (!trimmed) return m.chat_fallback_reply({}, { locale });
  const known = new Set(numbersIn(message));
  if (draft) {
    for (const line of draft.sections.flatMap((s) => s.lines)) {
      for (const value of [line.quantity, line.unit_price, line.flat_amount])
        if (value) known.add(value);
    }
    for (const adjustment of draft.adjustments) if (adjustment.value) known.add(adjustment.value);
  }
  const invented = numbersIn(trimmed).filter(
    (n) => n.replace('.', '').length >= 4 && !known.has(n),
  );
  return invented.length > 0 ? m.chat_fallback_reply({}, { locale }) : trimmed;
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
  let lastMessage = '';

  const typeLabel = (type: 'quote' | 'proforma' | 'invoice') =>
    ({
      quote: m.chat_type_quote({}, { locale }),
      proforma: m.chat_type_proforma({}, { locale }),
      invoice: m.chat_type_invoice({}, { locale }),
    })[type];

  const ok = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ ok: true, ...extra, brouillon: draftForModel(state.draft) });
  const refused = (reason: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ ok: false, raison: reason, ...extra });

  function resetDraft() {
    state.draft = null;
    state.documentId = null;
    state.pendingIssue = null;
  }

  /** The draft as a document draft, previewed: its exact snapshot hash and PDF. */
  async function prepare(): Promise<
    { documentId: number; sha256: string; pdf: Uint8Array } | string
  > {
    const draft = state.draft;
    if (!draft || draft.sections.length === 0) return 'rien à prévisualiser : aucun poste chiffré';
    const missing = missingOf(draft);
    if (missing.length > 0)
      return `informations manquantes : ${missing.map((item) => item.kind).join(', ')}`;
    const profile = await deps.documents.profile(actor);
    if (!profile)
      return `nom d'émetteur manquant : demande « ${m.chat_ask_issuer_name({}, { locale })} »`;
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

  function proposal(documentId: number, sha256: string, pdf: Uint8Array) {
    state.pendingIssue = { documentId, sha256 };
    outbox.push({
      kind: 'document',
      pdf,
      filename: 'apercu.pdf',
      caption: m.chat_preview_caption({}, { locale }),
    });
    outbox.push({
      kind: 'text',
      text: m.chat_issue_proposal({}, { locale }),
      actions: [
        { id: ISSUE_CONFIRM, label: m.chat_issue_confirm_button({}, { locale }) },
        { id: ISSUE_CANCEL, label: m.chat_issue_cancel_button({}, { locale }) },
      ],
    });
  }

  async function confirmIssue(pressed: boolean): Promise<string> {
    const pending = state.pendingIssue;
    if (!pending) return refused('aucune émission proposée : utilise propose_issue');
    if (!pressed && !AFFIRMATIVE.test(lastMessage)) {
      return refused("la personne n'a pas confirmé explicitement l'émission");
    }
    try {
      const issued = await deps.documents.issue(actor, pending.documentId, {
        sha256: pending.sha256,
      });
      const document = await deps.documents.get(actor, pending.documentId);
      const pdf = issued.pdf ?? (await deps.documents.pdf(actor, pending.documentId)).pdf;
      const caption = m.chat_issued_caption(
        { type: typeLabel(document.type), number: issued.number },
        { locale },
      );
      outbox.push({
        kind: 'document',
        pdf,
        filename: `${issued.number.replace(/[/\\]/g, '-')}.pdf`,
        caption,
      });
      resetDraft();
      return ok({ emis: issued.number });
    } catch (error) {
      if (error instanceof DocumentError) {
        state.pendingIssue = null;
        return refused(
          error.code === 'draft_changed' ? 'le brouillon a changé : propose à nouveau' : error.code,
        );
      }
      throw error;
    }
  }

  const handlers: Record<ToolName, (args: unknown, message: string) => Promise<string>> = {
    async add_to_draft(args, message) {
      state.draft = addToDraft(state.draft, TOOLS.add_to_draft.args.parse(args), message);
      if ((args as { start_new?: boolean }).start_new) {
        state.documentId = null;
      }
      state.pendingIssue = null;
      draftChanged = true;
      return ok();
    },
    async change_draft(args, message) {
      if (!state.draft) return refused('aucun brouillon actif');
      state.draft = changeDraft(state.draft, TOOLS.change_draft.args.parse(args), message);
      state.pendingIssue = null;
      draftChanged = true;
      return ok();
    },
    async remove_from_draft(args) {
      if (!state.draft) return refused('aucun brouillon actif');
      state.draft = removeFromDraft(state.draft, TOOLS.remove_from_draft.args.parse(args).ids);
      state.pendingIssue = null;
      draftChanged = true;
      return ok();
    },
    async set_issuer_name(args, message) {
      const name = saidText(TOOLS.set_issuer_name.args.parse(args).name, message);
      if (!name) return refused('nom vide');
      await deps.documents.setIssuerName(actor, name);
      return ok({ nom: name });
    },
    async start_new_document() {
      resetDraft();
      return ok();
    },
    async show_preview() {
      const prepared = await prepare();
      if (typeof prepared === 'string') return refused(prepared);
      outbox.push({
        kind: 'document',
        pdf: prepared.pdf,
        filename: 'apercu.pdf',
        caption: m.chat_preview_caption({}, { locale }),
      });
      return ok({ apercu_envoye: true });
    },
    async propose_issue() {
      const prepared = await prepare();
      if (typeof prepared === 'string') return refused(prepared);
      proposal(prepared.documentId, prepared.sha256, prepared.pdf);
      return ok({ proposition_envoyee: true, note: 'le code a envoyé l’aperçu et les boutons' });
    },
    async confirm_issue() {
      return confirmIssue(false);
    },
    async send_latest_pdf() {
      const latest = await deps.documents.latestIssued(actor);
      if (!latest?.number) return refused('aucun document émis');
      const { pdf } = await deps.documents.pdf(actor, latest.id);
      const caption = m.chat_issued_caption(
        { type: typeLabel(latest.type), number: latest.number },
        { locale },
      );
      outbox.push({
        kind: 'document',
        pdf,
        filename: `${latest.number.replace(/[/\\]/g, '-')}.pdf`,
        caption,
      });
      return ok({ envoye: latest.number });
    },
    async convert_latest(args) {
      const { target } = TOOLS.convert_latest.args.parse(args);
      const latest = await deps.documents.latestIssued(actor);
      if (!latest) return refused('aucun document émis à convertir');
      const converted = await deps.documents.convert(actor, latest.id, target);
      const preview = await deps.documents.preview(actor, converted);
      state.draft = null;
      state.documentId = converted;
      proposal(converted, preview.sha256, preview.pdf);
      return ok({ converti_depuis: latest.number, proposition_envoyee: true });
    },
    async find_documents(args) {
      const query = TOOLS.find_documents.args.parse(args).query.toLowerCase();
      const all = await deps.documents.list(actor, 200);
      const found = all
        .filter((d) =>
          [d.clientName, d.subject, d.number ?? ''].some((v) => v.toLowerCase().includes(query)),
        )
        .slice(0, 5)
        .map((d) => ({
          type: d.type,
          numero: d.number ?? 'brouillon',
          client: d.clientName,
          objet: d.subject,
          date: d.documentDate,
        }));
      return JSON.stringify({ ok: true, trouves: found });
    },
    async open_space(args) {
      const { page } = TOOLS.open_space.args.parse(args);
      const path = {
        home: '/espace',
        documents: '/espace/documents',
        presentation: '/espace/presentation',
      }[page];
      const link = await deps.identity.spaceLink(personId, path);
      outbox.push({ kind: 'text', text: m.chat_space_link({ url: link.url }, { locale }) });
      return ok({ lien_envoye: true });
    },
  };

  return {
    state,
    outbox,
    confirmIssue: (pressed: boolean) => confirmIssue(pressed),
    cancelIssue() {
      state.pendingIssue = null;
      outbox.push({ kind: 'text', text: m.chat_issue_cancelled({}, { locale }) });
    },
    async execute(call: ToolCall, message: string): Promise<string> {
      lastMessage = message;
      const handler = handlers[call.name as ToolName];
      if (!handler) return refused(`outil inconnu : ${call.name}`);
      let args: unknown;
      try {
        args = JSON.parse(call.arguments || '{}');
      } catch {
        return refused('arguments illisibles');
      }
      try {
        return await handler(args, message);
      } catch (error) {
        if (error instanceof EvidenceError) return refused(error.message);
        if (error instanceof z.ZodError) return refused('arguments invalides');
        if (error instanceof DocumentError) return refused(error.code);
        throw error;
      }
    },
    /**
     * Closes the turn, in reading order: the code's summary when the draft changed, then what the
     * tools produced (PDFs, the issuance question with its buttons, links), then the model's
     * reply — left out when the issuance question already asks the only thing to ask.
     */
    finish(message: string, reply: string) {
      if (draftChanged && state.draft) {
        outbox.unshift({ kind: 'text', text: summaryForPerson(state.draft, locale) });
      }
      const asksAlready = outbox.some((item) => item.kind === 'text' && item.actions?.length);
      if (!asksAlready) outbox.push({ kind: 'text', text: reply });
      state.history.push({ person: message.slice(0, 500), firmo: reply.slice(0, 500) });
      state.history = state.history.slice(-12);
    },
  };
}
