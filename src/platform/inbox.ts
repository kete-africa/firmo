import { sql } from 'drizzle-orm';
import type { Conversation, InboundMessage } from '@/features/conversation';
import { db } from './db';

/**
 * The inbox (decision 0001): verified messages wait here, once per provider id, and a worker
 * handles them one sender at a time. Reached only through definer functions; a body is erased
 * once settled.
 */
export async function enqueue(message: InboundMessage): Promise<boolean> {
  const result = await db.execute(sql`
    select public.inbound_enqueue(${message.channel}, ${message.providerMessageId},
      ${message.sender}, ${JSON.stringify(message)}::jsonb) as fresh`);
  return (result.rows[0] as { fresh: boolean } | undefined)?.fresh === true;
}

interface Claimed {
  id: number;
  payload: InboundMessage;
  attempts: number;
}

export async function claim(limit: number, leaseSeconds: number): Promise<Claimed[]> {
  const result = await db.execute(
    sql`select id, payload, attempts from public.inbound_claim(${limit}, ${leaseSeconds})`,
  );
  return (result.rows as { id: string; payload: InboundMessage; attempts: number }[]).map(
    (row) => ({
      id: Number(row.id),
      payload: row.payload,
      attempts: Number(row.attempts),
    }),
  );
}

async function settle(
  id: number,
  status: 'done' | 'failed',
  organizationId: string | null,
  error: string | null,
) {
  await db.execute(
    sql`select public.inbound_settle(${id}, ${status}, ${organizationId}, ${error})`,
  );
}

async function release(id: number, error: string) {
  await db.execute(sql`select public.inbound_release(${id}, ${error})`);
}

export const MAX_ATTEMPTS = 3;

/** Handles one claimed message: done, retried later, or — after the last attempt — failed. */
export async function processClaimed(conversation: Conversation, item: Claimed): Promise<void> {
  try {
    const { organizationId } = await conversation.handle(item.payload);
    await settle(item.id, 'done', organizationId, null);
  } catch (error) {
    // Only the error's kind is kept: never a message body, a price or a name.
    const kind = error instanceof Error ? error.name : 'unknown';
    if (item.attempts < MAX_ATTEMPTS) {
      await release(item.id, kind);
      return;
    }
    await settle(item.id, 'failed', null, kind);
    await conversation.apologize(item.payload).catch(() => undefined);
  }
}

/** Drains the inbox until it is empty; several senders at once, each one in order. */
export async function drain(
  conversation: Conversation,
  batch = 4,
  leaseSeconds = 180,
): Promise<number> {
  let handled = 0;
  for (;;) {
    const items = await claim(batch, leaseSeconds);
    if (items.length === 0) return handled;
    await Promise.all(items.map((item) => processClaimed(conversation, item)));
    handled += items.length;
  }
}
