import { AccountUnavailableError, type AccountDirectory } from '@/features/identity';
import type { SubscriptionDirectory } from '@/features/plans';

/**
 * The Compte Kete adapter of the identity and subscription ports (kete-core specs 013 and 014). Firmo authenticates as itself
 * with OAuth `client_credentials` (scope `kete:people`); the token is kept until shortly before it
 * expires. Nothing personal is logged.
 */
export function accountDirectory(options: {
  accountUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}): AccountDirectory & SubscriptionDirectory {
  const http = options.fetch ?? fetch;
  const accountUrl = options.accountUrl.replace(/\/$/, '');
  let cached: { token: string; until: number } | null = null;

  async function token(): Promise<string> {
    if (cached && cached.until > Date.now()) return cached.token;
    const response = await http(`${accountUrl}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: options.clientId,
        client_secret: options.clientSecret,
        scope: 'kete:people',
        resource: 'urn:kete:apps',
      }),
    }).catch(() => null);
    if (!response?.ok) throw new AccountUnavailableError(response?.status ?? null);
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    cached = {
      token: body.access_token,
      until: Date.now() + Math.max(0, (body.expires_in ?? 300) - 60) * 1000,
    };
    return cached.token;
  }

  /** A POST with a JSON body, or a GET without one. */
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const send = async () =>
      http(`${accountUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${await token()}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).catch(() => null);
    let response = await send();
    if (response?.status === 401) {
      // A revoked or rotated token: ask once for a new one.
      cached = null;
      response = await send();
    }
    if (!response?.ok) throw new AccountUnavailableError(response?.status ?? null);
    return (await response.json()) as T;
  }

  return {
    provisionPerson: (input) => call('/api/apps/people', input),
    signInLink: (input) => call('/api/apps/sign-in-links', input),
    async firmoAccessUntil(organizationId) {
      const { access } = await call<{ access: Record<string, string> }>(
        `/api/apps/access?organizationId=${encodeURIComponent(organizationId)}`,
      );
      return access.firmo ?? null;
    },
  };
}
