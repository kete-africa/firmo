import { createEmitter, createOutboxRelay, httpTransport, type SqlExecutor } from '@kete/sdk';
import { sql, type SQL } from 'drizzle-orm';
import type { UsageEvents } from '@/features/conversation';
import type { DocumentEvents } from '@/features/documents';
import { getPool, type Transaction } from './db';
import { manifest, PRODUCT } from './service';

/** The SDK's database surface over a Drizzle transaction: `$1…` placeholders become parameters. */
export function executorOf(tx: Transaction): SqlExecutor {
  return {
    async query<R extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const chunks: SQL[] = text
        .split(/\$(\d+)/)
        .map((part, index) => (index % 2 === 0 ? sql.raw(part) : sql`${params[Number(part) - 1]}`));
      const result = await tx.execute(sql.join(chunks));
      return { rows: result.rows as R[] };
    },
  };
}

/**
 * The Kete adapter of the documents' and the conversation's event ports: each event is written in
 * the caller's transaction, with the change it announces. Facts and counters only.
 */
export function keteEvents(): DocumentEvents & UsageEvents {
  const kete = createEmitter(manifest());
  return {
    async issued(tx, fact) {
      await kete.record(executorOf(tx), {
        type: 'document.issued',
        organization: fact.organizationId,
        data: { document_type: fact.type, correction: fact.correction },
      });
    },
    async shared(tx, fact) {
      await kete.record(executorOf(tx), {
        type: 'document.shared',
        organization: fact.organizationId,
        data: { document_type: fact.type },
      });
    },
    async aiUsage(tx, fact) {
      await kete.record(executorOf(tx), {
        type: 'ai.usage',
        organization: fact.organizationId,
        data: {
          model_calls: fact.modelCalls,
          input_tokens: fact.inputTokens,
          output_tokens: fact.outputTokens,
        },
      });
    },
  };
}

/** The relay to Kete Cockpit, when Firmo is registered there; otherwise events wait. */
export function outboxRelay() {
  const url = process.env.KETE_RECEIVER_URL;
  const kid = process.env.KETE_KEY_ID;
  const secret = process.env.KETE_KEY_SECRET;
  if (!url || !kid || !secret) return null;
  return createOutboxRelay({
    pool: getPool(),
    product: PRODUCT,
    key: { kid, secret },
    transport: httpTransport({ url }),
  });
}
