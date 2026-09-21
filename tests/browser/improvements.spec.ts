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
  const detail = await (await request.get(`/api/incidents/${incidents[0].id}`)).json();
  await page.locator('.evidence-row').first().click();
  const sourceTitle = await page.getByRole('dialog').getByRole('heading', { level: 2 }).textContent();
  const source = detail.evidence.find((item: { title: string }) => item.title === sourceTitle);
  await page.getByRole('dialog').getByRole('button', { name: 'Reference in note', exact: true }).click();
  await page.keyboard.press('Escape');
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
  const savedResponse = page.waitForResponse(r => r.url().includes('/notes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  expect((await (await savedResponse).json()).evidence_ids).toContain(source.id);
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

test('blocked browser storage keeps the composer usable and explains the draft limit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('Disabled in test', 'SecurityError'); },
    });
  });
  await page.goto('/');
  const question = page.getByLabel('Question', { exact: true });
  await question.fill('What changed in payment retries?');
  await expect(question).toHaveValue('What changed in payment retries?');
  await expect(page.getByText(/drafts.*(cannot|unavailable|not.*sav)|browser storage.*unavailable/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill('This note remains editable.');
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('This note remains editable.');
});

test('restored note drafts drop references from another incident before saving', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  const own = await (await request.get(`/api/incidents/${incidents[0].id}`)).json();
  const other = await (await request.get(`/api/incidents/${incidents[1].id}`)).json();
  const body = `Restored draft ${Date.now()}`;
  await page.addInitScript(({ incidentId, ownId, otherId, body }) => {
    sessionStorage.setItem('proofline:incident-drafts:v1', JSON.stringify({
      [incidentId]: { question: '', noteBody: body, noteOpen: true, evidenceIds: [ownId, otherId, 'missing-evidence'] },
    }));
  }, { incidentId: own.id, ownId: own.evidence[0].id, otherId: other.evidence[0].id, body });
  await page.goto('/');
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(body);
  const saved = page.waitForResponse(r => r.url().includes('/notes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect((await response.json()).evidence_ids).toEqual([own.evidence[0].id]);
});

test('malformed stored drafts do not prevent opening the workspace', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('proofline:incident-drafts:v1', '{invalid'));
  await page.goto('/');
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  await page.getByLabel('Question', { exact: true }).fill('Payment retries?');
  await expect(page.getByRole('button', { name: 'Run investigation', exact: true })).toBeEnabled();
});
