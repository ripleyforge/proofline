import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const contextKey = 'proofline:workspace-context:v1';

async function makeSavedRun(request: APIRequestContext, index = 1) {
  const incidents = await (await request.get('/api/incidents')).json();
  const incident = await (await request.get(`/api/incidents/${incidents[index].id}`)).json();
  const response = await request.post('/api/investigations', { data: {
    incident_id: incident.id, question: incident.suggested_questions[0], strategy: 'focused', mode: 'extractive',
  } });
  expect(response.status()).toBe(201);
  return { incidents, incident, run: await response.json() };
}

async function seedContext(page: Page, value: unknown) {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), { key: contextKey, value });
}

test('reload restores the second incident and exact displayed run without replacing drafts or loading history', async ({ page, request }) => {
  const { incidents, incident } = await makeSavedRun(request);
  await page.goto('/');
  const queue = page.getByRole('complementary', { name: 'Incident queue' });
  await queue.getByRole('button', { name: new RegExp(incident.title) }).click();
  await page.getByLabel('Question', { exact: true }).fill(incident.suggested_questions[0]);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/investigations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
  const run = await (await saved).json();
  await expect(page.locator('.result-question')).toContainText(run.question);
  const draft = 'An unfinished follow-up question';
  await page.getByLabel('Question', { exact: true }).fill(draft);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill('An unfinished incident-specific note');
  const requests: string[] = [];
  page.on('request', r => { if (r.method() === 'GET') requests.push(new URL(r.url()).pathname); });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
  await expect(page.locator('.result-question')).toContainText(run.question);
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue(draft);
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('An unfinished incident-specific note');
  expect(requests.filter(path => path.startsWith('/api/investigations'))).toEqual([`/api/investigations/${run.id}`]);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), contextKey)).toEqual({ incidentId: incident.id, runId: run.id });

  await queue.getByRole('button', { name: new RegExp(incidents[2].title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: incidents[2].title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: incidents[2].title })).toBeVisible();
  await expect(page.locator('.investigation-result')).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), contextKey)).toEqual({ incidentId: incidents[2].id, runId: null });
});

test('a run reopened from history becomes the workspace restored on reload', async ({ page, request }) => {
  const { incident, run } = await makeSavedRun(request);
  await page.goto('/#/history');
  const row = page.locator('.history-item').filter({ has: page.getByRole('heading', { name: run.question, exact: true }) }).first();
  await row.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(page.locator('.result-question')).toContainText(run.question);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
  await expect(page.locator('.result-question')).toContainText(run.question);
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
});

for (const failure of ['missing', 'wrong incident', 'unavailable'] as const) {
  test(`a saved run that is ${failure} leaves its incident usable and reports the restore failure`, async ({ page, request }) => {
    const { incidents, incident, run } = await makeSavedRun(request);
    const selected = failure === 'wrong incident' ? incidents[0] : incident;
    const runId = failure === 'missing' ? 'missing-saved-run' : run.id;
    await seedContext(page, { incidentId: selected.id, runId });
    if (failure === 'unavailable') {
      await page.route(`**/api/investigations/${runId}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Storage unavailable"}' }));
    }
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: selected.title })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /previous result could not be restored/i })).toBeVisible();
    await expect(page.locator('.investigation-result')).toHaveCount(0);
    await page.getByLabel('Question', { exact: true }).fill('A fresh investigation question');
    await expect(page.getByRole('button', { name: 'Run investigation', exact: true })).toBeEnabled();
    expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), contextKey)).toEqual({ incidentId: selected.id, runId: null });
  });
}

test('an unknown stored incident falls back to an available incident without requesting its run', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  await seedContext(page, { incidentId: 'missing-incident', runId: 'missing-run' });
  const runRequests: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/investigations/')) runRequests.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: incidents[0].title })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /previous incident is no longer available/i })).toBeVisible();
  expect(runRequests).toEqual([]);
});

for (const raw of ['{invalid', '[]', '{"incidentId":"../invalid","runId":null}']) {
  test(`malformed workspace state ${raw} does not prevent investigation`, async ({ page }) => {
    await page.addInitScript(({ key, raw }) => sessionStorage.setItem(key, raw), { key: contextKey, raw });
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: /previous workspace context could not be read/i })).toBeVisible();
    await page.getByLabel('Question', { exact: true }).fill('Payment retry attempts?');
    await expect(page.getByRole('button', { name: 'Run investigation', exact: true })).toBeEnabled();
  });
}

for (const operation of ['read', 'write'] as const) {
  test(`blocked session storage ${operation} leaves the selected incident and composer usable`, async ({ page, request }) => {
    const incidents = await (await request.get('/api/incidents')).json();
    await page.addInitScript(operation => {
      if (operation === 'read') Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      else Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    }, operation);
    await page.goto('/');
    await page.getByRole('complementary', { name: 'Incident queue' }).getByRole('button', { name: new RegExp(incidents[1].title) }).click();
    await expect(page.getByRole('heading', { level: 1, name: incidents[1].title })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /workspace context cannot be saved/i })).toBeVisible();
    await page.getByLabel('Question', { exact: true }).fill('The composer remains usable');
    await expect(page.getByRole('button', { name: 'Run investigation', exact: true })).toBeEnabled();
  });
}

for (const action of ['new run', 'incident', 'navigation', 'question edit'] as const) {
  test(`a delayed restore cannot overwrite a later ${action}`, async ({ page, request }) => {
    const { incidents, incident, run } = await makeSavedRun(request);
    await seedContext(page, { incidentId: incident.id, runId: run.id });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const requested = new Promise<void>(resolve => { started = resolve; });
    await page.route(`**/api/investigations/${run.id}`, async route => {
      const actual = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response: actual });
    });
    await page.goto('/');
    await requested;
    await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
    const question = 'What changed in consumer settings?';
    if (action === 'new run' || action === 'question edit') {
      await page.getByLabel('Question', { exact: true }).fill(question);
      if (action === 'new run') {
        const saved = page.waitForResponse(r => r.url().endsWith('/api/investigations') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Run investigation', exact: true }).click();
        expect((await saved).status()).toBe(201);
        await expect(page.locator('.result-question')).toContainText(question);
      }
    } else if (action === 'incident') {
      await page.getByRole('complementary', { name: 'Incident queue' }).getByRole('button', { name: new RegExp(incidents[0].title) }).click();
      await expect(page.getByRole('heading', { level: 1, name: incidents[0].title })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Evaluation lab', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Evaluation lab' })).toBeVisible();
    }
    const late = page.waitForResponse(r => r.url().endsWith(`/api/investigations/${run.id}`));
    release();
    await late;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (action === 'new run') {
      await expect(page.locator('.result-question')).toContainText(question);
      expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).runId, contextKey)).not.toBe(run.id);
    } else {
      if (action === 'navigation') {
        await expect(page.getByRole('heading', { level: 1, name: 'Evaluation lab' })).toBeVisible();
        await page.getByRole('button', { name: 'Workspace', exact: true }).click();
      }
      await expect(page.locator('.investigation-result')).toHaveCount(0);
    }
    if (action === 'question edit' || action === 'new run') await expect(page.getByLabel('Question', { exact: true })).toHaveValue(question);
  });
}
