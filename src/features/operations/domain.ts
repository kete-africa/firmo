/**
 * Who may run Firmo (spec 008): a member of Kete's own organization, owner or admin, signing in
 * with a second factor — the Cockpit's rule (kete-core spec 008). Without a configured
 * organization, nobody is.
 */
export type OperatorCheck =
  { status: 'operator' } | { status: 'refused'; reason: 'not_an_operator' | 'no_two_factor' };

export function checkOperator(
  identity: { organizationId: string | null; role: string | null; twoFactor: boolean },
  operatorsOrganizationId: string | null,
): OperatorCheck {
  const member =
    operatorsOrganizationId !== null &&
    identity.organizationId === operatorsOrganizationId &&
    (identity.role === 'owner' || identity.role === 'admin');
  if (!member) return { status: 'refused', reason: 'not_an_operator' };
  if (!identity.twoFactor) return { status: 'refused', reason: 'no_two_factor' };
  return { status: 'operator' };
}
