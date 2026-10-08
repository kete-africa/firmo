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
    // Spec 008: what Kete Cockpit hears from Firmo (src/platform/events.ts); spec 012: the day's
    // figures (src/platform/metrics.ts).
    events: ['document.issued', 'document.shared', 'ai.usage', 'metrics.daily'],
    // Firmo's identity card (doctrine D-040): who answers for it, what it handles, what an
    // outage costs.
    governance: {
      owner: { name: 'Kete' },
      // Names and phone numbers of tradesmen and their clients; quotes and invoices with their
      // amounts — a negotiating position, never to leave the organization.
      dataCategories: ['personal', 'financial', 'confidential'],
      ai: {
        used: true,
        purpose:
          'Transcribes a voice note, reads a photo of a paper quote and structures the lines it heard or read. It never writes, suggests or corrects an amount.',
      },
      // Without Firmo a tradesman goes back to paper: his work slows down, nothing is lost.
      criticality: 'medium',
    },
  });
}

export const health: HealthOptions = {
  version: VERSION,
  dependencies: [{ name: 'database', probe: () => db.execute(sql`select 1`) }],
  // Events waiting to be delivered to Kete Cockpit.
  backlog: () => outboxBacklog(getPool()),
};
