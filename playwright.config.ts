import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from '@playwright/test';

// Firmo's web space end to end: the production build, the Neon "test" branch and its object
// storage. Sessions are signed with the test session secret (the Compte Kete is not needed to
// prove the space); KETE_CHROMIUM lets a machine without the bundled browser use its own.
const localEnv = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export const PORT = 3401;
export const SESSION_SECRET = 'e2e-session-secret-of-at-least-32-characters';
/** Kete's organization in the e2e: its owners with a second factor are operators. */
export const OPERATORS = 'org_e2e_kete_operators';

const required = [
  'FIRMO_TEST_APP_URL',
  'FIRMO_TEST_STORAGE_ENDPOINT',
  'FIRMO_TEST_STORAGE_ACCESS_KEY_ID',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} must be set (see .env.example).`);
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 375, height: 812 },
    locale: 'fr-FR',
    launchOptions: process.env.KETE_CHROMIUM ? { executablePath: process.env.KETE_CHROMIUM } : {},
  },
  webServer: {
    command: `pnpm build && pnpm exec srvx serve --entry dist/server/server.js --static ${fileURLToPath(new URL('./dist/client', import.meta.url))} --prod --port ${PORT}`,
    port: PORT,
    env: {
      FIRMO_DATABASE_URL: process.env.FIRMO_TEST_APP_URL ?? '',
      FIRMO_URL: `http://localhost:${PORT}`,
      KETE_ACCOUNT_URL: 'http://localhost:9',
      FIRMO_CLIENT_ID: 'e2e',
      FIRMO_CLIENT_SECRET: 'e2e',
      FIRMO_SESSION_SECRET: SESSION_SECRET,
      FIRMO_WORKER: 'off',
      KETE_OPERATORS_ORGANIZATION_ID: OPERATORS,
      FIRMO_WHATSAPP_NUMBER: '22890000000',
      FIRMO_STORAGE_ENDPOINT: process.env.FIRMO_TEST_STORAGE_ENDPOINT ?? '',
      FIRMO_STORAGE_REGION: process.env.FIRMO_TEST_STORAGE_REGION ?? '',
      FIRMO_STORAGE_BUCKET: process.env.FIRMO_TEST_STORAGE_BUCKET ?? 'files',
      FIRMO_STORAGE_ACCESS_KEY_ID: process.env.FIRMO_TEST_STORAGE_ACCESS_KEY_ID ?? '',
      FIRMO_STORAGE_SECRET_ACCESS_KEY: process.env.FIRMO_TEST_STORAGE_SECRET_ACCESS_KEY ?? '',
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
