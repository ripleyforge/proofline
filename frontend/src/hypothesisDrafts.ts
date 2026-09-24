import type { HypothesisInput } from './types'

export interface HypothesisEditTarget { id: string; revision: number }
export interface HypothesisDraft { input: HypothesisInput; editing: HypothesisEditTarget | null }
export type HypothesisDraftNotice = 'unavailable' | 'invalid' | 'pruned' | null
export interface HypothesisDraftLoad { draft: HypothesisDraft | null; notice: HypothesisDraftNotice }

const storageKey = (incidentId: string) => `proofline:hypothesis-draft:v1:${encodeURIComponent(incidentId)}`
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 30 && value.every(isId)
const isText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit

function parseDraft(raw: string): HypothesisDraft {
  if (raw.length > 40_000) throw new Error('Oversized draft')
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || !isRecord(value.input)) throw new Error('Invalid draft')
  const input = value.input
  if (!isText(input.statement, 500) || !isText(input.rationale, 4000) || !isText(input.next_check, 1000)
    || typeof input.status !== 'string' || !['open', 'supported', 'ruled_out'].includes(input.status)
    || !isIds(input.supporting_evidence_ids) || !isIds(input.challenging_evidence_ids)) throw new Error('Invalid input')
  const editing = value.editing
  if (editing !== null && (!isRecord(editing) || !isId(editing.id) || typeof editing.revision !== 'number'
    || !Number.isSafeInteger(editing.revision) || editing.revision < 1)) throw new Error('Invalid edit target')
  return {
    input: {
      statement: input.statement, rationale: input.rationale, next_check: input.next_check,
      status: input.status as HypothesisInput['status'],
      supporting_evidence_ids: input.supporting_evidence_ids,
      challenging_evidence_ids: input.challenging_evidence_ids,
    },
    editing: editing === null ? null : { id: editing.id as string, revision: editing.revision as number },
  }
}

export function loadHypothesisDraft(incidentId: string, evidenceIds: Set<string>): HypothesisDraftLoad {
  let raw: string | null
  try { raw = window.sessionStorage.getItem(storageKey(incidentId)) } catch { return { draft: null, notice: 'unavailable' } }
  if (!raw) return { draft: null, notice: null }
  try {
    const draft = parseDraft(raw)
    const supporting = [...new Set(draft.input.supporting_evidence_ids)].filter((id) => evidenceIds.has(id))
    const challenging = [...new Set(draft.input.challenging_evidence_ids)].filter((id) => evidenceIds.has(id) && !supporting.includes(id))
    const pruned = supporting.length !== draft.input.supporting_evidence_ids.length || challenging.length !== draft.input.challenging_evidence_ids.length
    draft.input.supporting_evidence_ids = supporting
    draft.input.challenging_evidence_ids = challenging
    return { draft, notice: pruned ? 'pruned' : null }
  } catch {
    return { draft: null, notice: 'invalid' }
  }
}

export function saveHypothesisDraft(incidentId: string, draft: HypothesisDraft | null): boolean {
  try {
    if (draft) window.sessionStorage.setItem(storageKey(incidentId), JSON.stringify(draft))
    else window.sessionStorage.removeItem(storageKey(incidentId))
    return true
  } catch { return false }
}

// A save may complete after navigation. Clear only the submitted draft, never a
// newer edit created in this tab while that request was in flight.
export function clearSubmittedHypothesisDraft(incidentId: string, submitted: HypothesisDraft): boolean {
  try {
    const raw = window.sessionStorage.getItem(storageKey(incidentId))
    if (raw && JSON.stringify(parseDraft(raw)) === JSON.stringify(parseDraft(JSON.stringify(submitted)))) window.sessionStorage.removeItem(storageKey(incidentId))
    return true
  } catch { return false }
}
