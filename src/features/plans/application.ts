import type { IssuanceGate, IssuedCount } from '@/features/documents';
import { FREE_DOCUMENTS, periodStart, standingOf, type Standing } from './domain';
import type { SubscriptionDirectory } from './ports';

export interface PlansDeps {
  subscriptions: SubscriptionDirectory;
  /** The documents of a period; the offer's by default (a smaller one keeps tests short). */
  periodDocuments?: number;
  now?: () => Date;
}

export function createPlans(deps: PlansDeps) {
  const now = deps.now ?? (() => new Date());

  async function standing(organizationId: string, issued: IssuedCount): Promise<Standing> {
    const issuedTotal = await issued.total();
    const at = now();
    // Within the offered documents, the Compte Kete is not even asked.
    if (issuedTotal < FREE_DOCUMENTS) {
      return { kind: 'free', remaining: FREE_DOCUMENTS - issuedTotal };
    }
    const accessUntil = await deps.subscriptions.firmoAccessUntil(organizationId);
    const issuedInPeriod = accessUntil ? await issued.since(periodStart(at), FREE_DOCUMENTS) : 0;
    return standingOf({
      issuedTotal,
      issuedInPeriod,
      accessUntil,
      now: at,
      ...(deps.periodDocuments === undefined ? {} : { periodDocuments: deps.periodDocuments }),
    });
  }

  const gate: IssuanceGate = {
    async admit(actor, issued) {
      let current: Standing;
      try {
        current = await standing(actor.organizationId, issued);
      } catch {
        // The Compte Kete did not answer: fail closed.
        return 'plans_unavailable';
      }
      if (current.kind === 'plan_required') return 'plan_required';
      return current.remaining > 0 ? 'allowed' : 'quota_reached';
    },
  };

  return {
    /** Asked by the documents at each first issuance, under the organization's issuance lock. */
    gate,
    /** Where the organization stands now, for the space and the chat. */
    standing: (actor: { organizationId: string }, issued: IssuedCount) =>
      standing(actor.organizationId, issued),
  };
}

export type Plans = ReturnType<typeof createPlans>;
