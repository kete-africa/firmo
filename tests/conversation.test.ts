import { randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createConversation,
  ISSUE_CONFIRM,
  type ConversationMessage,
  type ConversationModel,
  FINAL_DOCUMENT,
  TO_INVOICE,
  type DraftOutput,
  type InboundMessage,
  type MessagingChannel,
  type TurnOutput,
} from '@/features/conversation';
import { createDocuments } from '@/features/documents';
import { createIdentity, type AccountDirectory } from '@/features/identity';
import { getPool } from '@/platform/db';
import { typstRenderer } from '@/platform/typst';
import { purgeOrganizations } from './support/cleanup';

// Spec 010: the conversation, end to end below the channels — a scripted model stands for the AI
// (its structured output, one per message); the database, the documents and Typst are real. What
// is proven here is the code's part: the state it keeps per sender, what the model reads, the
// validation, the summaries, the issuance, and that a reply only ever goes to its sender.
// The model's own understanding is proven with the real model: pnpm eval:conversation.

const run = randomBytes(3).toString('hex');
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
const organizations: string[] = [];
let counter = 0;

const directory: AccountDirectory = {
  async provisionPerson() {
    counter += 1;
    const organizationId = `org_conv_${run}_${counter}`;
    organizations.push(organizationId);
    return { personId: `usr_conv_${run}_${counter}`, organizationId, created: true };
  },
  async signInLink({ personId }) {
    return { url: `https://compte.test/l/${personId}`, expiresAt: '' };
  },
};

/** A channel that records what it sends, and to whom. */
function recordingChannel(channel: 'whatsapp' | 'telegram') {
  const sent: {
    to: string;
    text?: string;
    actions?: string[];
    document?: string;
    contactAsked?: boolean;
  }[] = [];
  const typing: string[] = [];
  const adapter: MessagingChannel = {
    channel,
    async sendText(to, text, actions) {
      sent.push({ to, text, ...(actions ? { actions: actions.map((a) => a.id) } : {}) });
    },
    async sendDocument(to, pdf, filename, caption) {
      expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      sent.push({ to, document: `${filename}|${caption}` });
    },
    async askForContact(to, text) {
      sent.push({ to, text, contactAsked: true });
    },
    async download() {
      return { bytes: new Uint8Array([1]), mediaType: 'audio/ogg' };
    },
    typing() {
      typing.push('shown');
      return () => typing.push('stopped');
    },
  };
  return { adapter, sent, typing };
}

/** A structured output, with the fields a step leaves out at their neutral value. */
const out = (step: Partial<TurnOutput>): TurnOutput => ({
  reply: '',
  draft: null,
  new_document: false,
  issuer_name: null,
  action: 'none',
  document_number: null,
  ...step,
});

type Step = Partial<TurnOutput> | 'not a turn';

/**
 * The AI, scripted: each call answers the next step — or, given a function, answers from the
 * conversation it reads. Every conversation it was given is kept, to prove what it reads.
 */
function scriptedModel(steps: Step[] | ((messages: ConversationMessage[]) => Step)) {
  const read: ConversationMessage[][] = [];
  const model: ConversationModel = {
    async transcribeAudio() {
      return { text: 'transcription', usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1 } };
    },
    async transcribeImage() {
      return { text: 'lecture', usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1 } };
    },
    async decide(request) {
      read.push(structuredClone(request.messages));
      const step = typeof steps === 'function' ? steps(request.messages) : steps.shift();
      if (step === undefined) throw new Error('no scripted turn left');
      return {
        output: step === 'not a turn' ? { reply: 42 } : out(step),
        usage: { inputTokens: 1, outputTokens: 1, modelCalls: 1 },
      };
    },
  };
  return { model, read };
}

const text = (sender: string, words: string): InboundMessage => ({
  channel: 'whatsapp',
  providerMessageId: randomBytes(6).toString('hex'),
  sender,
  displayName: null,
  kind: 'text',
  text: words,
});

const sale =
  "Devis pour M. Kodjo, portail : 12 barres de tube 80x40 à 18 000 F, la tôle 4 feuilles à 32.000, main d'oeuvre 25 %";

const line = (label: string, unit: string | null, quantity: number, unitPrice: number) => ({
  label,
  description: null,
  unit,
  quantity,
  unit_price: unitPrice,
  flat_amount: null,
  descriptive: false,
});

const saleDraft: DraftOutput = {
  document_type: 'quote',
  subject: 'Portail',
  client_name: 'M. Kodjo',
  client_phone: null,
  client_address: null,
  site: null,
  delivery: null,
  warranty: null,
  validity_days: null,
  tax_rate: null,
  deposit_percent: null,
  conditions: [],
  sections: [
    {
      title: null,
      show_subtotal: false,
      lines: [line('Tube 80x40', 'barre', 12, 18000), line('Tôle', 'feuille', 4, 32000)],
    },
  ],
  adjustments: [
    { label: "Main-d'œuvre", kind: 'percent', value: 25, direction: 'add', base: 'items_total' },
  ],
};

/** The sale with the sheet at another price. */
function withSheetAt(price: number): DraftOutput {
  const draft = structuredClone(saleDraft);
  const sheet = draft.sections[0]?.lines[1];
  if (sheet) sheet.unit_price = price;
  return draft;
}

const documents = createDocuments({ renderer: typstRenderer(), files: memoryStorage() });
const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });
const phone = (offset: number) => `2289${String(Date.now() + offset).slice(-7)}`;

afterAll(async () => {
  await purgeOrganizations(owner, organizations);
  await owner.end();
  await getPool().end();
});

describe('a quote, from a sale said to an issued PDF', () => {
  const number = phone(0);
  const { adapter, sent } = recordingChannel('whatsapp');
  const { model, read } = scriptedModel([
    { draft: saleDraft, reply: 'Je prépare le PDF ?' },
    { draft: withSheetAt(35000), reply: 'C’est corrigé.' },
    { action: 'propose_issue', reply: 'Je te prépare le PDF.' },
    { issuer_name: 'Atelier Kodjo', action: 'propose_issue', reply: 'Voici l’aperçu.' },
    { action: 'open_space', reply: 'Voici ton lien.' },
  ]);
  const conversation = createConversation({
    model,
    channels: { whatsapp: adapter },
    identity,
    documents,
  });

  it("shows what it understood, with the code's total, before composing anything", async () => {
    await conversation.handle(text(number, sale));
    expect(sent.every((s) => s.to === number)).toBe(true);
    expect(sent[0]?.text).toContain('Total : 430 000 F CFA');
    expect(sent[1]?.text).toBe('Je prépare le PDF ?');
    expect(sent.some((s) => s.document)).toBe(false);
  });

  it('applies a correction, and the model read the whole exchange before it', async () => {
    sent.length = 0;
    await conversation.handle(text(number, "non la tôle c'est 35 000"));
    expect(sent[0]?.text).toContain('Total : 445 000 F CFA');
    const second = read[1] ?? [];
    expect(second.map((m) => m.role)).toEqual(['person', 'firmo', 'person']);
    expect(second[0]?.text).toBe(sale);
    // What the person saw — the code's summary — is what the model remembers Firmo said.
    expect(second[1]?.text).toContain('Total : 430 000 F CFA');
    expect(second[2]?.text).toContain('"unit_price":18000');
    expect(second[2]?.text).toContain("non la tôle c'est 35 000");
  });

  it('asks the issuer name itself before a first document, instead of the model', async () => {
    sent.length = 0;
    await conversation.handle(text(number, 'prépare le pdf final'));
    expect(sent.map((s) => s.text)).toEqual(['Sous quel nom veux-tu que ce devis parte ?']);
  });

  it('shows the exact preview and waits for a confirmation', async () => {
    sent.length = 0;
    await conversation.handle(text(number, 'Atelier Kodjo'));
    expect(sent.find((s) => s.document)?.document).toContain('apercu.pdf');
    expect(sent.find((s) => s.actions)?.actions).toContain(ISSUE_CONFIRM);
    // The code's question with its buttons is the only question: the model's reply is not added.
    expect(sent.some((s) => s.text === 'Voici l’aperçu.')).toBe(false);
  });

  it('issues on the confirmation button, with its final number', async () => {
    sent.length = 0;
    await conversation.handle({ ...text(number, ''), kind: 'action', action: ISSUE_CONFIRM });
    expect(sent.find((s) => s.document)?.document).toMatch(
      /DEV-\d{4}-001\.pdf\|devis DEV-\d{4}-001/,
    );
  });

  it('starts the next document afresh: no past price, and never a sign-in link, in memory', async () => {
    sent.length = 0;
    await conversation.handle(text(number, 'envoie-moi le lien de mon espace'));
    expect(sent[0]?.text).toContain('https://compte.test/l/');
    const { rows } = await owner.query<{ history: { person: string; firmo: string }[] }>(
      'select history from conversations where sender = $1',
      [number],
    );
    const history = rows[0]?.history ?? [];
    // What remains of the issued quote: the pressed button and the PDF — never its prices.
    expect(history.map((h) => h.person)).toEqual(['[Émettre]', 'envoie-moi le lien de mon espace']);
    expect(history.map((h) => h.firmo).join('\n')).not.toMatch(/18 000|Total/);
    expect(history[1]?.firmo).toContain('[lien]');
    expect(history[1]?.firmo).not.toContain('https://');
  });

  it('counts what the model cost, per turn and for the document it worked on', async () => {
    const organizationId = organizations.at(-1) ?? '';
    const { rows } = await owner.query<{ turns: string; calls: string; documents: string }>(
      `select count(*) as turns, sum(model_calls) as calls, count(document_id) as documents
       from ai_usage where organization_id = $1`,
      [organizationId],
    );
    expect(rows[0]).toMatchObject({ turns: '5', calls: '5' });
    expect(Number(rows[0]?.documents)).toBeGreaterThan(0);
  });
});

describe('what the model understands becomes the draft as is', () => {
  it('a quantity said in words, and one group per item when he asks for it', async () => {
    const number = phone(1);
    const { adapter, sent } = recordingChannel('whatsapp');
    const grouped: DraftOutput = {
      ...saleDraft,
      adjustments: [],
      sections: [
        { title: 'Tube', show_subtotal: true, lines: [line('Tube 80x40', 'barre', 12, 18000)] },
        {
          title: 'Tube annelé',
          show_subtotal: true,
          lines: [line('Tube annelé', null, 1, 140000)],
        },
      ],
    };
    const { model } = scriptedModel([{ draft: grouped, reply: 'C’est ajouté.' }]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(
      text(number, "Ajoute un tube annellé à 140000. J'aimerais que chacun soit dans un groupe"),
    );
    const summary = sent[0]?.text ?? '';
    expect(summary).toContain('Tube annelé\n• Tube annelé : 1 × 140 000 F CFA');
    expect(summary).toContain('Total : 356 000 F CFA');
  });
});

describe('the output is checked, and sent back once when it is wrong', () => {
  it('a line priced two ways goes back to the model with what to fix', async () => {
    const number = phone(2);
    const { adapter, sent } = recordingChannel('whatsapp');
    const wrong = structuredClone(saleDraft);
    const tube = wrong.sections[0]?.lines[0];
    if (tube) tube.flat_amount = 200000;
    const { model, read } = scriptedModel([
      { draft: wrong, reply: 'Noté.' },
      { draft: saleDraft, reply: 'Noté.' },
    ]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, sale));
    expect(read[1]?.at(-1)?.text).toContain('un forfait, ou une quantité et un prix, pas les deux');
    expect(sent[0]?.text).toContain('Total : 430 000 F CFA');
  });

  it('twice wrong: nothing changes, and a neutral reply', async () => {
    const number = phone(3);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel(['not a turn', 'not a turn']);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, sale));
    expect(sent[0]?.text).toBe("C'est noté. Dis-moi la suite.");
    const { rows } = await owner.query<{ draft: unknown }>(
      'select draft from conversations where sender = $1',
      [number],
    );
    expect(rows[0]?.draft).toBeNull();
  });
});

describe('resuming, and starting over', () => {
  it('tells the model how long she was away', async () => {
    const number = phone(9);
    const { adapter } = recordingChannel('whatsapp');
    let clock = new Date();
    const { model, read } = scriptedModel([
      { draft: saleDraft, reply: 'Noté.' },
      { reply: 'Salut !' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
      now: () => clock,
    });
    await conversation.handle(text(number, sale));
    expect(read[0]?.at(-1)?.text).toContain('Son dernier message avant celui-ci : première fois');
    clock = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await conversation.handle(text(number, 'Cc'));
    expect(read[1]?.at(-1)?.text).toContain('Son dernier message avant celui-ci : il y a 2 jours');
  });

  it('a new quote asked without its content sets the draft aside, and forgets its exchanges', async () => {
    const number = phone(10);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model, read } = scriptedModel([
      { draft: saleDraft, reply: 'Noté.' },
      { new_document: true, reply: 'D’accord, que chiffre-t-on ?' },
      { reply: 'Je t’écoute.' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, sale));
    sent.length = 0;
    await conversation.handle(text(number, 'je veux commencer un nouveau devis'));
    expect(sent.map((s) => s.text)).toEqual(['D’accord, que chiffre-t-on ?']);
    const { rows } = await owner.query<{ draft: unknown }>(
      'select draft from conversations where sender = $1',
      [number],
    );
    expect(rows[0]?.draft).toBeNull();
    await conversation.handle(text(number, 'une porte'));
    const third = read[2] ?? [];
    expect(third.map((m) => m.text).join('\n')).not.toContain('Tube 80x40');
    expect(third[0]?.text).toBe('je veux commencer un nouveau devis');
  });
});

describe('a guided conversation (spec 011)', () => {
  const authorDraft: DraftOutput = {
    ...saleDraft,
    sections: [
      { title: 'Tube', show_subtotal: true, lines: [line('Tube', 'barre', 12, 18000)] },
      { title: 'Tube annelé', show_subtotal: true, lines: [line('Tube annelé', null, 1, 140000)] },
    ],
    tax_rate: 18,
    adjustments: [
      { label: "Main-d'œuvre", kind: 'percent', value: 10, direction: 'add', base: 'items_total' },
      { label: 'Réduction', kind: 'percent', value: 5, direction: 'subtract', base: 'items_total' },
    ],
  };
  const pressed = (sender: string, id: string): InboundMessage => ({
    ...text(sender, ''),
    kind: 'action',
    action: id,
  });

  it('shows every level of the total, and what each percentage is taken on', async () => {
    const number = phone(20);
    const { adapter, sent, typing } = recordingChannel('whatsapp');
    const { model } = scriptedModel([{ draft: authorDraft, reply: 'C’est ajouté.' }]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, 'Ajoute la main d’oeuvre à 10%, la TVA à 18%, une réduction de 5%'));
    const summary = sent.find((s) => s.text?.startsWith('Brouillon'))?.text ?? '';
    for (const level of [
      '• Tube (barre) : 12 × 18 000 F CFA = 216 000 F CFA',
      '• Tube annelé : 1 × 140 000 F CFA = 140 000 F CFA',
      'Sous-total des postes : 356 000 F CFA',
      "• Main-d'œuvre, 10 % du sous-total des postes : + 35 600 F CFA",
      '• Réduction, 5 % du sous-total des postes : − 17 800 F CFA',
      'Total HT : 373 800 F CFA',
      'TVA 18 % : + 67 284 F CFA',
      'Total TTC : 441 084 F CFA',
    ]) {
      expect(summary).toContain(level);
    }
    // Typing is shown while Firmo works, and stopped before it answers.
    expect(typing).toEqual(['shown', 'stopped']);
  });

  it('greets a first message with an example, and asks the issuer name before any button', async () => {
    const number = phone(21);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel([
      { reply: 'Bonjour !' },
      { draft: saleDraft, reply: 'Sous quel nom tes documents partent-ils ?' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, 'Bonjour'));
    expect(sent.find((s) => s.text?.startsWith('Bienvenue'))?.text).toContain(
      'Devis pour M. Kodjo',
    );
    sent.length = 0;
    await conversation.handle(text(number, sale));
    expect(sent.some((s) => s.actions)).toBe(false);
  });

  it('from buttons: the final document, its issuance, then the invoice — without the model', async () => {
    const number = phone(22);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model, read } = scriptedModel([
      { draft: saleDraft, issuer_name: 'Atelier Koffi', reply: 'C’est noté.' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, `${sale}. Atelier Koffi`));
    expect(sent.find((s) => s.actions)?.actions).toEqual([
      'draft:preview',
      FINAL_DOCUMENT,
      'draft:edit',
    ]);

    sent.length = 0;
    await conversation.handle(pressed(number, FINAL_DOCUMENT));
    expect(sent.find((s) => s.document)?.document).toContain('apercu.pdf');
    expect(sent.find((s) => s.actions)?.actions).toEqual([ISSUE_CONFIRM, 'issue:cancel']);

    sent.length = 0;
    await conversation.handle(pressed(number, ISSUE_CONFIRM));
    expect(sent.find((s) => s.document)?.document).toMatch(/DEV-\d{4}-001\.pdf/);
    const next = sent.find((s) => s.actions);
    expect(next?.text).toContain('Transfère ce PDF à M. Kodjo');
    expect(next?.actions).toEqual([TO_INVOICE, 'doc:new']);

    sent.length = 0;
    await conversation.handle(pressed(number, TO_INVOICE));
    expect(sent.find((s) => s.document)?.document).toContain('apercu.pdf');
    expect(sent.find((s) => s.actions)?.actions).toEqual([ISSUE_CONFIRM, 'issue:cancel']);
    // Four steps, one model call: the buttons never waited for it.
    expect(read).toHaveLength(1);
  });

  it('« annule » brings back the version before the last change', async () => {
    const number = phone(23);
    const { adapter, sent } = recordingChannel('whatsapp');
    const fifteen = structuredClone(saleDraft);
    const tube = fifteen.sections[0]?.lines[0];
    if (tube) tube.quantity = 15;
    const { model } = scriptedModel([
      { draft: saleDraft, reply: 'Noté.' },
      { draft: fifteen, reply: 'Noté.' },
      { action: 'undo_last_change', reply: 'C’est annulé.' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, sale));
    await conversation.handle(text(number, 'mets les tubes à 15'));
    sent.length = 0;
    await conversation.handle(text(number, "non annule, c'était bien 12"));
    const texts = sent.map((s) => s.text ?? '');
    expect(texts[0]).toBe("J'ai remis la version précédente.");
    expect(texts[1]).toContain('Tube 80x40 (barre) : 12 × 18 000 F CFA');
  });
});

describe('the plans (spec 007)', () => {
  it('beyond what was bought, the code sends the way to subscribe and keeps the proposal', async () => {
    const number = phone(4);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel([
      {
        draft: saleDraft,
        issuer_name: 'Atelier Kodjo',
        action: 'propose_issue',
        reply: 'Voici l’aperçu.',
      },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents: createDocuments({
        renderer: typstRenderer(),
        files: memoryStorage(),
        gate: { admit: async () => 'plan_required' },
      }),
    });
    await conversation.handle(text(number, `${sale}. Atelier Kodjo, fais le pdf final`));
    sent.length = 0;
    await conversation.handle({ ...text(number, ''), kind: 'action', action: ISSUE_CONFIRM });
    expect(sent.some((s) => s.document)).toBe(false);
    const way = sent.find((s) => s.text?.includes('https://compte.test/l/'));
    expect(way?.text).toContain('abonne');
    const { rows } = await owner.query<{ pending: unknown }>(
      'select pending_issue as pending from conversations where sender = $1',
      [number],
    );
    expect(rows[0]?.pending).not.toBeNull();
  });
});

describe('issuance', () => {
  it('never happens without a proposal, whatever the model decides', async () => {
    const number = phone(5);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel([
      { draft: saleDraft, issuer_name: 'M. Kodjo', action: 'confirm_issue', reply: 'Émis.' },
    ]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, sale));
    expect(sent.some((s) => s.document)).toBe(false);
    const { rows } = await owner.query<{ n: string }>(
      "select count(*) as n from documents where organization_id = $1 and state <> 'draft'",
      [organizations.at(-1)],
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('a draft changed after the preview voids the proposal', async () => {
    const number = phone(6);
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel([
      { draft: saleDraft, issuer_name: 'M. Kodjo', action: 'propose_issue', reply: '' },
      { draft: withSheetAt(35000), action: 'confirm_issue', reply: 'Émis.' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, sale));
    sent.length = 0;
    await conversation.handle(text(number, 'oui mais la tôle à 35 000'));
    expect(sent.some((s) => s.document)).toBe(false);
    expect(sent[0]?.text).toContain('Total : 445 000 F CFA');
  });
});

describe('two senders at once', () => {
  it('each model call reads only its sender, and each gets only his own replies', async () => {
    const a = phone(7);
    const b = phone(8);
    const { adapter, sent } = recordingChannel('whatsapp');
    const otherSale = 'Devis pour Mme Afi : porte en bois 1 à 150 000 F';
    const otherDraft: DraftOutput = {
      ...saleDraft,
      client_name: 'Mme Afi',
      subject: 'Porte',
      adjustments: [],
      sections: [
        { title: null, show_subtotal: false, lines: [line('Porte en bois', null, 1, 150000)] },
      ],
    };
    const { model, read } = scriptedModel((messages) =>
      messages.at(-1)?.text.includes('Mme Afi')
        ? { draft: otherDraft, reply: 'Pour B.' }
        : { draft: saleDraft, reply: 'Pour A.' },
    );
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await Promise.all([
      conversation.handle(text(a, sale)),
      conversation.handle(text(b, otherSale)),
    ]);
    const to = (who: string) =>
      sent
        .filter((s) => s.to === who)
        .map((s) => s.text ?? '')
        .join('\n');
    expect(to(a)).toContain('Tube 80x40');
    expect(to(a)).not.toContain('Porte en bois');
    expect(to(b)).toContain('Porte en bois');
    expect(to(b)).not.toContain('Tube 80x40');
    for (const conversationRead of read) {
      const all = conversationRead.map((m) => m.text).join('\n');
      expect(all.includes('Mme Afi') && all.includes('M. Kodjo')).toBe(false);
    }
  });
});

describe('Telegram', () => {
  it('asks for the number once, then welcomes her own contact', async () => {
    const userId = `8${String(Date.now()).slice(-9)}`;
    const { adapter, sent } = recordingChannel('telegram');
    const { model } = scriptedModel([]);
    const conversation = createConversation({
      model,
      channels: { telegram: adapter },
      identity,
      documents,
    });
    await conversation.handle({ ...text(userId, 'bonjour'), channel: 'telegram' });
    expect(sent[0]).toMatchObject({ to: userId, contactAsked: true });
    await conversation.handle({
      ...text(userId, ''),
      channel: 'telegram',
      kind: 'contact',
      contact: { phoneNumber: `+2289${String(Date.now()).slice(-7)}`, userId },
    });
    expect(sent[1]?.text).toContain('Bienvenue');
  });
});
