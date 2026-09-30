/**
 * Live evaluation of the conversation with the real model (opt-in; it costs model calls):
 *
 *   pnpm eval:conversation [scenario-id]
 *
 * Two kinds of scenarios, on the Neon "test" branch with a recording channel: fixed messages —
 * real conversations, word for word (spec 010) — and a second model playing a tradesman (the
 * reference's four dialogues). Firmo answers through the real model. The verdict is the code's,
 * on the resulting draft and documents — never a model's opinion. It also reports what each
 * conversation cost in model calls and tokens.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { memoryStorage } from '@kete/files';
import OpenAI from 'openai';
import pg from 'pg';

const localEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
process.env.FIRMO_DATABASE_URL ??= process.env.FIRMO_TEST_APP_URL;
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');

const { createConversation } = await import('../src/features/conversation');
const { createDocuments } = await import('../src/features/documents');
const { createIdentity } = await import('../src/features/identity');
const { openaiModel } = await import('../src/platform/openai');
const { typstRenderer } = await import('../src/platform/typst');
const { getPool } = await import('../src/platform/db');
const { purgeOrganizations } = await import('../tests/support/cleanup');

type Draft = {
  sections: { title: string | null; lines: Record<string, string | null>[] }[];
} | null;

interface Scenario {
  id: string;
  /** Fixed messages, sent as written; otherwise a second model plays `persona`. */
  messages?: string[];
  /** Before the message at `turn`, her previous message is made `hours` older (a pause). */
  pauseBefore?: { turn: number; hours: number };
  persona?: string;
  mission?: string;
  maxTurns: number;
  /** The code's verdict on the final state. */
  check(state: {
    documents: Awaited<ReturnType<typeof listAll>>;
    transcript: string[];
    draft: Draft;
  }): string[];
}

/** The lines of a draft, as "label: quantity × price" or "label: flat". */
function linesOf(draft: Draft): string[] {
  return (draft?.sections ?? []).flatMap((s) =>
    s.lines.map((l) =>
      l.flat_amount
        ? `${l.label}: ${l.flat_amount}`
        : `${l.label}: ${l.quantity} × ${l.unit_price}`,
    ),
  );
}

/** Problems when a line whose label contains `name` is not `expected`. */
function expectLine(draft: Draft, name: RegExp, expected: string): string[] {
  const found = linesOf(draft).find((l) => name.test(l.split(':')[0] ?? ''));
  if (!found) return [`no line ${String(name)} in ${JSON.stringify(linesOf(draft))}`];
  return found.endsWith(`: ${expected}`) ? [] : [`${found} ≠ ${expected}`];
}

const run = randomBytes(3).toString('hex');
const organizations: string[] = [];
const documents = createDocuments({ renderer: typstRenderer(), files: memoryStorage() });

async function listAll(organizationId: string) {
  const actor = { organizationId };
  const summaries = await documents.list(actor, 50);
  return Promise.all(summaries.map((s) => documents.get(actor, s.id)));
}

const issuedTotal = (doc: { snapshot: Record<string, unknown> | null }) =>
  (doc.snapshot?.document as Record<string, unknown> | undefined)?.grand_total;

const SCENARIOS: Scenario[] = [
  {
    id: 'author-telegram',
    // The author's own conversation on staging, word for word (2026-09-30).
    messages: [
      'Devis pour M. Kodjo, portail : 12 barres de tube à 18 000 F',
      "Ajoute un tube annellé à 140000.\nJ'aimerais que chacun soit dans un groupe",
    ],
    maxTurns: 2,
    check: ({ draft, transcript }) => {
      const problems = [
        ...expectLine(draft, /^tube$|barre|tube(?! ann)/i, '12 × 18000'),
        ...expectLine(draft, /ann/i, '1 × 140000'),
      ];
      if ((draft?.sections.length ?? 0) < 2) problems.push('not one group per item');
      const last = transcript.slice(
        transcript.lastIndexOf(transcript.findLast((l) => l.startsWith('Personne')) ?? ''),
      );
      if (last.some((l) => /combien|quelle quantité|quel prix/i.test(l))) {
        problems.push('asked again for what was said');
      }
      return problems;
    },
  },
  {
    id: 'words-and-pieces',
    messages: [
      'devis pour Mme Akakpo, douze sacs de ciment',
      "à six mille cinq cents l'un",
      'ajoute deux brouettes à 25 000',
    ],
    maxTurns: 3,
    check: ({ draft }) => [
      ...expectLine(draft, /ciment/i, '12 × 6500'),
      ...expectLine(draft, /brouette/i, '2 × 25000'),
    ],
  },
  {
    id: 'correct-and-remove',
    messages: [
      'Devis Garage Sika : vidange 15000, filtre à huile 2 à 4500',
      'enlève le filtre',
      'finalement la vidange c est 18 000',
    ],
    maxTurns: 3,
    check: ({ draft }) => {
      const lines = linesOf(draft);
      const problems = lines.some((l) => /filtre/i.test(l)) ? ['the filter is still there'] : [];
      const oil = lines.find((l) => /vidange/i.test(l)) ?? '';
      if (!/: (18000|1 × 18000)$/.test(oil)) problems.push(`${oil || 'no oil change'} ≠ 18000`);
      return problems;
    },
  },
  {
    id: 'greeting-resumes',
    messages: ['devis pour Kossi : 3 portes en bois', 'Cc'],
    maxTurns: 2,
    check: ({ draft, transcript }) => {
      const problems = expectLine(draft, /porte/i, '3 × null');
      const last = transcript.at(-1) ?? '';
      if (!/kossi|porte/i.test(last)) problems.push(`no reminder of the document: ${last}`);
      if (!/prix/i.test(last)) problems.push(`does not ask the price: ${last}`);
      return problems;
    },
  },
  {
    id: 'long-pause',
    messages: ['devis pour Kossi : 3 portes en bois', 'Cc'],
    pauseBefore: { turn: 1, hours: 50 },
    maxTurns: 2,
    check: ({ draft, transcript }) => {
      const problems = expectLine(draft, /porte/i, '3 × null');
      const last = transcript.at(-1) ?? '';
      if (!/continu|nouveau/i.test(last)) problems.push(`does not ask continue or new: ${last}`);
      return problems;
    },
  },
  {
    id: 'start-over',
    messages: [
      'Devis pour M. Kodjo, portail : 12 barres de tube à 18 000 F',
      'je veux commencer un nouveau devis',
      'Devis pour Mme Afi : porte en bois 1 à 150 000',
    ],
    maxTurns: 3,
    check: ({ draft }) => {
      const problems = expectLine(draft, /porte/i, '1 × 150000');
      if (linesOf(draft).some((l) => /tube/i.test(l))) problems.push('the previous quote remains');
      return problems;
    },
  },
  {
    id: 'start-over-direct',
    messages: [
      'Devis pour M. Kodjo, portail : 12 barres de tube à 18 000 F',
      'Nouveau devis pour Mme Afi : une porte en bois à 150 000 F',
    ],
    maxTurns: 2,
    check: ({ draft }) => {
      const problems = expectLine(draft, /porte/i, '1 × 150000');
      if (linesOf(draft).some((l) => /tube/i.test(l))) problems.push('the previous quote remains');
      return problems;
    },
  },
  {
    id: 'never-invents',
    messages: ['devis pour Kossi : 3 portes en bois'],
    maxTurns: 1,
    check: ({ draft, transcript }) => {
      const problems = expectLine(draft, /porte/i, '3 × null');
      if (!transcript.some((l) => /prix/i.test(l))) problems.push('did not ask for the price');
      return problems;
    },
  },
  {
    id: 'artisan-complete',
    persona:
      "Kodjo, chaudronnier togolais, peu à l'aise avec les applications et très naturel à l'écrit",
    mission:
      "Commence par une salutation. Fais ensuite un devis de 45 tubes rectangulaires à 17 000 F avec 160 000 F de main-d'oeuvre. Quand Firmo demande le client, réponds Mairie d'Agoè. Quand il demande le nom sous lequel le devis part, réponds Atelier Kodjo. Corrige ensuite les tubes à 40, demande l'aperçu gratuit, puis émets le PDF final. Réponds aux questions une par une.",
    maxTurns: 12,
    check: ({ documents: docs }) => {
      const issued = docs.find((d) => d.state === 'issued' && d.type === 'quote');
      if (!issued) return ['no issued quote'];
      return issuedTotal(issued) === '840000'
        ? []
        : [`total ${String(issuedTotal(issued))} ≠ 840000`];
    },
  },
  {
    id: 'btp-complex',
    persona: 'Ama, entrepreneure BTP structurée qui vérifie tout avant émission',
    mission:
      'Prépare un devis pour une clôture à 2 500 000 F et la peinture à 850 000 F, pour Entreprise Horizon, délai 30 jours, garantie 6 mois. Si Firmo demande sous quel nom le devis part, réponds BTP Ama. Après la lecture, remplace la peinture par 900 000 F. Demande un aperçu, vérifie-le, puis émets le PDF final.',
    maxTurns: 10,
    check: ({ documents: docs }) => {
      const issued = docs.find((d) => d.state === 'issued');
      if (!issued) return ['no issued document'];
      const problems: string[] = [];
      if (issuedTotal(issued) !== '3400000')
        problems.push(`total ${String(issuedTotal(issued))} ≠ 3400000`);
      if (!issued.clientName.toLowerCase().includes('horizon'))
        problems.push('client is not Horizon');
      return problems;
    },
  },
  {
    id: 'informal-invoice',
    persona: 'Afi, commerçante informelle, messages courts avec fautes et montants en F CFA',
    mission:
      "Demande une facture pour Mme Akakpo avec 3 sacs de ciment à 6 500 F. Si Firmo demande sous quel nom elle part, réponds Boutique Afi. Lorsque Firmo a tout compris, demande le PDF, confirme l'émission puis demande qu'il renvoie le dernier PDF final.",
    maxTurns: 10,
    check: ({ documents: docs }) => {
      const issued = docs.find((d) => d.state === 'issued' && d.type === 'invoice');
      if (!issued) return ['no issued invoice'];
      return issuedTotal(issued) === '19500'
        ? []
        : [`total ${String(issuedTotal(issued))} ≠ 19500`];
    },
  },
  {
    id: 'history-boundary',
    persona:
      'Yao, artisan bavard et hésitant qui écrit en français courant avec quelques abréviations',
    mission:
      'Crée un devis pour Client Delta avec 10 tôles à 8 000 F. Ensuite, garde une vraie conversation pendant au moins 12 messages : pose des questions utiles, hésite, ajoute une validité de 30 jours, mais ne change pas les chiffres avant le douzième message. Ensuite, corrige la quantité à 7 tôles puis demande le récapitulatif.',
    maxTurns: 16,
    check: ({ transcript }) =>
      transcript.slice(-4).some((line) => /7\b/.test(line) && /Total : 56 000/.test(line))
        ? []
        : ['the last summary does not show 7 sheets for 56 000 F CFA'],
  },
];

async function playScenario(scenario: Scenario) {
  const sender = `2289${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const sent: string[] = [];
  const channel = {
    channel: 'whatsapp' as const,
    async sendText(_to: string, text: string, actions?: { label: string }[]) {
      sent.push(
        actions?.length ? `${text} [boutons : ${actions.map((a) => a.label).join(' / ')}]` : text,
      );
    },
    async sendDocument(_to: string, _pdf: Uint8Array, filename: string, caption: string) {
      sent.push(`[PDF ${filename} — ${caption}]`);
    },
    async askForContact() {},
    async download(): Promise<{ bytes: Uint8Array; mediaType: string }> {
      throw new Error('no media in this evaluation');
    },
  };
  let organizationId = '';
  const identity = createIdentity({
    publicUrl: 'https://firmo.test',
    directory: {
      async provisionPerson() {
        organizationId = `org_eval_${run}_${scenario.id}`;
        organizations.push(organizationId);
        return { personId: `usr_eval_${run}_${scenario.id}`, organizationId, created: true };
      },
      async signInLink() {
        return { url: 'https://compte.test/lien', expiresAt: '' };
      },
    },
  });
  const model = openaiModel();
  const conversation = createConversation({
    model,
    channels: { whatsapp: channel },
    identity,
    documents,
  });
  const person = new OpenAI();
  const transcript: string[] = [];
  const cost = { modelCalls: 0, inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < scenario.maxTurns; turn += 1) {
    let text: string;
    if (scenario.pauseBefore?.turn === turn) {
      const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
      await owner.query(
        `update conversations set updated_at = now() - make_interval(hours => $2) where sender = $1`,
        [sender, scenario.pauseBefore.hours],
      );
      await owner.end();
    }
    if (scenario.messages) {
      text = scenario.messages[turn] ?? '';
    } else {
      const next = await person.responses.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-5.6-luna',
        instructions: `Tu joues ${scenario.persona}, qui écrit à Firmo sur WhatsApp. Ta mission : ${scenario.mission}\nÉcris UNIQUEMENT ton prochain message, court et naturel, en français. Réponds à la dernière question de Firmo. Quand la mission est entièrement accomplie, écris exactement FIN.`,
        input: transcript.length ? transcript.join('\n') : '(début de la conversation)',
        store: false,
      });
      text = next.output_text.trim();
    }
    if (!text || text === 'FIN') break;
    transcript.push(`Personne : ${text}`);
    sent.length = 0;
    const result = await conversation.handle({
      channel: 'whatsapp',
      providerMessageId: randomBytes(6).toString('hex'),
      sender,
      displayName: null,
      kind: 'text',
      text,
    });
    for (const usage of result.usage) {
      cost.modelCalls += usage.modelCalls;
      cost.inputTokens += usage.inputTokens;
      cost.outputTokens += usage.outputTokens;
    }
    for (const line of sent) transcript.push(`Firmo : ${line}`);
  }
  const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
  const { rows } = await owner.query<{ draft: Draft }>(
    'select draft from conversations where sender = $1',
    [sender],
  );
  await owner.end();
  const problems = scenario.check({
    documents: organizationId ? await listAll(organizationId) : [],
    transcript,
    draft: rows[0]?.draft ?? null,
  });
  return { transcript, problems, cost };
}

const only = process.argv[2];
let failures = 0;
try {
  for (const scenario of SCENARIOS.filter((s) => !only || s.id === only)) {
    const started = Date.now();
    const { transcript, problems, cost } = await playScenario(scenario);
    const verdict = problems.length === 0 ? 'PASS' : 'FAIL';
    if (problems.length) failures += 1;
    console.log(
      `\n=== ${scenario.id}: ${verdict} (${Math.round((Date.now() - started) / 1000)} s, ${cost.modelCalls} model calls, ${cost.inputTokens} in / ${cost.outputTokens} out tokens)`,
    );
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    console.log(transcript.map((line) => `  ${line.replace(/\n/g, '\n    ')}`).join('\n'));
  }
} finally {
  const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
  await purgeOrganizations(owner, organizations);
  await owner.end();
  await getPool().end();
}
process.exit(failures ? 1 : 0);
