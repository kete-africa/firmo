import { sql } from 'drizzle-orm';
import { db, type Transaction } from './db';

/**
 * Runs `fn` in a transaction where every RLS policy sees only `organizationId` (constitution
 * III). The organization comes from a verified proof, never from a request. The setting resets at
 * commit or rollback.
 */
export function inOrganization<T>(
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!organizationId) throw new Error('An organization is required.');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('kete.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
