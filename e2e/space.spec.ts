import { randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { SignJWT } from 'jose';
import pg from 'pg';
import { PORT, SESSION_SECRET } from '../playwright.config';

// Phase 4 proof: the tradesman's space at 375 px, in French and English — his documents, the
// editor, issuance, a share link for his client, his presentation — and another organization's
// document is not found.

const run = randomBytes(3).toString('hex');
const A = `org_e2e_a_${run}`;
const B = `org_e2e_b_${run}`;
const BASE = `http://localhost:${PORT}`;
const shots = process.env.FIRMO_SCREENSHOTS;

process.env.FIRMO_DATABASE_URL = process.env.FIRMO_TEST_APP_URL;
for (const name of ['ENDPOINT', 'REGION', 'BUCKET', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']) {
  process.env[`FIRMO_STORAGE_${name}`] = process.env[`FIRMO_TEST_STORAGE_${name}`];
}

let draftId = 0;
let issuedId = 0;
let foreignId = 0;

async function signIn(context: BrowserContext, organizationId: string, locale: 'fr' | 'en' = 'fr') {
  const session = await new SignJWT({
    email: 'p22890000000@phone.kete.invalid',
    name: 'Kodjo',
    org: organizationId,
    role: 'owner',
    apps: {},
    two_factor: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(`usr_${organizationId}`)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SESSION_SECRET));
  await context.addCookies([
    { name: 'firmo_session', value: session, url: BASE },
    { name: 'kete_locale', value: locale, url: BASE },
  ]);
}

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test.beforeAll(async () => {
  const { createDocuments } = await import('../src/features/documents');
  const { getStorage } = await import('../src/platform/files');
  const { typstRenderer } = await import('../src/platform/typst');
  const documents = createDocuments({ renderer: typstRenderer(), files: getStorage() });
  await documents.saveProfile(
    { organizationId: A },
    { name: 'Atelier Kodjo', trade: 'Chaudronnerie' },
  );
  await documents.saveProfile({ organizationId: B }, { name: 'Menuiserie Béni' });
  const sale = {
    type: 'quote' as const,
    subject: 'Portail et garde-corps',
    client: { name: 'Mairie d’Agoè' },
    sections: [
      {
        title: 'Portail coulissant',
        showSubtotal: true,
        lines: [
          {
            label: 'Tube rectangulaire 80 x 40',
            unit: 'barre',
            quantity: '12',
            unitPrice: '18000',
          },
          { label: 'Tôle noire 20/10', unit: 'feuille', quantity: '4', unitPrice: '32000' },
        ],
      },
    ],
  };
  draftId = await documents.createDraft({ organizationId: A }, sale);
  issuedId = await documents.createDraft(
    { organizationId: A },
    { ...sale, subject: 'Garde-corps' },
  );
  const { sha256 } = await documents.preview({ organizationId: A }, issuedId);
  await documents.issue({ organizationId: A }, issuedId, { sha256 });
  foreignId = await documents.createDraft(
    { organizationId: B },
    { ...sale, subject: 'Porte en bois' },
  );
});

test.afterAll(async () => {
  const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });
  const { purgeOrganizations } = await import('../tests/support/cleanup');
  await owner.query('delete from document_shares where organization_id = any($1)', [[A, B]]);
  await purgeOrganizations(owner, [A, B]);
  await owner.end();
});

test('a visitor without a session is sent to sign in', async ({ request }) => {
  const response = await request.get('/espace', { maxRedirects: 0 });
  expect([302, 307]).toContain(response.status());
  expect(response.headers().location ?? '').toContain('/auth/connexion');
});

test('his documents: the draft to continue and the issued ones', async ({ page, context }) => {
  await signIn(context, A);
  await page.goto('/espace');
  await expect(page.getByRole('heading', { name: 'Tes documents' })).toBeVisible();
  await expect(page.getByText('À continuer')).toBeVisible();
  await expect(page.getByText('Portail et garde-corps')).toBeVisible();
  await expect(page.getByText(/DEV-\d{4}-001/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Créer dans la conversation' })).toHaveAttribute(
    'href',
    'https://wa.me/22890000000',
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await shot(page, '1-accueil');
});

test("he corrects a price, and the server's total follows; then he issues", async ({
  page,
  context,
}) => {
  await signIn(context, A);
  await page.goto(`/espace/documents/${draftId}`);
  await expect(page.getByText('344 000').first()).toBeVisible();
  await page.getByRole('button', { name: /Tôle noire 20\/10/ }).click();
  await page.getByLabel('Prix unitaire').fill('35 000');
  await shot(page, '2-editeur');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(
    page.getByText('C’est enregistré.').or(page.getByText("C'est enregistré.")),
  ).toBeVisible();
  await expect(page.getByText('356 000').first()).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  const issued = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('_serverFn'),
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Émettre' }).click();
  await issued;
  await expect(page.getByText(/Document émis : DEV-\d{4}-002/)).toBeVisible({ timeout: 30_000 });
  const pdf = await page.request.get(`/api/documents/${draftId}/pdf`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
});

test('a share link opens one document for his client, until he removes it', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context, A);
  await page.goto(`/espace/documents/${issuedId}`);
  await page.getByRole('button', { name: 'Partager' }).click();
  const url = await page.getByLabel('Lien de partage').inputValue();
  expect(url).toMatch(/\/d\/[\w-]{20,}$/);
  const client = await browser.newContext();
  const opened = await client.request.get(url);
  expect(opened.status()).toBe(200);
  expect(opened.headers()['content-type']).toBe('application/pdf');
  await page.reload();
  await expect(page.getByText('Ouvert 1 fois.')).toBeVisible();
  await page.getByRole('button', { name: 'Retirer le lien' }).click();
  await expect.poll(async () => (await client.request.get(url)).status()).toBe(404);
  await client.close();
});

test('his presentation: saved, and seen on the real rendering', async ({ page, context }) => {
  await signIn(context, A);
  await page.goto('/espace/presentation');
  await page.getByLabel('Métier').fill('Chaudronnerie - Soudure');
  await page.getByRole('button', { name: '#2B5C88' }).click();
  await page.getByRole('button', { name: 'Enregistrer ma présentation' }).click();
  await expect(page.getByText('Présentation enregistrée.')).toBeVisible();
  const preview = page.getByRole('img', { name: /Aperçu de la première page/ });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(100);
  await shot(page, '3-presentation');
});

test('in English too', async ({ page, context }) => {
  await signIn(context, A, 'en');
  await page.goto('/espace');
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();
  await shot(page, '4-accueil-en');
});

test("another organization's document is not found", async ({ page, context }) => {
  await signIn(context, A);
  await page.goto(`/espace/documents/${foreignId}`);
  await expect(page.getByRole('heading', { name: 'Ce document est introuvable.' })).toBeVisible();
  const pdf = await page.request.get(`/api/documents/${foreignId}/pdf`);
  expect(pdf.status()).toBe(404);
});
