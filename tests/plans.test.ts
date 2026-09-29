import { createHash, randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createDocuments,
  DocumentError,
  type DocumentRenderer,
  type DraftInput,
} from '@/features/documents';
import { createPlans } from '@/features/plans';
import { getPool } from '@/platform/db';
import { purgeOrganizations } from './support/cleanup';

// Phase 5: Firmo never gives more than what was bought — counted under the organization's
// issuance lock, so two issuances never share the last document. The rendering is faked here: what
// is proven is the count, not the PDF (tests/rendering.test.ts proves the PDF).

const run = randomBytes(3).toString('hex');
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
const organizations: string[] = [];

const renderer: DocumentRenderer = {
  templateVersion: 'test',
  async render(input) {
    const pdf = new TextEncoder().encode(`%PDF-test ${JSON.stringify(input).length}`);
    return {
      pdf,
      sha256: createHash('sha256').update(pdf).update(randomBytes(8)).digest('hex'),
      sizeBytes: pdf.length,
      compilationMs: 0,
    };
  },
};

/** The Compte Kete as the plans see it: a Firmo access until a date, none, or no answer. */
const access: Record<string, string | 'down'> = {};
let asked = 0;
// The offer's period, at 3 documents instead of 30: the same rule, proven faster.
const plans = createPlans({
  periodDocuments: 3,
  subscriptions: {
    async firmoAccessUntil(organizationId) {
      asked += 1;
      const until = access[organizationId] ?? null;
      if (until === 'down') throw new Error('account_unavailable');
      return until;
    },
  },
});
const documents = createDocuments({ renderer, files: memoryStorage(), gate: plans.gate });

const sale: DraftInput = {
  type: 'quote',
  subject: 'Portail',
  client: { name: 'Mairie' },
  sections: [{ lines: [{ label: 'Portail', quantity: '1', unitPrice: '250000' }] }],
};

async function organization(name: string) {
  const actor = { organizationId: `org_plans_${name}_${run}` };
  organizations.push(actor.organizationId);
  await documents.saveProfile(actor, { name: 'Atelier Kodjo' });
  return actor;
}

async function issue(actor: { organizationId: string }, subject = 'Portail') {
  const id = await documents.createDraft(actor, { ...sale, subject });
  const sha256 = await documents.previewHash(actor, id);
  try {
    await documents.issue(actor, id, { sha256 });
    return 'issued';
  } catch (error) {
    if (error instanceof DocumentError) return error.code;
    throw error;
  }
}

afterAll(async () => {
  await purgeOrganizations(owner, organizations);
  await owner.end();
  await getPool().end();
});

describe('the offered documents', () => {
  it('issues three without asking the Compte Kete, then asks for the offer', async () => {
    const actor = await organization('free');
    const before = asked;
    for (let i = 0; i < 3; i++) expect(await issue(actor)).toBe('issued');
    expect(asked).toBe(before);
    expect(await issue(actor)).toBe('plan_required');
    expect(await plans.standing(actor, documents.issued(actor))).toEqual({
      kind: 'plan_required',
    });
  });

  it('never counts a correction, nor a draft', async () => {
    const actor = await organization('revision');
    const id = await documents.createDraft(actor, sale);
    await documents.issue(actor, id, { sha256: await documents.previewHash(actor, id) });
    for (let i = 0; i < 2; i++) {
      const revision = await documents.revise(actor, id);
      await documents.issue(actor, revision, {
        sha256: await documents.previewHash(actor, revision),
      });
    }
    await documents.createDraft(actor, sale);
    expect(await plans.standing(actor, documents.issued(actor))).toEqual({
      kind: 'free',
      remaining: 2,
    });
  });
});

describe('the Firmo offer', () => {
  it("issues again once subscribed, up to the period's documents, then refuses", async () => {
    const actor = await organization('paid');
    for (let i = 0; i < 3; i++) await issue(actor);
    expect(await issue(actor)).toBe('plan_required');
    access[actor.organizationId] = new Date(Date.now() + 20 * 86_400_000).toISOString();
    for (let i = 0; i < 3; i++) expect(await issue(actor, `Période ${i}`)).toBe('issued');
    expect(await issue(actor)).toBe('quota_reached');
    expect(await plans.standing(actor, documents.issued(actor))).toMatchObject({
      kind: 'subscribed',
      remaining: 0,
    });
  }, 120_000);

  it('fails closed when the Compte Kete does not answer beyond the offered documents', async () => {
    const actor = await organization('down');
    for (let i = 0; i < 3; i++) await issue(actor);
    access[actor.organizationId] = 'down';
    expect(await issue(actor)).toBe('plans_unavailable');
  });
});

describe('the last document', () => {
  it('two issuances racing for it: exactly one succeeds', async () => {
    const actor = await organization('race');
    for (let i = 0; i < 2; i++) await issue(actor);
    const drafts = await Promise.all([
      documents.createDraft(actor, { ...sale, subject: 'Course A' }),
      documents.createDraft(actor, { ...sale, subject: 'Course B' }),
    ]);
    const hashes = await Promise.all(drafts.map((id) => documents.previewHash(actor, id)));
    const outcomes = await Promise.all(
      drafts.map((id, i) =>
        documents.issue(actor, id, { sha256: hashes[i] ?? '' }).then(
          () => 'issued',
          (error: unknown) => (error instanceof DocumentError ? error.code : String(error)),
        ),
      ),
    );
    expect(outcomes.sort()).toEqual(['issued', 'plan_required']);
  });
});
