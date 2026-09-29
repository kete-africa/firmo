/**
 * Firmo's plans (spec 007): three final documents offered, then the Firmo offer of the Compte
 * Kete — thirty documents per rolling thirty days while it is active. A correction (/R2) and a
 * draft never count: only a first issuance does.
 */
export const FREE_DOCUMENTS = 3;
export const PERIOD_DOCUMENTS = 30;
export const PERIOD_DAYS = 30;

export type Standing =
  /** Still within the offered documents. */
  | { kind: 'free'; remaining: number }
  /** The Firmo offer is active until `until`; `remaining` in the current rolling period. */
  | { kind: 'subscribed'; until: string; remaining: number }
  /** The offered documents are used and no offer is active. */
  | { kind: 'plan_required' };

/** The start of the rolling period ending now. */
export function periodStart(now: Date): Date {
  return new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Where the organization stands. An active offer comes first; the offered documents are used
 * before it, and never counted in its period.
 */
export function standingOf(input: {
  issuedTotal: number;
  issuedInPeriod: number;
  accessUntil: string | null;
  now: Date;
  periodDocuments?: number;
}): Standing {
  const freeLeft = Math.max(0, FREE_DOCUMENTS - input.issuedTotal);
  if (input.accessUntil && new Date(input.accessUntil) > input.now) {
    return {
      kind: 'subscribed',
      until: input.accessUntil,
      remaining:
        freeLeft + Math.max(0, (input.periodDocuments ?? PERIOD_DOCUMENTS) - input.issuedInPeriod),
    };
  }
  return freeLeft > 0 ? { kind: 'free', remaining: freeLeft } : { kind: 'plan_required' };
}
