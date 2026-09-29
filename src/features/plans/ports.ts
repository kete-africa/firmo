/**
 * The Compte Kete's subscriptions, as Firmo needs them (kete-core spec 014): only the date the
 * Firmo access of an organization ends — never a price, a name or a payment.
 */
export interface SubscriptionDirectory {
  /** The end of the organization's Firmo access (grace included), or null when it has none. */
  firmoAccessUntil(organizationId: string): Promise<string | null>;
}
