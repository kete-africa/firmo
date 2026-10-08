import { createEmitter } from '@kete/sdk';
import { sql } from 'drizzle-orm';
import { env } from './env';
import { executorOf } from './events';
import { manifest } from './service';
import { inOrganization } from './tenancy';

/** The day before `now`, in UTC: the last day whose figures are complete. */
export function yesterday(now = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Announces a day's figures to Kete (`metrics.daily`, spec 012): counters across every
 * organization — documents issued, messages received, model calls — never a price, a client, a
 * number nor a sender. Written once per day, under Kete's own organization, in the transaction
 * that marks the day as announced. Returns the counters, or null when the day was already
 * announced or no operators' organization is configured.
 */
export async function announceDay(
  day = yesterday(),
  organizationId = env.operatorsOrganizationId,
): Promise<Record<string, number> | null> {
  if (!organizationId) return null;
  return inOrganization(organizationId, async (tx) => {
    const claimed = await tx.execute(
      sql`insert into public.metrics_days (day, organization_id)
          values (${day}::date, ${organizationId}) on conflict (day) do nothing returning day`,
    );
    if (claimed.rows.length === 0) return null;
    const figures = await tx.execute(sql`select * from public.daily_counters(${day}::date)`);
    const counters: Record<string, number> = {};
    for (const row of figures.rows) counters[String(row.name)] = Number(row.value);
    await createEmitter(manifest()).record(executorOf(tx), {
      type: 'metrics.daily',
      organization: organizationId,
      data: { day, counters },
    });
    return counters;
  });
}
