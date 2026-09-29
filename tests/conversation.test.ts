import { randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createConversation,
  ISSUE_CONFIRM,
  type ConversationModel,
  type InboundMessage,
  type MessagingChannel,
  type ToolCall,
} from '@/features/conversation';
import { createDocuments } from '@/features/documents';
import { createIdentity, type AccountDirectory } from '@/features/identity';
import { getPool } from '@/platform/db';
import { typstRenderer } from '@/platform/typst';
import { purgeOrganizations } from './support/cleanup';

// Phase 3: the conversation, end to end below the channels — a scripted model stands for the AI;
// the database, the documents and Typst are real. What is proven here is the code's part: the
// guards, the summaries, the issuance, and that a reply only ever goes to its sender.

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
  };
  return { adapter, sent };
}

type Step = { calls: { name: string; args: unknown }[]; reply: string };

/** The AI, scripted: each turn makes the given tool calls, then replies. */
function scriptedModel(steps: Step[]) {
  const results: string[][] = [];
  const model: ConversationModel = {
    async transcribeAudio() {
      return { text: 'transcription', usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1 } };
    },
    async transcribeImage() {
      return { text: 'lecture', usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1 } };
    },
    async runTurn(_request, execute) {
      const step = steps.shift();
      if (!step) throw new Error('no scripted turn left');
      const turn: string[] = [];
      for (const call of step.calls) {
        turn.push(
          await execute({
            name: call.name,
            arguments: JSON.stringify(call.args),
          } satisfies ToolCall),
        );
      }
      results.push(turn);
      return { reply: step.reply, usage: { inputTokens: 1, outputTokens: 1, modelCalls: 1 } };
    },
  };
  return { model, results };
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
const saleArgs = {
  start_new: false,
  document_type: 'quote',
  client_name: 'M. Kodjo',
  client_phone: null,
  client_address: null,
  subject: 'Portail',
  site: null,
  delivery_text: null,
  warranty_text: null,
  conditions: [],
  validity_days: null,
  tax_rate: null,
  deposit_percent: null,
  sections: [
    {
      title: 'Portail',
      show_subtotal: true,
      lines: [
        {
          label: 'Tube 80x40',
          description: null,
          unit: 'barre',
          quantity: { value: '12', evidence: '12 barres' },
          unit_price: { value: '18000', evidence: '18 000 F' },
          flat_amount: null,
          descriptive: false,
        },
        {
          label: 'Tôle',
          description: null,
          unit: 'feuille',
          quantity: { value: '4', evidence: '4 feuilles' },
          unit_price: { value: '32000', evidence: 'à 32.000' },
          flat_amount: null,
          descriptive: false,
        },
      ],
    },
  ],
  adjustments: [
    {
      label: "Main-d'œuvre",
      mode: 'percent',
      sign: 1,
      base: 'items_total',
      value: { value: '25', evidence: "main d'oeuvre 25 %" },
    },
  ],
};

const documents = createDocuments({ renderer: typstRenderer(), files: memoryStorage() });
const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });

afterAll(async () => {
  await purgeOrganizations(owner, organizations);
  await owner.end();
  await getPool().end();
});

describe('a quote, from a sale said to an issued PDF', () => {
  const number = `2289${String(Date.now()).slice(-7)}`;
  const { adapter, sent } = recordingChannel('whatsapp');
  const { model, results } = scriptedModel([
    { calls: [{ name: 'add_to_draft', args: saleArgs }], reply: 'Je prépare le PDF ?' },
    {
      calls: [
        {
          name: 'change_draft',
          args: {
            changes: [{ id: 'L2', field: 'unit_price', value: '35000', evidence: '35 000' }],
          },
        },
      ],
      reply: 'C’est corrigé.',
    },
    {
      calls: [{ name: 'propose_issue', args: {} }],
      reply: 'Sous quel nom veux-tu que ce devis parte ?',
    },
    {
      calls: [
        { name: 'set_issuer_name', args: { name: 'Atelier Kodjo' } },
        { name: 'propose_issue', args: {} },
      ],
      reply: 'Voici l’aperçu.',
    },
  ]);
  const conversation = createConversation({
    model,
    channels: { whatsapp: adapter },
    identity,
    documents,
  });

  it("shows what it read, with the code's total, before composing anything", async () => {
    await conversation.handle(text(number, sale));
    expect(sent.every((s) => s.to === number)).toBe(true);
    expect(sent[0]?.text).toContain('Total : 430 000 F CFA');
    expect(sent[1]?.text).toBe('Je prépare le PDF ?');
    expect(sent.some((s) => s.document)).toBe(false);
  });

  it('applies a correction said in natural language', async () => {
    sent.length = 0;
    await conversation.handle(text(number, "non la tôle c'est 35 000"));
    expect(sent[0]?.text).toContain('Total : 445 000 F CFA');
  });

  it('asks the only question before a first document: the name it leaves under', async () => {
    sent.length = 0;
    await conversation.handle(text(number, 'prépare le pdf final'));
    expect(JSON.parse(results.at(-1)?.[0] ?? '{}')).toMatchObject({ ok: false });
    expect(sent.some((s) => s.document)).toBe(false);
  });

  it('shows the exact preview and waits for a confirmation', async () => {
    sent.length = 0;
    await conversation.handle(text(number, 'Atelier Kodjo'));
    expect(sent.find((s) => s.document)?.document).toContain('apercu.pdf');
    expect(sent.find((s) => s.actions)?.actions).toContain(ISSUE_CONFIRM);
  });

  it('issues on the confirmation button, with its final number', async () => {
    sent.length = 0;
    await conversation.handle({ ...text(number, ''), kind: 'action', action: ISSUE_CONFIRM });
    expect(sent.find((s) => s.document)?.document).toMatch(
      /DEV-\d{4}-001\.pdf\|devis DEV-\d{4}-001/,
    );
  });
});

describe('the guards', () => {
  it('refuses a price that was not said, and the draft stays untouched', async () => {
    const number = `2289${String(Date.now() + 1).slice(-7)}`;
    const { adapter, sent } = recordingChannel('whatsapp');
    const invented = structuredClone(saleArgs);
    const line = invented.sections[0]?.lines[1];
    if (line) line.unit_price = { value: '20000', evidence: 'à 32.000' };
    const { model, results } = scriptedModel([
      { calls: [{ name: 'add_to_draft', args: invented }], reply: 'Quel est le prix de la tôle ?' },
    ]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, sale));
    expect(JSON.parse(results[0]?.[0] ?? '{}')).toMatchObject({ ok: false });
    // No summary: the draft did not change. Then, at first use, what is kept and what is not.
    expect(sent[0]?.text).toBe('Quel est le prix de la tôle ?');
    expect(sent[1]?.text).toContain('ne sont pas conservés');
    expect(sent).toHaveLength(2);
  });

  it('never lets the reply state an amount the code did not compute', async () => {
    const number = `2289${String(Date.now() + 2).slice(-7)}`;
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model } = scriptedModel([{ calls: [], reply: 'Ton total fera 999 999 F, promis.' }]);
    await createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    }).handle(text(number, 'bonjour'));
    expect(sent[0]?.text).not.toContain('999');
  });

  it('issues nothing when the person did not say yes', async () => {
    const number = `2289${String(Date.now() + 3).slice(-7)}`;
    const { adapter, sent } = recordingChannel('whatsapp');
    const { model, results } = scriptedModel([
      {
        calls: [
          { name: 'add_to_draft', args: saleArgs },
          { name: 'set_issuer_name', args: { name: 'M. Kodjo' } },
          { name: 'propose_issue', args: {} },
        ],
        reply: 'On émet ?',
      },
      { calls: [{ name: 'confirm_issue', args: {} }], reply: 'D’accord.' },
    ]);
    const conversation = createConversation({
      model,
      channels: { whatsapp: adapter },
      identity,
      documents,
    });
    await conversation.handle(text(number, sale));
    sent.length = 0;
    await conversation.handle(text(number, 'attends, je réfléchis'));
    expect(JSON.parse(results[1]?.[0] ?? '{}')).toMatchObject({ ok: false });
    expect(sent.some((s) => s.document)).toBe(false);
  });
});

describe('two senders at once', () => {
  it('each gets only his own replies and his own draft', async () => {
    const a = `2289${String(Date.now() + 4).slice(-7)}`;
    const b = `2289${String(Date.now() + 5).slice(-7)}`;
    const { adapter, sent } = recordingChannel('whatsapp');
    const otherSale = 'Devis pour Mme Afi : porte en bois 1 à 150 000 F';
    const otherArgs = {
      ...saleArgs,
      client_name: 'Mme Afi',
      subject: 'Porte',
      sections: [
        {
          title: null,
          show_subtotal: false,
          lines: [
            {
              label: 'Porte en bois',
              description: null,
              unit: null,
              quantity: { value: '1', evidence: 'porte en bois 1' },
              unit_price: { value: '150000', evidence: '150 000 F' },
              flat_amount: null,
              descriptive: false,
            },
          ],
        },
      ],
      adjustments: [],
    };
    const { model } = scriptedModel([
      { calls: [{ name: 'add_to_draft', args: saleArgs }], reply: 'Pour A.' },
      { calls: [{ name: 'add_to_draft', args: otherArgs }], reply: 'Pour B.' },
    ]);
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
    const toA = sent
      .filter((s) => s.to === a)
      .map((s) => s.text ?? '')
      .join('\n');
    const toB = sent
      .filter((s) => s.to === b)
      .map((s) => s.text ?? '')
      .join('\n');
    expect(toA).toContain('Tube 80x40');
    expect(toA).not.toContain('Porte en bois');
    expect(toB).toContain('Porte en bois');
    expect(toB).not.toContain('Tube 80x40');
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
