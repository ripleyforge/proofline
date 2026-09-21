import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';

test('investigation, citations, notes, downloads and history work against the real API', async ({ page, request }) => {
  const list = await (await request.get('/api/incidents')).json();
  const incident = await (await request.get(`/api/incidents/${list[0].id}`)).json();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
  await page.getByLabel('Question', { exact: true }).fill(incident.suggested_questions[0]);
  const answerResponse = page.waitForResponse(r => r.url().endsWith('/api/investigations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
  const response = await answerResponse;
  expect(response.status()).toBe(201);
  const run = await response.json();
  expect(run.status).toBe('answered');
  expect(run.claims.length).toBeGreaterThan(0);
  expect(run.mode).toBe('extractive');
  for (const claim of run.claims) {
    const source = incident.evidence.find((e: { id: string }) => e.id === claim.evidence_id);
    expect(source.incident_id).toBe(incident.id);
    expect(source.trusted).toBe(true);
    expect(source.body).toContain(claim.quote);
  }
  await expect(page.getByRole('heading', { name: 'Statements and sources' })).toBeVisible();
  await page.getByRole('button', { name: `Open ${run.claims[0].evidence_id}`, exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(run.claims[0].quote);
  await drawer.getByRole('button', { name: 'Reference in note', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(JSON.stringify(exported)).toContain(run.id);
  expect(JSON.stringify(exported)).toContain(run.claims[0].evidence_id);

  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const note = `Browser-verified handoff ${Date.now()}: retry configuration needs review.`;
  await page.getByLabel('Note', { exact: true }).fill(note);
  const noteResponse = page.waitForResponse(r => r.url().includes('/notes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  expect((await (await noteResponse).json()).evidence_ids).toContain(run.claims[0].evidence_id);
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Run history' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen' }).first().click();
  await expect(page.getByRole('heading', { name: 'Statements and sources' })).toBeVisible();
});

test('unsupported questions abstain and evaluation displays actual case results', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Question', { exact: true }).fill('What is the cafeteria lunch menu?');
  const pending = page.waitForResponse(r => r.url().endsWith('/api/investigations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
  const run = await (await pending).json();
  expect(run.status).toBe('abstained');
  expect(run.claims).toEqual([]);
  await expect(page.locator('.investigation-result')).toContainText(/abstain|insufficient/i);
  await page.getByRole('button', { name: 'Evaluation lab', exact: true }).click();
  const evaluationResponse = page.waitForResponse(r => r.url().endsWith('/api/evaluations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run evaluation', exact: true }).click();
  const evaluation = await (await evaluationResponse).json();
  expect(evaluation.total).toBeGreaterThanOrEqual(15);
  expect(evaluation.cases.length).toBe(evaluation.total);
  expect(evaluation.passed).toBe(evaluation.cases.filter((c: { passed: boolean }) => c.passed).length);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(evaluation.total + 1);
  await expect(page.getByText('not a model benchmark', { exact: false })).toBeVisible();
});

test('scenario switching never mixes evidence, and unsafe requests are rejected', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  await page.goto('/');
  const queue = page.getByRole('complementary', { name: 'Incident queue' });
  for (const incident of incidents) {
    await queue.getByRole('button', { name: new RegExp(incident.title) }).click();
    await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
  }
  const first = await (await request.get(`/api/incidents/${incidents[0].id}`)).json();
  const badNote = await request.post(`/api/incidents/${incidents[1].id}/notes`, {
    data: { body: 'A mismatched reference', evidence_ids: [first.evidence[0].id] },
  });
  expect(badNote.status()).toBeGreaterThanOrEqual(400);
  const crossSite = await request.post('/api/investigations', {
    headers: { Origin: 'https://untrusted.example' },
    data: { incident_id: incidents[0].id, question: 'Retry settings?', strategy: 'focused', mode: 'extractive' },
  });
  expect(crossSite.status()).toBe(403);
  const unknown = await request.get('/api/not-a-real-route');
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toContain('application/json');
});

test('API errors are actionable and never replaced with fixture results', async ({ page }) => {
  await page.route('**/api/incidents', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Test service unavailable"}' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByText('Test service unavailable', { exact: false })).toBeVisible();
  await page.unroute('**/api/incidents');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
});

test('desktop and mobile have no serious automated accessibility violations or horizontal overflow', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1190, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Evaluation lab', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Evaluation lab' })).toBeVisible();
});
