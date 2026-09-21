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

test('history pages and filters saved summaries, then fetches the exact full run on reopen', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  const marker = `historytest${Date.now()}`;
  const runs = [];
  for (let index = 0; index < 25; index++) {
    const response = await request.post('/api/investigations', { data: {
      incident_id: incidents[0].id, question: `Payment retry attempts change ${marker} ${index}?`, strategy: 'focused', mode: 'extractive',
    } });
    expect(response.status()).toBe(201);
    runs.push(await response.json());
  }
  const unsupported = await request.post('/api/investigations', { data: {
    incident_id: incidents[0].id, question: `Cafeteria lunch menu ${marker}?`, strategy: 'focused', mode: 'extractive',
  } });
  expect((await unsupported.json()).status).toBe('abstained');
  await page.goto('/#/history');
  await page.getByLabel('Search questions', { exact: true }).fill(marker);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Showing 1–20 of 26', { exact: true })).toBeVisible();
  await expect(page.locator('.history-item')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Showing 21–26 of 26', { exact: true })).toBeVisible();
  await expect(page.locator('.history-item')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByLabel('Status filter', { exact: true }).selectOption('abstained');
  await expect(page.getByText('Showing 1–1 of 1', { exact: true })).toBeVisible();
  await page.getByLabel('Status filter', { exact: true }).selectOption('');
  await expect(page.getByText('Showing 1–20 of 26', { exact: true })).toBeVisible();
  await page.getByLabel('Incident filter', { exact: true }).selectOption(incidents[1].id);
  await expect(page.getByText('No saved investigations', { exact: true })).toBeVisible();
  await page.getByLabel('Incident filter', { exact: true }).selectOption(incidents[0].id);
  await expect(page.getByText('Showing 1–20 of 26', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  const oldest = page.locator('.history-item').filter({ has: page.getByRole('heading', { name: runs[0].question, exact: true }) });
  const fullRun = page.waitForResponse(r => r.url().endsWith(`/api/investigations/${runs[0].id}`));
  await oldest.getByRole('button', { name: 'Reopen', exact: true }).click();
  expect((await (await fullRun).json()).id).toBe(runs[0].id);
  await expect(page.locator('.investigation-result')).toContainText(runs[0].question);
});

test('incident handoff download contains saved notes and reports failures without fake success', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  const detail = await (await request.get(`/api/incidents/${incidents[1].id}`)).json();
  const run = await (await request.post('/api/investigations', { data: {
    incident_id: detail.id, question: detail.suggested_questions[0], strategy: 'focused', mode: 'extractive',
  } })).json();
  const note = await (await request.post(`/api/incidents/${detail.id}/notes`, { data: {
    body: `Handoff observation ${Date.now()}: review the consumer configuration.`, evidence_ids: [detail.evidence[0].id],
  } })).json();
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Incident queue' }).getByRole('button', { name: new RegExp(detail.title) }).click();
  const control = page.getByRole('button', { name: 'Download handoff as JSON', exact: true });
  await page.route(`**/api/incidents/${detail.id}/brief?format=json`, route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"detail":"Handoff storage unavailable"}',
  }));
  await control.click();
  await expect(page.getByRole('alert').filter({ hasText: /handoff|export|503/i }).first()).toBeVisible();
  await page.unroute(`**/api/incidents/${detail.id}/brief?format=json`);
  const downloadPromise = page.waitForEvent('download');
  await control.click();
  const download = await downloadPromise;
  const fs = await import('node:fs/promises');
  const brief = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(brief.incident.id).toBe(detail.id);
  expect(brief.investigations.map((item: { id: string }) => item.id)).toContain(run.id);
  expect(brief.notes.map((item: { id: string }) => item.id)).toContain(note.id);
  expect(brief.sources.map((item: { id: string }) => item.id)).toContain(detail.evidence[0].id);
  expect(brief.coverage.investigations.included).toBe(brief.investigations.length);
  expect(brief.coverage.notes.included).toBe(brief.notes.length);
  expect(brief.notes.every((item: { incident_id: string }) => item.incident_id === detail.id)).toBe(true);
  expect(download.suggestedFilename()).toContain(detail.id);
});

test('late history search responses cannot replace newer filters', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  const suffix = Date.now();
  const first = `oldsearch${suffix}`, second = `newsearch${suffix}`;
  for (const marker of [first, second]) {
    await request.post('/api/investigations', { data: { incident_id: incidents[0].id, question: `Payment retry ${marker}`, strategy: 'focused', mode: 'extractive' } });
  }
  await page.goto('/#/history');
  await expect(page.getByLabel('Search questions', { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/investigations/page?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') !== first) { await route.continue(); return; }
    const actual = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response: actual });
  });
  await page.getByLabel('Search questions', { exact: true }).fill(first);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await requested;
  await page.getByLabel('Search questions', { exact: true }).fill(second);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Payment retry ${second}`, exact: true })).toBeVisible();
  const late = page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === first);
  release();
  await late;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading', { name: `Payment retry ${second}`, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Payment retry ${first}`, exact: true })).toHaveCount(0);
});

test('a late run reopen cannot pull the user away from their new view', async ({ page, request }) => {
  const incidents = await (await request.get('/api/incidents')).json();
  const run = await (await request.post('/api/investigations', { data: {
    incident_id: incidents[0].id, question: `Payment retry reopen${Date.now()}`, strategy: 'focused', mode: 'extractive',
  } })).json();
  await page.goto('/#/history');
  const row = page.locator('.history-item').filter({ has: page.getByRole('heading', { name: run.question, exact: true }) });
  await expect(row).toBeVisible();
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
  await row.getByRole('button', { name: 'Reopen', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: 'Evaluation lab', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Evaluation lab' })).toBeVisible();
  const late = page.waitForResponse(r => r.url().endsWith(`/api/investigations/${run.id}`));
  release();
  await late;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading', { level: 1, name: 'Evaluation lab' })).toBeVisible();
});
