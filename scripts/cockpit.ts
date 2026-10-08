/**
 * Connects a hosted Firmo to Kete Cockpit, after an operator registered Firmo's address there:
 * the Cockpit shows a signing key once; this command asks for it, sends it straight to the hosting
 * environment with the Cockpit's receiver address, and redeploys. The key is never printed nor
 * written to a file.
 *
 *   pnpm cockpit:connect                       (staging: the defaults below)
 *   pnpm cockpit:connect <coolify app> <cockpit origin>
 *   pnpm cockpit:status [firmo origin]         how many events wait, and since when
 *
 * Reads the hosting address and token from the author's secrets file (the same one kete-core's
 * `staging:operator` reads): COOLIFY_URL, COOLIFY_API_TOKEN.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const hostingEnv = fileURLToPath(new URL('../../../.secrets/atelier-admin.env', import.meta.url));
if (existsSync(hostingEnv)) process.loadEnvFile(hostingEnv);

const STAGING_APP = 'tzhsp5ehomtd4bpmgjkvcgr7';
const STAGING_COCKPIT = 'https://cockpit-kete-staging.13.140.178.49.sslip.io';
const STAGING_FIRMO = 'https://firmo-staging.13.140.178.49.sslip.io';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Asks on the terminal; a hidden answer is never echoed. */
function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const input = process.stdin;
    process.stdout.write(question);
    if (!hidden || !input.isTTY) {
      input.once('data', (chunk) => resolve(String(chunk).trim()));
      return;
    }
    input.setRawMode(true);
    let answer = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        const code = char.charCodeAt(0);
        if (code === 10 || code === 13) {
          input.setRawMode(false);
          input.off('data', onData);
          input.pause();
          process.stdout.write('\n');
          resolve(answer.trim());
          return;
        }
        if (code === 3) process.exit(130);
        answer = code === 8 || code === 127 ? answer.slice(0, -1) : answer + char;
      }
    };
    input.on('data', onData);
  });
}

async function hosting(method: string, path: string, body?: unknown): Promise<unknown> {
  const base = required('COOLIFY_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${required('COOLIFY_API_TOKEN')}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`hosting ${method} ${path}: ${response.status}`);
  return response.json().catch(() => null);
}

/** Sets runtime-only variables on the hosted application (never available at build time). */
async function setEnv(app: string, values: Record<string, string>): Promise<void> {
  const existing = (await hosting('GET', `/applications/${app}/envs`)) as {
    uuid: string;
    key: string;
  }[];
  for (const [key, value] of Object.entries(values)) {
    for (const old of existing.filter((e) => e.key === key)) {
      await hosting('DELETE', `/applications/${app}/envs/${old.uuid}`);
    }
    await hosting('POST', `/applications/${app}/envs`, {
      key,
      value,
      is_literal: true,
      is_preview: false,
    });
  }
  // The hosting creates a preview twin and makes new variables available at build time: the
  // twin goes, and the variable stays for the running application only.
  const created = (await hosting('GET', `/applications/${app}/envs`)) as {
    uuid: string;
    key: string;
    value: string;
    is_preview: boolean;
  }[];
  for (const env of created.filter((e) => e.key in values)) {
    if (env.is_preview) await hosting('DELETE', `/applications/${app}/envs/${env.uuid}`);
    else {
      await hosting('PATCH', `/applications/${app}/envs`, {
        key: env.key,
        value: env.value,
        is_literal: true,
        is_buildtime: false,
      });
    }
  }
}

async function status(origin: string): Promise<void> {
  const report = (await (await fetch(`${origin}/health`)).json()) as {
    status: string;
    outbox?: { pending: number; oldest_pending_age_seconds?: number };
  };
  const waiting = report.outbox?.pending ?? 0;
  const hours = Math.round((report.outbox?.oldest_pending_age_seconds ?? 0) / 3600);
  console.log(
    waiting === 0
      ? `${origin}: ${report.status}; no event waits — the Cockpit hears Firmo.`
      : `${origin}: ${report.status}; ${waiting} event(s) wait, the oldest for ${hours} h.`,
  );
}

const [command, first, second] = process.argv.slice(2);

if (command === 'status') {
  await status((first ?? STAGING_FIRMO).replace(/\/$/, ''));
} else if (command === 'connect') {
  const app = first ?? STAGING_APP;
  const cockpit = (second ?? STAGING_COCKPIT).replace(/\/$/, '');
  if (!/^https:\/\//.test(cockpit)) throw new Error('The Cockpit address must be https.');
  console.log(
    `In Kete Cockpit (${cockpit}) → Apps → register Firmo's address, then copy the key it shows.`,
  );
  const kid = await ask('Key id (key_…): ');
  const secret = await ask('Key secret (hidden): ', true);
  if (!/^key_[\w-]{8,}$/.test(kid) || secret.length < 20) {
    throw new Error('This does not look like a Cockpit key: nothing was changed.');
  }
  await setEnv(app, {
    KETE_KEY_ID: kid,
    KETE_KEY_SECRET: secret,
    KETE_RECEIVER_URL: `${cockpit}/api/events`,
  });
  await hosting('POST', '/deploy', { uuid: app });
  console.log(
    'Done: the key is in the hosting environment and Firmo is redeploying. In a few minutes,\n' +
      '`pnpm cockpit:status` says whether the waiting events have left.',
  );
  process.exit(0);
} else {
  console.log('pnpm cockpit:connect [coolify app] [cockpit origin] · pnpm cockpit:status [origin]');
  process.exitCode = 1;
}
