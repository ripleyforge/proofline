import { api, ApiError } from './api'
import { finishSubmittedHypothesisDraft } from './hypothesisDrafts'
import type { HypothesisDraft } from './hypothesisDrafts'
import type { Hypothesis } from './types'

type SaveState =
  | { status: 'pending'; submitted: HypothesisDraft }
  | { status: 'succeeded'; submitted: HypothesisDraft; saved: Hypothesis; storageAvailable: boolean }
  | { status: 'failed'; submitted: HypothesisDraft; message: string; conflict: boolean }

// One write per incident survives panel unmounts within this page. Completed
// outcomes remain available until a mounted panel acknowledges them.
const saves = new Map<string, SaveState>()
const listeners = new Map<string, Set<() => void>>()
export const getHypothesisSave = (incidentId: string): SaveState | null => saves.get(incidentId) ?? null

export function subscribeHypothesisSave(incidentId: string, listener: () => void): () => void {
  const group = listeners.get(incidentId) ?? new Set()
  group.add(listener)
  listeners.set(incidentId, group)
  return () => {
    group.delete(listener)
    if (!group.size) listeners.delete(incidentId)
  }
}

function publish(incidentId: string, state: SaveState | null) {
  if (state) saves.set(incidentId, state)
  else saves.delete(incidentId)
  listeners.get(incidentId)?.forEach((listener) => listener())
}

export function acknowledgeHypothesisSave(incidentId: string, state: SaveState) {
  if (state.status !== 'pending' && saves.get(incidentId) === state) publish(incidentId, null)
}

export function startHypothesisSave(incidentId: string, draft: HypothesisDraft): void {
  if (saves.get(incidentId)?.status === 'pending') return
  const submitted = structuredClone(draft)
  publish(incidentId, { status: 'pending', submitted })
  const input = { ...submitted.input, statement: submitted.input.statement.trim() }
  const response = submitted.editing
    ? api.updateHypothesis(incidentId, submitted.editing.id, { ...input, expected_revision: submitted.editing.revision })
    : api.createHypothesis(incidentId, input)
  void response.then((saved) => {
    const storageAvailable = finishSubmittedHypothesisDraft(incidentId, submitted, saved)
    publish(incidentId, { status: 'succeeded', submitted, saved, storageAvailable })
  }, (cause: unknown) => {
    publish(incidentId, { status: 'failed', submitted, conflict: cause instanceof ApiError && cause.status === 409,
      message: cause instanceof Error ? cause.message : 'The hypothesis could not be saved.' })
  })
}
