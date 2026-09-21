export interface IncidentDraft {
  question: string
  noteBody: string
  noteOpen: boolean
  evidenceIds: string[]
}

export type IncidentDrafts = Record<string, IncidentDraft>

export interface DraftLoadResult {
  drafts: IncidentDrafts
  persistenceAvailable: boolean
}

const STORAGE_KEY = 'proofline:incident-drafts:v1'

export const emptyIncidentDraft: IncidentDraft = {
  question: '',
  noteBody: '',
  noteOpen: false,
  evidenceIds: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function loadIncidentDrafts(): DraftLoadResult {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return { drafts: {}, persistenceAvailable: false }
  }
  if (!raw) return { drafts: {}, persistenceAvailable: true }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) throw new Error('Invalid draft root')
    const drafts: IncidentDrafts = {}
    for (const [incidentId, value] of Object.entries(parsed)) {
      if (!incidentId || ['__proto__', 'constructor', 'prototype'].includes(incidentId) || !isRecord(value)) continue
      const evidenceIds = Array.isArray(value.evidenceIds)
        ? [...new Set(value.evidenceIds.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 500)
        : []
      drafts[incidentId] = {
        question: typeof value.question === 'string' ? value.question.slice(0, 10_000) : '',
        noteBody: typeof value.noteBody === 'string' ? value.noteBody.slice(0, 10_000) : '',
        noteOpen: value.noteOpen === true,
        evidenceIds,
      }
    }
    return { drafts, persistenceAvailable: true }
  } catch {
    try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* Storage can be unavailable. */ }
    return { drafts: {}, persistenceAvailable: true }
  }
}

export function saveIncidentDrafts(drafts: IncidentDrafts): boolean {
  try {
    const populated = Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.question || draft.noteBody || draft.noteOpen || draft.evidenceIds.length))
    if (Object.keys(populated).length) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(populated))
    else window.sessionStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    // Draft persistence is best effort when session storage is blocked or full.
    return false
  }
}
