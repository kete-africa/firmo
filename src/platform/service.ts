import { outboxBacklog, parseManifest, type HealthOptions, type Manifest } from '@kete/sdk';
import { sql } from 'drizzle-orm';
import { db, getPool } from './db';
import { env } from './env';

export const PRODUCT = 'prd_firmo';
export const VERSION = '0.1.0';

/** Firmo's self-description for Kete Cockpit: who it is and the events it announces. */
export function manifest(): Manifest {
  return parseManifest({
    product: PRODUCT,
    name: 'Firmo',
    version: VERSION,
    environment: env.environment,
    // Spec 008: what Kete Cockpit hears from Firmo (src/platform/events.ts).
    events: ['document.issued', 'document.shared', 'ai.usage'],
  });
}

export const health: HealthOptions = {
  version: VERSION,
  dependencies: [{ name: 'database', probe: () => db.execute(sql`select 1`) }],
  // Events waiting to be delivered to Kete Cockpit.
  backlog: () => outboxBacklog(getPool()),
};
