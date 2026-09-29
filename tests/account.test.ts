import { describe, expect, it } from 'vitest';
import { AccountUnavailableError } from '@/features/identity';
import { accountDirectory } from '@/platform/account';

// The Compte Kete adapter against its contract (kete-core specs 013 and 014): Firmo authenticates
// as itself, and reads only until when an organization's Firmo access runs.

function fakeAccount(access: Record<string, string>, options: { accessStatus?: number } = {}) {
  const requests: { method: string; url: string; authorization: string | null }[] = [];
  let tokens = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? 'GET',
      url,
      authorization: headers.get('authorization'),
    });
    if (url.endsWith('/api/auth/oauth2/token')) {
      tokens += 1;
      return Response.json({ access_token: `token-${tokens}`, expires_in: 3600 });
    }
    if (url.includes('/api/apps/access?')) {
      if (options.accessStatus) return new Response(null, { status: options.accessStatus });
      return Response.json({ access });
    }
    return new Response(null, { status: 404 });
  }) as typeof globalThis.fetch;
  const directory = accountDirectory({
    accountUrl: 'https://compte.test/',
    clientId: 'firmo',
    clientSecret: 'secret',
    fetch,
  });
  return { directory, requests };
}

describe('the Firmo access of an organization', () => {
  it('is read with a GET, as Firmo itself, once per token', async () => {
    const { directory, requests } = fakeAccount({ firmo: '2026-10-29T00:00:00.000Z' });
    expect(await directory.firmoAccessUntil('org_a')).toBe('2026-10-29T00:00:00.000Z');
    expect(await directory.firmoAccessUntil('org_a')).toBe('2026-10-29T00:00:00.000Z');
    const reads = requests.filter((r) => r.url.includes('/api/apps/access'));
    expect(reads).toHaveLength(2);
    expect(reads[0]).toMatchObject({
      method: 'GET',
      url: 'https://compte.test/api/apps/access?organizationId=org_a',
      authorization: 'Bearer token-1',
    });
    expect(requests.filter((r) => r.url.endsWith('/oauth2/token'))).toHaveLength(1);
  });

  it('is null when only other apps are subscribed', async () => {
    const { directory } = fakeAccount({ nettio: '2026-10-29T00:00:00.000Z' });
    expect(await directory.firmoAccessUntil('org_b')).toBeNull();
  });

  it('fails as unavailable when the Compte Kete refuses', async () => {
    const { directory } = fakeAccount({}, { accessStatus: 503 });
    await expect(directory.firmoAccessUntil('org_c')).rejects.toBeInstanceOf(
      AccountUnavailableError,
    );
  });
});
