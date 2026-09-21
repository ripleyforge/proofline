import { test, expect } from '@playwright/test';

test('startup does not download full investigation history', async ({ page }) => {
  const historyRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/investigations') historyRequests.push(url.toString());
  });
  await page.goto('/');
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
  expect(historyRequests).toEqual([]);
});

test('question and note drafts survive incident switches and reload without crossing incidents', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  await page.goto('/');
  const question = 'Draft: what changed in the payment retry configuration?';
  const note = `Unfinished observation ${Date.now()}: confirm the retry budget.`;
  await page.getByLabel('Question', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill(note);
  const queue = page.getByRole('complementary', { name: 'Incident queue' });
  await queue.getByRole('button', { name: new RegExp(incidents[1].title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: incidents[1].title })).toBeVisible();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  await queue.getByRole('button', { name: new RegExp(incidents[0].title) }).click();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue(question);
  if (!await page.getByLabel('Note', { exact: true }).isVisible()) await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(note);
  await page.reload();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue(question);
  if (!await page.getByLabel('Note', { exact: true }).isVisible()) await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(note);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('');
});

test('evidence dialog contains keyboard focus and returns it to its source', async ({ page }) => {
  await page.goto('/');
  const source = page.locator('.evidence-row').first();
  await source.click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close evidence drawer', exact: true });
  const reference = dialog.getByRole('button', { name: 'Reference in note', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(reference).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(source).toBeFocused();
});
