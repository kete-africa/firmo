import { randomBytes } from 'node:crypto';
import { listFeedback, submitFeedback } from '@kete/feedback';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createOperations } from '@/features/operations';
import type { Documents } from '@/features/documents';
import { getPool } from '@/platform/db';
import { executorOf } from '@/platform/events';
import { createFirmoFeedbackHandler } from '@/platform/feedback';
import { announceDay } from '@/platform/metrics';
import { manifest } from '@/platform/service';
import { inOrganization } from '@/platform/tenancy';

// Spec 012: what the Kete chassis expects of Firmo today — its identity card, the feedback button
// kept per organization, and the day's figures announced once, as counters only.

const run = randomBytes(3).toString('hex');
const A = `org_chassis_a_${run}`;
const B = `org_chassis_b_${run}`;
const KETE = `org_chassis_kete_${run}`;
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
// A day nobody else announces: far ahead, unique to this run.
const day = `2099-${String(1 + (parseInt(run.slice(0, 2), 16) % 12)).padStart(2, '0')}-${String(1 + (parseInt(run.slice(2, 4), 16) % 28)).padStart(2, '0')}`;

afterAll(async () => {
  await owner.query('delete from kete_feedback where organization_id = any($1)', [[A, B]]);
  await owner.query('delete from metrics_days where organization_id = $1', [KETE]);
  await owner.query('delete from kete_outbox where organization_id = $1', [KETE]);
  await owner.end();
  await getPool().end();
});

describe('Firmo describes itself', () => {
  it('carries its identity card and announces the day’s figures', () => {
    const card = manifest();
    expect(card.events).toContain('metrics.daily');
    expect(card.governance).toMatchObject({
      owner: { name: 'Kete' },
      dataCategories: ['personal', 'financial', 'confidential'],
      ai: { used: true },
      criticality: 'medium',
    });
  });
});

describe('the feedback button', () => {
  const say = (organizationId: string, message: string) =>
    inOrganization(organizationId, (tx) =>
      submitFeedback(executorOf(tx), {
        organizationId,
        actor: { kind: 'person', id: `usr_${run}`, channel: 'web' },
        input: { kind: 'problem', message, page: '/espace/documents' },
      }),
    );

  it('keeps what a person says in her organization only', async () => {
    await say(A, 'Le total ne tient pas sur une ligne.');
    const own = await inOrganization(A, (tx) => listFeedback(executorOf(tx)));
    expect(own.map((f) => f.message)).toEqual(['Le total ne tient pas sur une ligne.']);
    expect(await inOrganization(B, (tx) => listFeedback(executorOf(tx)))).toEqual([]);
  });

  it('is never changed nor removed by the application', async () => {
    await expect(
      inOrganization(A, (tx) =>
        executorOf(tx).query('update kete_feedback set message = $1', ['x']),
      ),
    ).rejects.toThrow();
    await expect(
      inOrganization(A, (tx) => executorOf(tx).query('delete from kete_feedback')),
    ).rejects.toThrow();
  });

  it('takes it from the signed-in person only, over HTTP', async () => {
    const post = (member: { organizationId: string; userId: string } | null, body: object) =>
      createFirmoFeedbackHandler(async () => member)(
        new Request('https://firmo.test/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    expect((await post(null, { kind: 'idea', message: 'Sans session.' })).status).toBe(401);
    const me = { organizationId: B, userId: `usr_${run}` };
    expect((await post(me, { kind: 'idea', message: '' })).status).toBe(422);
    expect((await post(me, { kind: 'idea', message: 'Un bouton pour dupliquer.' })).status).toBe(
      201,
    );
    const kept = await inOrganization(B, (tx) => listFeedback(executorOf(tx)));
    expect(kept.map((f) => [f.kind, f.message])).toEqual([['idea', 'Un bouton pour dupliquer.']]);
  });

  it('is read by Kete operators: what was said and where, never by whom', async () => {
    const operations = createOperations({ documents: {} as Documents });
    const lines = (await operations.feedback(200)).filter((line) => line.organizationId === A);
    expect(lines).toEqual([
      expect.objectContaining({
        kind: 'problem',
        message: 'Le total ne tient pas sur une ligne.',
        page: '/espace/documents',
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain(`usr_${run}`);
  });
});

describe('the day’s figures', () => {
  it('are announced once, as counters only, under Kete’s own organization', async () => {
    const counters = await announceDay(day, KETE);
    expect(Object.keys(counters ?? {}).sort()).toEqual([
      'documents_issued',
      'feedback_received',
      'messages_failed',
      'messages_received',
      'model_calls',
      'organizations_issuing',
      'senders_active',
      'shares_first_opened',
    ]);
    for (const value of Object.values(counters ?? {})) expect(Number.isInteger(value)).toBe(true);
    // Announced again, nothing more is said.
    expect(await announceDay(day, KETE)).toBeNull();
    const { rows } = await owner.query<{ envelope: { type: string; data: unknown } }>(
      'select envelope from kete_outbox where organization_id = $1',
      [KETE],
    );
    expect(rows.map((row) => [row.envelope.type, row.envelope.data])).toEqual([
      ['metrics.daily', { day, counters }],
    ]);
  });

  it('counts what happened that day, across organizations', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await owner.query<{ name: string; value: string }>(
      'select * from daily_counters($1::date)',
      [today],
    );
    const figures = Object.fromEntries(rows.map((row) => [row.name, Number(row.value)]));
    // The feedback this file wrote a moment ago is in today's count.
    expect(figures.feedback_received).toBeGreaterThanOrEqual(1);
  });

  it('says nothing without an operators’ organization', async () => {
    expect(await announceDay(day, null)).toBeNull();
  });
});
