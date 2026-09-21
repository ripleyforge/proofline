import type {
  Config,
  Evaluation,
  GenerationMode,
  IncidentDetail,
  IncidentSummary,
  Investigation,
  InvestigationPage,
  InvestigationStatus,
  Note,
  RetrievalStrategy,
} from './types'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const error = (await response.json()) as { detail?: string | Array<{ msg?: string }> }
      if (typeof error.detail === 'string') detail = error.detail
      else if (Array.isArray(error.detail)) detail = error.detail.map((entry) => entry.msg).filter(Boolean).join(', ') || detail
    } catch {
      // Keep the status-based fallback when the response body is not JSON.
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}

export const api = {
  config: () => request<Config>('/config'),
  incidents: () => request<IncidentSummary[]>('/incidents'),
  incident: (id: string) => request<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`),
  investigationPage: (input: { limit: number; offset: number; q?: string; incidentId?: string; status?: InvestigationStatus; mode?: GenerationMode }) => {
    const params = new URLSearchParams({ limit: String(input.limit), offset: String(input.offset) })
    if (input.q) params.set('q', input.q)
    if (input.incidentId) params.set('incident_id', input.incidentId)
    if (input.status) params.set('status', input.status)
    if (input.mode) params.set('mode', input.mode)
    return request<InvestigationPage>(`/investigations/page?${params.toString()}`)
  },
  investigation: (id: string) => request<Investigation>(`/investigations/${encodeURIComponent(id)}`),
  createInvestigation: (body: { incident_id: string; question: string; strategy: RetrievalStrategy; mode: GenerationMode }) =>
    request<Investigation>('/investigations', { method: 'POST', body: JSON.stringify(body) }),
  notes: (incidentId: string) => request<Note[]>(`/incidents/${encodeURIComponent(incidentId)}/notes`),
  createNote: (incidentId: string, body: { body: string; evidence_ids: string[] }) =>
    request<Note>(`/incidents/${encodeURIComponent(incidentId)}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  evaluations: () => request<Evaluation[]>('/evaluations'),
  createEvaluation: (strategy: RetrievalStrategy) =>
    request<Evaluation>('/evaluations', { method: 'POST', body: JSON.stringify({ strategy }) }),
}

export async function downloadInvestigation(id: string, format: 'markdown' | 'json'): Promise<void> {
  await download(`/api/investigations/${encodeURIComponent(id)}/export?format=${format}`, `proofline-${id}.${format === 'markdown' ? 'md' : 'json'}`)
}

export async function downloadIncidentBrief(id: string, format: 'markdown' | 'json'): Promise<void> {
  await download(`/api/incidents/${encodeURIComponent(id)}/brief?format=${format}`, `proofline-${id}-handoff.${format === 'markdown' ? 'md' : 'json'}`)
}

async function download(path: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(path)
  if (!response.ok) {
    let detail = `Download failed with status ${response.status}`
    try {
      const error = (await response.json()) as { detail?: string }
      if (error.detail) detail = error.detail
    } catch {
      // Keep the status-based fallback when the response body is not JSON.
    }
    throw new ApiError(detail, response.status)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition')
  const nameMatch = disposition?.match(/filename="?([^";]+)"?/i)
  const filename = nameMatch?.[1] ?? fallbackFilename
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}
