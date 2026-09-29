import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { Conversation, InboundMessage } from '@/features/conversation';
import { getPool } from '@/platform/db';
import { claim, drain, enqueue, MAX_ATTEMPTS } from '@/platform/inbox';

// Phase 3 (decision 0001): a message is stored once, handled in order per sender, erased once
// settled; a failure is retried, then the sender is told her draft is safe.

const run = randomBytes(3).toString('hex');
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
const senders: string[] = [];

const message = (sender: string, id: string, text = 'bonjour'): InboundMessage => ({
  channel: 'telegram',
  providerMessageId: `${run}:${id}`,
  sender,
  displayName: null,
  kind: 'text',
  text,
});

afterAll(async () => {
  await owner.query('delete from inbound_messages where sender = any($1)', [senders]);
  await owner.end();
  await getPool().end();
});

describe('the inbox', () => {
  it('stores a message once, whatever the retries of the channel', async () => {
    const sender = `s_${run}_1`;
    senders.push(sender);
    expect(await enqueue(message(sender, 'a'))).toBe(true);
    expect(await enqueue(message(sender, 'a'))).toBe(false);
  });

  it('is unreadable by the application role, except through its functions', async () => {
    const rows = await getPool().query('select count(*)::int as n from inbound_messages');
    expect(rows.rows).toEqual([{ n: 0 }]);
  });

  it('handles one sender in order, erases bodies once done, and keeps other senders going', async () => {
    const a = `s_${run}_2`;
    const b = `s_${run}_3`;
    senders.push(a, b);
    await enqueue(message(a, 'a1', 'premier'));
    await enqueue(message(a, 'a2', 'second'));
    await enqueue(message(b, 'b1', 'autre'));
    const handled: string[] = [];
    const conversation = {
      async handle(m: InboundMessage) {
        handled.push(m.text ?? '');
        return { organizationId: `org_${m.sender}`, usage: [] };
      },
      async apologize() {},
    } as unknown as Conversation;
    // Only one message per sender can be claimed at a time.
    const first = await claim(10, 60);
    const mine = first.filter((c) => [a, b].includes(c.payload.sender));
    expect(mine.map((c) => c.payload.text).sort()).toEqual(['autre', 'premier']);
    await owner.query(
      "update inbound_messages set status = 'pending', attempts = 0, leased_until = null where sender = any($1)",
      [[a, b]],
    );
    await drain(conversation);
    expect(handled.filter((t) => ['premier', 'second'].includes(t))).toEqual(['premier', 'second']);
    const { rows } = await owner.query(
      'select status, payload, organization_id from inbound_messages where sender = $1',
      [a],
    );
    expect(rows).toEqual([
      { status: 'done', payload: null, organization_id: `org_${a}` },
      { status: 'done', payload: null, organization_id: `org_${a}` },
    ]);
  });

  it('retries a failure, then gives up and tells the sender', async () => {
    const sender = `s_${run}_4`;
    senders.push(sender);
    await enqueue(message(sender, 'f1'));
    let attempts = 0;
    let apologized = false;
    const failing = {
      async handle() {
        attempts += 1;
        throw new TypeError('boom');
      },
      async apologize() {
        apologized = true;
      },
    } as unknown as Conversation;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await drain(failing, 4, 0);
      await owner.query('update inbound_messages set leased_until = null where sender = $1', [
        sender,
      ]);
    }
    expect(attempts).toBe(MAX_ATTEMPTS);
    expect(apologized).toBe(true);
    const { rows } = await owner.query(
      'select status, payload, error from inbound_messages where sender = $1',
      [sender],
    );
    expect(rows).toEqual([{ status: 'failed', payload: null, error: 'TypeError' }]);
  });
});
