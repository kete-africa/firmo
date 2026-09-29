import { createKeteSignIn, type KeteIdentity, type KeteSignIn } from '@kete/auth';
import { env } from './env';

/**
 * Firmo's web session: single sign-on with the Compte Kete (kete-core spec 007), in Firmo's own
 * signed, HTTP-only cookie. Reached from the conversation through a one-time link (spec 013).
 */
export const SESSION_COOKIE = 'firmo_session';

let signIn: KeteSignIn | undefined;

export function getSignIn(): KeteSignIn {
  signIn ??= createKeteSignIn({
    accountUrl: env.accountUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: `${env.publicUrl}/auth/callback`,
    sessionSecret: env.sessionSecret,
    cookieName: SESSION_COOKIE,
  });
  return signIn;
}

/** For tests: a sign-in against a fake Compte Kete. */
export function useSignIn(replacement: KeteSignIn): void {
  signIn = replacement;
}

/**
 * Starts a sign-in and drops the browser's current Firmo session first: whoever opens a link
 * becomes the person of that link — never the one who used this browser before (constitution
 * III). The Compte Kete did the same for its own session when the link was opened.
 */
export async function startFreshSignIn(
  request: Request,
  instance = getSignIn(),
): Promise<Response> {
  const started = await instance.start(request);
  const headers = new Headers(started.headers);
  const secure = new URL(request.url).protocol === 'https:';
  headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  );
  return new Response(null, { status: started.status, headers });
}

/** The person signed in to Firmo, with her organization — or null. */
export async function currentMember(
  request: Request,
  instance = getSignIn(),
): Promise<(KeteIdentity & { organizationId: string }) | null> {
  const identity = await instance.session(request);
  if (!identity?.organizationId) return null;
  return identity as KeteIdentity & { organizationId: string };
}
