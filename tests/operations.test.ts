import { createHash, randomBytes } from 'node:crypto';
import { memoryStorage } from '@kete/files';
import { createOutboxRelay, deliveryHandler, httpTransport, memoryDedupeStore } from '@kete/sdk';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createDocuments, type DocumentRenderer, type DraftInput } from '@/features/documents';
import { checkOperator, createOperations, OperationError } from '@/features/operations';
import { getPool } from '@/platform/db';
import { keteEvents } from '@/platform/events';
import { manifest, PRODUCT } from '@/platform/service';
import { inOrganization } from '@/platform/tenancy';
import { purgeOrganizations } from './support/cleanup';

// Phase 6: Kete Cockpit hears what happened — in the transaction of the change, signed on the
// way — and a Kete operator reads an organization's document only with a reason, journaled.

const run = randomBytes(3).toString('hex');
const A = { organizationId: `org_ops_a_${run}` };
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });

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
const events = keteEvents();
const documents = createDocuments({ renderer, files: memoryStorage(), events });
const operations = createOperations({ documents });

const sale: DraftInput = {
  type: 'quote',
  subject: 'Portail',
  client: { name: 'Mairie' },
  sections: [{ lines: [{ label: 'Portail', quantity: '1', unitPrice: '250000' }] }],
};

async function outboxOf(organizationId: string) {
  const { rows } = await owner.query<{ envelope: { type: string; data: unknown }; status: string }>(
    'select envelope, status from kete_outbox where organization_id = $1 order by created_at',
    [organizationId],
  );
  return rows;
}

let issuedNumber = '';

afterAll(async () => {
  await owner.query('delete from document_shares where organization_id = $1', [A.organizationId]);
  await purgeOrganizations(owner, [A.organizationId]);
  await owner.end();
  await getPool().end();
});

describe('Kete Cockpit hears Firmo', () => {
  it('announces an issued and a shared document with the change — facts only', async () => {
    await documents.saveProfile(A, { name: 'Atelier Kodjo' });
    const id = await documents.createDraft(A, sale);
    const issued = await documents.issue(A, id, { sha256: await documents.previewHash(A, id) });
    issuedNumber = issued.number;
    await documents.share(A, id);
    const recorded = await outboxOf(A.organizationId);
    expect(recorded.map((row) => [row.envelope.type, row.envelope.data])).toEqual([
      ['document.issued', { document_type: 'quote', correction: false }],
      ['document.shared', { document_type: 'quote' }],
    ]);
    expect(JSON.stringify(recorded)).not.toContain(issuedNumber);
    expect(JSON.stringify(recorded)).not.toContain('250000');
  });

  it("announces the model's cost as counters", async () => {
    await inOrganization(A.organizationId, (tx) =>
      events.aiUsage(tx, {
        organizationId: A.organizationId,
        modelCalls: 2,
        inputTokens: 1800,
        outputTokens: 120,
      }),
    );
    expect((await outboxOf(A.organizationId)).at(-1)?.envelope).toMatchObject({
      type: 'ai.usage',
      data: { model_calls: 2, input_tokens: 1800, output_tokens: 120 },
    });
  });

  it('delivers them signed, once, to a receiver that knows only its key', async () => {
    const key = { kid: 'key_test', secret: randomBytes(32).toString('hex') };
    const store = memoryDedupeStore();
    const receive = deliveryHandler({
      keyRing: new Map([[PRODUCT, [key]]]),
      store,
      declaredTypes: () => manifest().events,
    });
    const relay = createOutboxRelay({
      pool: getPool(),
      product: PRODUCT,
      key,
      transport: httpTransport({
        url: 'https://cockpit.test/api/events',
        fetch: (async (input: string | URL | Request, init?: RequestInit) =>
          receive(new Request(input, init))) as typeof fetch,
      }),
    });
    while ((await relay.flush()).claimed > 0);
    const mine = [...store.events.values()].filter((e) => e.organization === A.organizationId);
    expect(mine.map((e) => e.type).sort()).toEqual([
      'ai.usage',
      'document.issued',
      'document.shared',
    ]);
    expect((await outboxOf(A.organizationId)).every((row) => row.status === 'delivered')).toBe(
      true,
    );
  });
});

describe('the operator space', () => {
  const kete = 'org_kete';
  const base = { organizationId: kete, role: 'owner', twoFactor: true };

  it('lets in only Kete owners and admins with a second factor', () => {
    expect(checkOperator(base, kete)).toEqual({ status: 'operator' });
    expect(checkOperator({ ...base, role: 'admin' }, kete).status).toBe('operator');
    expect(checkOperator({ ...base, organizationId: A.organizationId }, kete)).toEqual({
      status: 'refused',
      reason: 'not_an_operator',
    });
    expect(checkOperator({ ...base, role: 'member' }, kete).status).toBe('refused');
    expect(checkOperator({ ...base, twoFactor: false }, kete)).toEqual({
      status: 'refused',
      reason: 'no_two_factor',
    });
    expect(checkOperator(base, null).status).toBe('refused');
  });

  it('shows failed messages with the sender masked, never a body', async () => {
    const sender = `2289${run}77`;
    await owner.query(
      `insert into inbound_messages
         (channel, provider_message_id, sender, payload, status, attempts, error, organization_id,
          settled_at)
       values ('whatsapp', $1, $2, null, 'failed', 3, 'renderer_timeout', $3, now())`,
      [`ops-${run}`, sender, A.organizationId],
    );
    const incident = (await operations.incidents()).find(
      (i) => i.organizationId === A.organizationId,
    );
    expect(incident).toMatchObject({ senderHint: `…${sender.slice(-4)}`, attempts: 3 });
    expect(JSON.stringify(incident)).not.toContain(sender);
    await owner.query('delete from inbound_messages where provider_message_id = $1', [
      `ops-${run}`,
    ]);
  });

  it('reads a document only with a reason, and journals the reading', async () => {
    const operator = { userId: `usr_operator_${run}` };
    const codeOf = (promise: Promise<unknown>) =>
      promise.then(
        () => 'no error',
        (error: unknown) => (error instanceof OperationError ? error.code : String(error)),
      );
    expect(
      await codeOf(operations.readDocument(operator, { ...A, number: issuedNumber, reason: 'vu' })),
    ).toBe('invalid_input');
    expect(
      await codeOf(
        operations.readDocument(operator, {
          ...A,
          number: 'DEV-1999-999',
          reason: 'Le client conteste le total',
        }),
      ),
    ).toBe('not_found');
    const read = await operations.readDocument(operator, {
      ...A,
      number: issuedNumber,
      reason: 'Le client conteste le total',
    });
    expect(Buffer.from(read.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const mine = (await operations.journal()).filter((e) => e.operatorId === operator.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      organizationId: A.organizationId,
      action: 'document_read',
      subject: issuedNumber,
      reason: 'Le client conteste le total',
    });
  });

  it('keeps the journal out of reach of the application role', async () => {
    const result = await inOrganization(A.organizationId, (tx) =>
      tx.execute(sql`select count(*) as count from operator_journal`),
    );
    expect(Number(result.rows[0]?.count)).toBe(0);
  });
});
