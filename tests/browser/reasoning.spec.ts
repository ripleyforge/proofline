import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Evidence, Hypothesis, HypothesisInput, IncidentDetail, IncidentSummary, RetrievalInspection } from '../../frontend/src/types';

const input = (statement: string): HypothesisInput => ({ statement, status: 'open', rationale: 'Check the observed sequence.', next_check: 'Compare timestamps.', supporting_evidence_ids: [], challenging_evidence_ids: [] });
const board = (page: Page) => page.getByRole('region', { name: 'Hypothesis board' });
const row = (page: Page, statement: string) => board(page).locator('.hypothesis-item').filter({ has: page.getByRole('heading', { level: 3, name: statement, exact: true }) });

async function fixture(request: APIRequestContext) {
  const incidents: IncidentSummary[] = await (await request.get('/api/incidents')).json();
  const detail: IncidentDetail = await (await request.get(`/api/incidents/${incidents[0].id}`)).json();
  return { incidents, detail };
}

async function create(request: APIRequestContext, incidentId: string, statement: string): Promise<Hypothesis> {
  const response = await request.post(`/api/incidents/${incidentId}/hypotheses`, { data: input(statement) });
  expect(response.status()).toBe(201);
  return response.json();
}

async function selectIncident(page: Page, incident: IncidentSummary) {
  await page.getByRole('complementary', { name: 'Incident queue' }).getByRole('button', { name: new RegExp(incident.title) }).click();
  await expect(page.getByRole('heading', { level: 1, name: incident.title })).toBeVisible();
}

async function addComparison(page: Page, evidence: Evidence) {
  await page.locator('.evidence-row').filter({ has: page.getByText(evidence.title, { exact: true }) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add to comparison', exact: true }).click();
  await page.keyboard.press('Escape');
}

test('hypothesis creation, revision history and handoff use the saved incident records', async ({ page, request }) => {
  const { detail } = await fixture(request);
  const statement = `Retry hypothesis ${Date.now()}`;
  const support = detail.evidence.find(source => source.trusted)!;
  const challenge = detail.evidence.find(source => !source.trusted) ?? detail.evidence.find(source => source.id !== support.id)!;
  await page.goto('/');
  await page.getByRole('button', { name: 'Review hypotheses', exact: true }).click();
  await expect(board(page)).toBeFocused();
  await board(page).getByRole('button', { name: 'Add hypothesis', exact: true }).click();
  await expect(page.getByLabel('Hypothesis statement', { exact: true })).toBeFocused();
  await page.getByLabel('Hypothesis statement', { exact: true }).fill(statement);
  await page.getByLabel('Rationale', { exact: true }).fill('The change preceded the failures; sequence alone does not prove causation.');
  await page.getByLabel('Next check', { exact: true }).fill('Compare retry behavior before and after the change.');
  await page.locator('.hypothesis-reference-picker > summary').click();
  await page.getByLabel(`Role for ${support.title}`, { exact: true }).selectOption('supporting');
  await page.getByLabel(`Role for ${challenge.title}`, { exact: true }).selectOption('challenging');
  const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/hypotheses'));
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  const created: Hypothesis = await (await createdResponse).json();
  expect(created.supporting_evidence_ids).toEqual([support.id]);
  expect(created.challenging_evidence_ids).toEqual([challenge.id]);
  await row(page, statement).getByRole('button', { name: `Edit hypothesis: ${statement}`, exact: true }).click();
  await page.getByLabel('Analyst status', { exact: true }).selectOption('supported');
  await page.getByLabel('Next check', { exact: true }).fill('Reproduce with the prior retry limit.');
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await expect(row(page, statement).locator('.hypothesis-status')).toContainText('Supported');
  await row(page, statement).locator('.hypothesis-history > summary').click();
  await expect(row(page, statement).locator('.hypothesis-history')).toContainText('Showing 2 of 2 revisions');
  await expect(row(page, statement).locator('.hypothesis-history li').first()).toContainText('Reproduce with the prior retry limit.');
  await expect(row(page, statement).locator('.hypothesis-history li').last()).toContainText('Compare retry behavior before and after the change.');
  if (!challenge.trusted) await expect(row(page, statement).locator('.hypothesis-history li').first()).toContainText('Untrusted');
  await page.reload();
  await expect(row(page, statement)).toBeVisible();
  await expect(row(page, statement)).toContainText('Revision 2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download handoff as JSON', exact: true }).click();
  const download = await downloadPromise;
  const fs = await import('node:fs/promises');
  const brief = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(brief.schema_version).toBe(2);
  expect(brief.hypotheses.find((item: Hypothesis) => item.id === created.id)).toMatchObject({ status: 'supported', revision: 2, next_check: 'Reproduce with the prior retry limit.' });
  expect(brief.coverage.hypotheses.included).toBe(brief.hypotheses.length);
});

test('a real stale revision preserves the draft until the user reloads explicitly', async ({ page, request }) => {
  const { detail } = await fixture(request);
  const hypothesis = await create(request, detail.id, `Conflicting hypothesis ${Date.now()}`);
  await page.goto('/');
  await row(page, hypothesis.statement).getByRole('button', { name: `Edit hypothesis: ${hypothesis.statement}`, exact: true }).click();
  const unsaved = 'My unsaved reasoning must remain available.';
  await page.getByLabel('Rationale', { exact: true }).fill(unsaved);
  const response = await request.put(`/api/incidents/${detail.id}/hypotheses/${hypothesis.id}`, { data: { ...input(hypothesis.statement), status: 'ruled_out', rationale: 'Saved from another tab.', expected_revision: 1 } });
  expect(response.status()).toBe(200);
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'A newer revision' })).toBeVisible();
  await expect(page.getByLabel('Rationale', { exact: true })).toHaveValue(unsaved);
  await expect(page.getByRole('button', { name: 'Save hypothesis', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload saved version', exact: true }).click();
  await expect(page.getByLabel('Rationale', { exact: true })).toHaveValue('Saved from another tab.');
  await expect(page.getByLabel('Analyst status', { exact: true })).toHaveValue('ruled_out');
  await page.getByLabel('Rationale', { exact: true }).fill(`${unsaved} Reconciled with revision 2.`);
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await expect(row(page, hypothesis.statement)).toContainText('Revision 3');
});

test('hypothesis list, save and history failures have real retry paths', async ({ page, request }) => {
  const { detail } = await fixture(request);
  const statement = `Retryable save ${Date.now()}`;
  const endpoint = `**/api/incidents/${detail.id}/hypotheses`;
  await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Hypothesis storage unavailable"}' }));
  await page.goto('/');
  await expect(board(page)).toContainText('Hypothesis storage unavailable');
  await page.unroute(endpoint);
  await board(page).getByRole('button', { name: /retry/i }).click();
  await board(page).getByRole('button', { name: 'Add hypothesis', exact: true }).click();
  await page.getByLabel('Hypothesis statement', { exact: true }).fill(statement);
  await page.route(endpoint, route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Save unavailable"}' }) : route.continue());
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Save unavailable' })).toBeVisible();
  await expect(page.getByLabel('Hypothesis statement', { exact: true })).toHaveValue(statement);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await expect(row(page, statement)).toBeVisible();
  await page.route('**/hypotheses/*/revisions', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"History unavailable"}' }));
  await row(page, statement).locator('.hypothesis-history > summary').click();
  await expect(row(page, statement)).toContainText('History unavailable');
  await page.unroute('**/hypotheses/*/revisions');
  await row(page, statement).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(row(page, statement)).toContainText('Showing 1 of 1 revisions');
});

test('late hypothesis reads and saves cannot cross an incident switch', async ({ page, request }) => {
  const { incidents, detail } = await fixture(request);
  const hypothesis = await create(request, detail.id, `Delayed board ${Date.now()}`);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  const endpoint = `**/api/incidents/${detail.id}/hypotheses`;
  await page.route(endpoint, async route => {
    const actual = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response: actual });
  });
  await page.goto('/');
  await requested;
  await selectIncident(page, incidents[1]);
  const late = page.waitForResponse(response => response.url().endsWith(`/incidents/${detail.id}/hypotheses`));
  release();
  await late;
  await expect(board(page).getByText(hypothesis.statement, { exact: true })).toHaveCount(0);
  await page.unroute(endpoint);
  await selectIncident(page, incidents[0]);
  await row(page, hypothesis.statement).getByRole('button', { name: `Edit hypothesis: ${hypothesis.statement}`, exact: true }).click();
  await page.getByLabel('Rationale', { exact: true }).fill('Delayed saved rationale.');
  let releaseSave!: () => void;
  let saveStarted!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  const saveRequested = new Promise<void>(resolve => { saveStarted = resolve; });
  await page.route(`**/hypotheses/${hypothesis.id}`, async route => {
    const actual = await route.fetch();
    saveStarted();
    await saveGate;
    await route.fulfill({ response: actual });
  });
  await page.getByRole('button', { name: 'Save hypothesis', exact: true }).click();
  await saveRequested;
  await selectIncident(page, incidents[1]);
  const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(`/hypotheses/${hypothesis.id}`));
  releaseSave();
  await saved;
  await expect(board(page).getByText(hypothesis.statement, { exact: true })).toHaveCount(0);
  await selectIncident(page, incidents[0]);
  await expect(row(page, hypothesis.statement)).toContainText('Revision 2');
});

test('evidence comparison caps selection at two and supports keyboard reading and focus return', async ({ page, request }) => {
  const { detail } = await fixture(request);
  const first = detail.evidence[0];
  const second = detail.evidence.find(source => !source.trusted && source.id !== first.id) ?? detail.evidence[1];
  await page.goto('/');
  await addComparison(page, first);
  await addComparison(page, second);
  const third = detail.evidence.find(source => source.id !== first.id && source.id !== second.id)!;
  await page.locator('.evidence-row').filter({ has: page.getByText(third.title, { exact: true }) }).click();
  await expect(page.getByRole('button', { name: 'Comparison full (2 sources)', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  const compare = page.getByRole('button', { name: 'Compare selected (2/2)', exact: true });
  await compare.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Evidence comparison' });
  const close = dialog.getByRole('button', { name: 'Close evidence comparison', exact: true });
  await expect(close).toBeFocused();
  await expect(dialog.locator('.comparison-source')).toHaveCount(2);
  await expect(dialog).toContainText(first.body);
  await expect(dialog).toContainText(second.body);
  await expect(dialog.locator('time').first()).toHaveAttribute('datetime', first.timestamp);
  if (!second.trusted) await expect(dialog).toContainText('Untrusted · excluded from answer context');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('.comparison-source').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(compare).toBeFocused();
  await page.getByRole('button', { name: `Remove ${first.title} from comparison`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare selected (1/2)', exact: true })).toBeDisabled();
});

test('retrieval inspector uses live scores, opens sources, and resets on question and incident changes', async ({ page, request }) => {
  const { incidents, detail } = await fixture(request);
  const question = detail.suggested_questions[0];
  const expected: RetrievalInspection = await (await request.post('/api/retrieval/inspect', { data: { incident_id: detail.id, question } })).json();
  const investigationWrites: string[] = [];
  page.on('request', req => { if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/investigations') investigationWrites.push(req.url()); });
  await page.goto('/');
  await page.getByLabel('Question', { exact: true }).fill(question);
  await page.locator('.retrieval-inspector > summary').click();
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await expect(page.locator('.retrieval-candidate')).toHaveCount(expected.candidates.length);
  const source = expected.candidates.find(candidate => candidate.bm25_rank === 1)!;
  const candidate = page.locator('.retrieval-candidate').filter({ has: page.locator('small', { hasText: source.evidence_id }) });
  await expect(candidate.locator('.retrieval-ranks')).toContainText('#1');
  await candidate.locator('.retrieval-candidate-details > summary').click();
  await expect(candidate).toContainText(source.bm25_score.toFixed(3));
  await expect(candidate).toContainText(`${Math.round(source.coverage * 100)}%`);
  await expect(page.locator('.retrieval-inspection-result')).toContainText('Scores measure relevance, not truth or confidence.');
  await candidate.getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText(source.evidence_id);
  await page.keyboard.press('Escape');
  expect(investigationWrites).toEqual([]);
  await page.getByLabel('Question', { exact: true }).fill('A changed question');
  await expect(page.locator('.retrieval-inspection-result')).toHaveCount(0);
  await expect(page.locator('.retrieval-inspector')).not.toHaveAttribute('open');
  await selectIncident(page, incidents[1]);
  await expect(page.locator('.retrieval-inspection-result')).toHaveCount(0);
});

test('late retrieval replies cannot replace a newer question and errors remain retryable', async ({ page, request }) => {
  const { detail } = await fixture(request);
  const original = detail.suggested_questions[0];
  await page.goto('/');
  await page.getByLabel('Question', { exact: true }).fill(original);
  await page.locator('.retrieval-inspector > summary').click();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/retrieval/inspect', async route => {
    if (route.request().postDataJSON().question !== original) { await route.continue(); return; }
    const actual = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response: actual });
  });
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await requested;
  await page.getByLabel('Question', { exact: true }).fill('Cafeteria lunch menu');
  await page.locator('.retrieval-inspector > summary').click();
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await expect(page.locator('.retrieval-query')).toContainText('cafeteria');
  const late = page.waitForResponse(response => response.url().endsWith('/api/retrieval/inspect') && response.request().postDataJSON().question === original);
  release();
  await late;
  await expect(page.locator('.retrieval-query')).toContainText('cafeteria');
  await expect(page.locator('.retrieval-gate')).toContainText('Retrieval excluded');
  await page.unroute('**/api/retrieval/inspect');
  await page.getByLabel('Question', { exact: true }).fill('Payment retry attempts');
  await page.locator('.retrieval-inspector > summary').click();
  await page.route('**/api/retrieval/inspect', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Inspection temporarily unavailable"}' }));
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Inspection temporarily unavailable' })).toBeVisible();
  await page.unroute('**/api/retrieval/inspect');
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await expect(page.locator('.retrieval-inspection-result')).toBeVisible();
});

test('reasoning editor, source comparison and retrieval remain usable on mobile', async ({ page, request }) => {
  const { detail } = await fixture(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await board(page).getByRole('button', { name: 'Add hypothesis', exact: true }).click();
  await page.getByLabel('Hypothesis statement', { exact: true }).fill('A narrow-screen draft');
  await page.locator('.hypothesis-reference-picker > summary').click();
  await page.getByLabel(`Role for ${detail.evidence[0].title}`, { exact: true }).selectOption('supporting');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Discard edit', exact: true }).click();
  await addComparison(page, detail.evidence[0]);
  await addComparison(page, detail.evidence[1]);
  await page.getByRole('button', { name: 'Compare selected (2/2)', exact: true }).click();
  const sources = page.getByRole('dialog').locator('.comparison-source');
  const firstBox = await sources.nth(0).boundingBox();
  const secondBox = await sources.nth(1).boundingBox();
  expect(secondBox!.y).toBeGreaterThan(firstBox!.y);
  expect(Math.abs(secondBox!.x - firstBox!.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByLabel('Question', { exact: true }).fill(detail.suggested_questions[0]);
  await page.locator('.retrieval-inspector > summary').click();
  await page.getByRole('button', { name: 'Compare retrieval strategies', exact: true }).click();
  await expect(page.locator('.retrieval-inspection-result')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
