export interface WorkspaceContext {
  incidentId: string
  runId: string | null
}

export interface WorkspaceContextLoad {
  context: WorkspaceContext | null
  notice: string | null
}

const storageKey = 'proofline:workspace-context:v1'
export const workspaceStorageNotice = 'Workspace context cannot be saved in this browser. Keep this tab open to retain your selection.'

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value)
}

export function loadWorkspaceContext(): WorkspaceContextLoad {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(storageKey)
  } catch {
    return { context: null, notice: workspaceStorageNotice }
  }
  if (!raw) return { context: null, notice: null }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid workspace context')
    const record = value as Record<string, unknown>
    if (!isIdentifier(record.incidentId) || (record.runId !== null && !isIdentifier(record.runId))) throw new Error('Invalid workspace identifiers')
    return { context: { incidentId: record.incidentId, runId: record.runId }, notice: null }
  } catch {
    return { context: null, notice: 'Previous workspace context could not be read. Your saved investigations remain available in Run history.' }
  }
}

export function saveWorkspaceContext(context: WorkspaceContext): boolean {
  try {
    // Persist only pointers; saved results are always fetched from the local API.
    window.sessionStorage.setItem(storageKey, JSON.stringify({ incidentId: context.incidentId, runId: context.runId }))
    return true
  } catch {
    return false
  }
}
