import { createKeteSignIn } from '@kete/auth';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { currentMember, SESSION_COOKIE, startFreshSignIn } from '@/platform/signin';

// Phase 2 proof: two numbers on the same phone and browser never share a session. Opening B's
// link after A's leaves B signed in — never A. The Compte Kete is faked at its HTTP boundary.

const ACCOUNT = 'https://compte.test';
const FIRMO = 'https://firmo.test';
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Record<string, unknown>[] };
let nextPerson = { sub: '', org: '', name: '' };

beforeAll(async () => {
  keys = await generateKeyPair('EdDSA');
  jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'EdDSA' }] };
});

/** The fake Compte Kete: discovery, and a token for whoever the link signed in. */
const fakeFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith('/.well-known/openid-configuration')) {
    return Response.json({
      issuer: ACCOUNT,
      authorization_endpoint: `${ACCOUNT}/api/auth/oauth2/authorize`,
      token_endpoint: `${ACCOUNT}/api/auth/oauth2/token`,
      jwks_uri: `${ACCOUNT}/api/auth/jwks`,
    });
  }
  if (url.endsWith('/oauth2/token')) {
    const token = await new SignJWT({
      email: `${nextPerson.sub}@phone.kete.invalid`,
      name: nextPerson.name,
      org: nextPerson.org,
      role: 'owner',
      apps: {},
      two_factor: false,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setSubject(nextPerson.sub)
      .setIssuer(ACCOUNT)
      .setAudience('urn:kete:apps')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(keys.privateKey);
    return Response.json({ access_token: token, token_type: 'Bearer' });
  }
  return new Response(null, { status: 404 });
};

/** A browser: a cookie jar that follows Set-Cookie. */
function browser() {
  const jar = new Map<string, string>();
  return {
    request(path: string) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      return new Request(`${FIRMO}${path}`, { headers: cookie ? { cookie } : {} });
    },
    receive(response: Response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const index = (pair ?? '').indexOf('=');
        const name = (pair ?? '').slice(0, index);
        const value = (pair ?? '').slice(index + 1);
        if (/Max-Age=0/.test(line) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
  };
}

const signIn = () =>
  createKeteSignIn({
    accountUrl: ACCOUNT,
    clientId: 'firmo',
    clientSecret: 'secret',
    redirectUri: `${FIRMO}/auth/callback`,
    sessionSecret: 'a-test-session-secret-of-at-least-32-chars',
    cookieName: SESSION_COOKIE,
    fetch: fakeFetch,
    jwks: jwks as never,
  });

/** Follows a one-time link for `person`: Firmo's fresh sign-in, the Compte Kete, the callback. */
async function openLinkAs(
  b: ReturnType<typeof browser>,
  instance: ReturnType<typeof signIn>,
  person: typeof nextPerson,
) {
  nextPerson = person;
  const started = b.receive(
    await startFreshSignIn(b.request('/auth/connexion?returnTo=/espace'), instance),
  );
  const state = new URL(started.headers.get('location') ?? '').searchParams.get('state');
  return b.receive(
    await instance.callback(b.request(`/auth/callback?code=c-${person.sub}&state=${state}`)),
  );
}

describe('two numbers, one browser', () => {
  it("opening B's link after A's leaves B signed in, never A", async () => {
    const instance = signIn();
    const b = browser();
    const landed = await openLinkAs(b, instance, { sub: 'usr_a', org: 'org_a', name: 'Kodjo' });
    expect(landed.headers.get('location')).toBe('/espace');
    expect(await currentMember(b.request('/espace'), instance)).toMatchObject({
      userId: 'usr_a',
      organizationId: 'org_a',
    });

    await openLinkAs(b, instance, { sub: 'usr_b', org: 'org_b', name: 'Béni' });
    expect(await currentMember(b.request('/espace'), instance)).toMatchObject({
      userId: 'usr_b',
      organizationId: 'org_b',
    });
  });

  it('drops the previous session as soon as a link is opened, even if the sign-in is abandoned', async () => {
    const instance = signIn();
    const b = browser();
    await openLinkAs(b, instance, { sub: 'usr_a', org: 'org_a', name: 'Kodjo' });
    b.receive(await startFreshSignIn(b.request('/auth/connexion?returnTo=/espace'), instance));
    expect(await currentMember(b.request('/espace'), instance)).toBeNull();
  });

  it('refuses a replayed or forged callback', async () => {
    const instance = signIn();
    const b = browser();
    await expect(
      instance.callback(b.request('/auth/callback?code=x&state=forged')),
    ).rejects.toThrow();
  });
});
