/**
 * The Compte Kete, as Firmo needs it (doctrine D-024, kete-core spec 013). The HTTP adapter lives
 * in src/platform/account.ts.
 */
export interface AccountDirectory {
  /** The person with this proven number and her organization, created in silence if new. */
  provisionPerson(input: {
    phoneNumber: string;
    name?: string | null;
    organizationName?: string | null;
  }): Promise<{ personId: string; organizationId: string; created: boolean }>;
  /** A one-time sign-in link for her, landing on `returnTo` (Firmo's own origin). */
  signInLink(input: {
    personId: string;
    returnTo: string;
  }): Promise<{ url: string; expiresAt: string }>;
}

export class AccountUnavailableError extends Error {
  constructor(readonly status: number | null) {
    super(`account_unavailable${status ? `_${status}` : ''}`);
  }
}
