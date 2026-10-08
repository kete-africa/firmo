import { expect, test } from '@playwright/test';

// Spec 013: the public page at 375 px, in French and English — the offer, the way into the
// conversation, and the demonstration quote really served.

test('the page opens the conversation, in French, without scrolling sideways', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Un devis prêt à envoyer.');
  const cta = page.getByRole('link', { name: 'Essayer avec un vocal' }).first();
  await expect(cta).toHaveAttribute('href', /^https:\/\/wa\.me\/22890000000\?text=/);
  // The offer says what is offered and what a period costs, from the plans' figures.
  await expect(page.getByText('3 documents offerts pour commencer.')).toBeVisible();
  await expect(page.getByText('30 documents finaux par période de 30 jours.')).toBeVisible();
  await expect(page.getByText('2 000 F CFA', { exact: true })).toBeVisible();
  // Nothing about a visitor is asked: no form, no field.
  await expect(page.locator('form, input, textarea')).toHaveCount(0);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBe(0);
});

test('the quote shown is a real file, said to be a demonstration', async ({ page, request }) => {
  await page.goto('/');
  await expect(
    page.getByText('Démonstration : atelier, client et montants sont fictifs.', { exact: false }),
  ).toBeVisible();
  const pdf = await request.get('/landing/devis-exemple.pdf');
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect((await request.get('/landing/devis-exemple.png')).status()).toBe(200);
});

test('the page exists in English', async ({ page, context }) => {
  await context.addCookies([{ name: 'kete_locale', value: 'en', url: 'http://localhost:3401' }]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A quote ready to send.');
  await expect(page.getByRole('link', { name: 'Try with a voice note' }).first()).toBeVisible();
});
