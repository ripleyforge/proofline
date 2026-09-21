import { AlertTriangle, Braces, Clock3, Database, Download, FileText, LoaderCircle, Network, Radio, SearchCheck, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, downloadIncidentBrief } from './api'
import { EvidenceCenter } from './components/EvidenceCenter'
import { EvaluationView } from './components/EvaluationView'
import { HistoryView } from './components/HistoryView'
import { IncidentQueue } from './components/IncidentQueue'
import { InvestigationPanel } from './components/InvestigationPanel'
import { MetricCharts } from './components/MetricChart'
import { NotesPanel } from './components/NotesPanel'
import { ErrorState, IncidentStatusBadge, LoadingState, SeverityBadge } from './components/Primitives'
import { ServiceMap } from './components/ServiceMap'
import { Shell } from './components/Shell'
import { emptyIncidentDraft, loadIncidentDrafts, saveIncidentDrafts } from './drafts'
import type { DraftLoadResult, IncidentDraft, IncidentDrafts } from './drafts'
import { formatDateTime } from './format'
import type {
  AppView,
  Config,
  Evaluation,
  GenerationMode,
  IncidentDetail,
  IncidentSummary,
  Investigation,
  Note,
  RetrievalStrategy,
} from './types'

function readView(): AppView {
  const value = window.location.hash.replace('#/', '')
  return value === 'evaluations' || value === 'history' ? value : 'workspace'
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The request failed.'
}

export function App() {
  const initialDraftsRef = useRef<DraftLoadResult | null>(null)
  if (!initialDraftsRef.current) initialDraftsRef.current = loadIncidentDrafts()
  const [view, setView] = useState<AppView>(readView)
  const viewRef = useRef<AppView>(readView())
  const [config, setConfig] = useState<Config | null>(null)
  const [incidents, setIncidents] = useState<IncidentSummary[]>([])
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [incident, setIncident] = useState<IncidentDetail | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [currentRun, setCurrentRun] = useState<Investigation | null>(null)
  const [requestedEvidenceId, setRequestedEvidenceId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<IncidentDrafts>(() => initialDraftsRef.current?.drafts ?? {})
  const [draftPersistenceAvailable, setDraftPersistenceAvailable] = useState(() => initialDraftsRef.current?.persistenceAvailable ?? false)
  const [bootLoading, setBootLoading] = useState(true)
  const [incidentLoading, setIncidentLoading] = useState(false)
  const [evaluationLoading, setEvaluationLoading] = useState(false)
  const [investigationRunning, setInvestigationRunning] = useState(false)
  const [evaluationRunning, setEvaluationRunning] = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [incidentError, setIncidentError] = useState<string | null>(null)
  const [investigationError, setInvestigationError] = useState<string | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const selectedIncidentRef = useRef<string | null>(null)
  const incidentRequestRef = useRef(0)
  const investigationRequestRef = useRef(0)
  const noteRequestRef = useRef(0)
  const reopenRequestRef = useRef(0)

  const updateDraft = useCallback((incidentId: string, patch: Partial<IncidentDraft>) => {
    setDrafts((current) => ({
      ...current,
      [incidentId]: { ...(current[incidentId] ?? emptyIncidentDraft), ...patch },
    }))
  }, [])

  useEffect(() => {
    if (!saveIncidentDrafts(drafts)) setDraftPersistenceAvailable(false)
  }, [drafts])

  const loadInitial = useCallback(async () => {
    setBootLoading(true)
    setBootError(null)
    try {
      const [nextConfig, nextIncidents] = await Promise.all([api.config(), api.incidents()])
      setConfig(nextConfig)
      setIncidents(nextIncidents)
      setSelectedIncidentId((current) => {
        const next = current && nextIncidents.some((item) => item.id === current) ? current : nextIncidents[0]?.id ?? null
        selectedIncidentRef.current = next
        return next
      })
    } catch (error) {
      setBootError(messageFrom(error))
    } finally {
      setBootLoading(false)
    }
  }, [])

  useEffect(() => { void loadInitial() }, [loadInitial])

  useEffect(() => {
    const onHashChange = () => {
      const next = readView()
      viewRef.current = next
      if (next !== 'history') reopenRequestRef.current += 1
      setView(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const changeView = (next: AppView) => {
    viewRef.current = next
    if (next !== 'history') reopenRequestRef.current += 1
    window.location.hash = `/${next}`
    setView(next)
  }

  const loadIncident = useCallback(async (id: string) => {
    const requestId = ++incidentRequestRef.current
    setIncidentLoading(true)
    setIncidentError(null)
    try {
      const [detail, nextNotes] = await Promise.all([api.incident(id), api.notes(id)])
      if (selectedIncidentRef.current !== id || incidentRequestRef.current !== requestId) return
      setIncident(detail)
      setNotes(nextNotes)
    } catch (error) {
      if (selectedIncidentRef.current !== id || incidentRequestRef.current !== requestId) return
      setIncident(null)
      setNotes([])
      setIncidentError(messageFrom(error))
    } finally {
      if (selectedIncidentRef.current === id && incidentRequestRef.current === requestId) setIncidentLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedIncidentId) return
    void loadIncident(selectedIncidentId)
  }, [loadIncident, selectedIncidentId])

  useEffect(() => {
    if (!incident || !config) return
    const evidenceIds = new Set(incident.evidence.map((item) => item.id))
    setDrafts((current) => {
      const draft = current[incident.id]
      if (!draft) return current
      const next = {
        ...draft,
        question: draft.question.slice(0, config.limits.question_chars),
        noteBody: draft.noteBody.slice(0, config.limits.note_chars),
        evidenceIds: draft.evidenceIds.filter((id) => evidenceIds.has(id)),
      }
      if (
        next.question === draft.question
        && next.noteBody === draft.noteBody
        && next.evidenceIds.length === draft.evidenceIds.length
      ) return current
      return { ...current, [incident.id]: next }
    })
  }, [config, incident])

  const loadEvaluations = useCallback(async () => {
    setEvaluationLoading(true)
    try {
      setEvaluations(await api.evaluations())
    } catch (error) {
      setEvaluationError(messageFrom(error))
    } finally {
      setEvaluationLoading(false)
    }
  }, [])

  useEffect(() => { void loadEvaluations() }, [loadEvaluations])

  const selectIncident = (id: string) => {
    if (id === selectedIncidentId) return
    selectedIncidentRef.current = id
    incidentRequestRef.current += 1
    investigationRequestRef.current += 1
    noteRequestRef.current += 1
    setSelectedIncidentId(id)
    setIncident(null)
    setNotes([])
    setCurrentRun(null)
    setRequestedEvidenceId(null)
    setIncidentLoading(true)
    setInvestigationRunning(false)
    setInvestigationError(null)
    setNoteSaving(false)
    setNoteError(null)
  }

  const runInvestigation = async (input: { question: string; strategy: RetrievalStrategy; mode: GenerationMode }) => {
    const incidentId = selectedIncidentRef.current
    if (!incidentId) return
    const requestId = ++investigationRequestRef.current
    setInvestigationRunning(true)
    setInvestigationError(null)
    try {
      const result = await api.createInvestigation({ incident_id: incidentId, ...input })
      if (selectedIncidentRef.current === incidentId && investigationRequestRef.current === requestId) setCurrentRun(result)
    } catch (error) {
      if (selectedIncidentRef.current === incidentId && investigationRequestRef.current === requestId) setInvestigationError(messageFrom(error))
    } finally {
      if (selectedIncidentRef.current === incidentId && investigationRequestRef.current === requestId) setInvestigationRunning(false)
    }
  }

  const runEvaluation = async (strategy: RetrievalStrategy) => {
    setEvaluationRunning(true)
    setEvaluationError(null)
    try {
      const result = await api.createEvaluation(strategy)
      setEvaluations((current) => [result, ...current.filter((item) => item.id !== result.id)])
    } catch (error) {
      setEvaluationError(messageFrom(error))
    } finally {
      setEvaluationRunning(false)
    }
  }

  const toggleNoteEvidence = (id: string) => {
    const incidentId = selectedIncidentRef.current
    if (!incidentId) return
    setDrafts((current) => {
      const draft = current[incidentId] ?? emptyIncidentDraft
      return {
        ...current,
        [incidentId]: {
          ...draft,
          evidenceIds: draft.evidenceIds.includes(id)
            ? draft.evidenceIds.filter((item) => item !== id)
            : [...draft.evidenceIds, id],
          noteOpen: true,
        },
      }
    })
  }

  const saveNote = async (body: string): Promise<boolean> => {
    const incidentId = selectedIncidentRef.current
    if (!incidentId) return false
    const requestId = ++noteRequestRef.current
    const evidenceIds = [...(drafts[incidentId]?.evidenceIds ?? [])]
    const submittedBody = body.trim()
    setNoteSaving(true)
    setNoteError(null)
    try {
      const note = await api.createNote(incidentId, { body: submittedBody, evidence_ids: evidenceIds })
      setDrafts((current) => {
        const draft = current[incidentId]
        if (
          !draft
          || draft.noteBody.trim() !== submittedBody
          || draft.evidenceIds.length !== evidenceIds.length
          || draft.evidenceIds.some((evidenceId, index) => evidenceId !== evidenceIds[index])
        ) return current
        return { ...current, [incidentId]: { ...draft, noteBody: '', noteOpen: false, evidenceIds: [] } }
      })
      if (selectedIncidentRef.current === incidentId && noteRequestRef.current === requestId) {
        setNotes((current) => [note, ...current])
      }
      return true
    } catch (error) {
      if (selectedIncidentRef.current === incidentId && noteRequestRef.current === requestId) setNoteError(messageFrom(error))
      return false
    } finally {
      if (selectedIncidentRef.current === incidentId && noteRequestRef.current === requestId) setNoteSaving(false)
    }
  }

  const reopenRun = async (id: string): Promise<void> => {
    const requestId = ++reopenRequestRef.current
    const run = await api.investigation(id)
    if (reopenRequestRef.current !== requestId || viewRef.current !== 'history') return
    const sameSelection = selectedIncidentRef.current === run.incident_id
    const sameIncidentLoaded = incident?.id === run.incident_id
    selectedIncidentRef.current = run.incident_id
    incidentRequestRef.current += 1
    investigationRequestRef.current += 1
    noteRequestRef.current += 1
    setSelectedIncidentId(run.incident_id)
    if (!sameIncidentLoaded) {
      setIncident(null)
      setNotes([])
      setIncidentLoading(true)
      if (sameSelection) void loadIncident(run.incident_id)
    }
    setCurrentRun(run)
    setRequestedEvidenceId(null)
    setInvestigationRunning(false)
    setInvestigationError(null)
    setNoteSaving(false)
    setNoteError(null)
    changeView('workspace')
  }

  const focusInvestigation = () => {
    document.getElementById('investigation-question')?.focus()
  }

  if (bootLoading) return <div className="boot-screen"><div className="boot-brand">Proofline</div><LoadingState label="Connecting to the local workbench" /></div>
  if (bootError || !config) return <div className="boot-screen"><div className="boot-brand">Proofline</div><ErrorState title="Local API unavailable" message={bootError ?? 'Configuration was not returned.'} onRetry={() => void loadInitial()} /><p className="boot-help">Start the Proofline API on 127.0.0.1:8100, then retry. The interface does not substitute demo data.</p></div>
  const incidentDraft = incident ? drafts[incident.id] ?? emptyIncidentDraft : emptyIncidentDraft

  return (
    <Shell view={view} onViewChange={changeView}>
      {view === 'workspace' && (
        <div className="workspace-layout">
          <IncidentQueue incidents={incidents} activeId={selectedIncidentId} onSelect={selectIncident} />
          <div className="workspace-main">
            {!draftPersistenceAvailable && <div className="draft-storage-notice" role="status"><AlertTriangle size={16} aria-hidden="true" />Drafts cannot be saved in this browser. Keep this tab open.</div>}
            {incidentLoading ? <LoadingState label="Loading incident evidence" /> : incidentError ? <ErrorState message={incidentError} onRetry={selectedIncidentId ? () => void loadIncident(selectedIncidentId) : undefined} /> : incident ? (
              <>
                <IncidentHeader incident={incident} onInvestigate={focusInvestigation} />
                <div className="overview-grid"><MetricCharts metrics={incident.metrics} /><ServiceMap services={incident.services} /></div>
                <EvidenceCenter
                  evidence={incident.evidence}
                  requestedEvidenceId={requestedEvidenceId}
                  onRequestedEvidenceHandled={() => setRequestedEvidenceId(null)}
                  onReferenceToggle={toggleNoteEvidence}
                  referencedIds={incidentDraft.evidenceIds}
                />
                <NotesPanel
                  notes={notes}
                  evidence={incident.evidence}
                  selectedEvidenceIds={incidentDraft.evidenceIds}
                  body={incidentDraft.noteBody}
                  formOpen={incidentDraft.noteOpen}
                  maxChars={config.limits.note_chars}
                  isSaving={noteSaving}
                  error={noteError}
                  onToggleEvidence={toggleNoteEvidence}
                  onBodyChange={(body) => updateDraft(incident.id, { noteBody: body })}
                  onFormOpenChange={(open) => updateDraft(incident.id, { noteOpen: open })}
                  onSave={saveNote}
                  onOpenEvidence={setRequestedEvidenceId}
                />
              </>
            ) : <ErrorState title="No incidents available" message="The API returned no incident to investigate." />}
          </div>
          {incident && <InvestigationPanel
            incidentTitle={incident.title}
            suggestedQuestions={incident.suggested_questions}
            config={config}
            currentRun={currentRun?.incident_id === incident.id ? currentRun : null}
            question={incidentDraft.question}
            isRunning={investigationRunning}
            error={investigationError}
            onQuestionChange={(question) => updateDraft(incident.id, { question })}
            onAsk={runInvestigation}
            onOpenEvidence={setRequestedEvidenceId}
          />}
        </div>
      )}
      {view === 'evaluations' && <EvaluationView evaluations={evaluations} isLoading={evaluationLoading} isRunning={evaluationRunning} error={evaluationError} onRun={runEvaluation} />}
      {view === 'history' && <HistoryView incidents={incidents} onReopen={reopenRun} />}
    </Shell>
  )
}

function IncidentHeader({ incident, onInvestigate }: { incident: IncidentDetail; onInvestigate: () => void }) {
  const [pendingFormat, setPendingFormat] = useState<'markdown' | 'json' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportRequestRef = useRef(0)

  useEffect(() => {
    exportRequestRef.current += 1
    setPendingFormat(null)
    setExportError(null)
  }, [incident.id])

  const downloadHandoff = async (format: 'markdown' | 'json') => {
    const requestId = ++exportRequestRef.current
    setPendingFormat(format)
    setExportError(null)
    try {
      await downloadIncidentBrief(incident.id, format)
    } catch (error) {
      if (exportRequestRef.current === requestId) setExportError(messageFrom(error))
    } finally {
      if (exportRequestRef.current === requestId) setPendingFormat(null)
    }
  }

  return (
    <header className="incident-header">
      <div className="incident-header-top">
        <div className="incident-identifiers"><SeverityBadge severity={incident.severity} /><IncidentStatusBadge status={incident.status} /><span>{incident.id}</span></div>
        <time dateTime={incident.start_time}><Clock3 size={14} />Started {formatDateTime(incident.start_time)}</time>
      </div>
      <h1>{incident.title}</h1>
      <p>{incident.summary}</p>
      <div className="incident-facts">
        <div><Database size={17} aria-hidden="true" /><span>Evidence</span><strong>{incident.evidence_count}</strong></div>
        <div><Network size={17} aria-hidden="true" /><span>Services</span><strong>{incident.services.length}</strong></div>
        <div><Radio size={17} aria-hidden="true" /><span>Signals</span><strong>{incident.metrics.length}</strong></div>
        <div><ShieldCheck size={17} aria-hidden="true" /><span>Trusted</span><strong>{incident.evidence.filter((item) => item.trusted).length}</strong></div>
      </div>
      <div className="handoff-export">
        <span><Download size={15} aria-hidden="true" />Incident handoff</span>
        <button type="button" aria-label="Download handoff as Markdown" disabled={pendingFormat !== null} onClick={() => void downloadHandoff('markdown')}>{pendingFormat === 'markdown' ? <LoaderCircle className="spin" size={15} /> : <FileText size={15} />}Markdown</button>
        <button type="button" aria-label="Download handoff as JSON" disabled={pendingFormat !== null} onClick={() => void downloadHandoff('json')}>{pendingFormat === 'json' ? <LoaderCircle className="spin" size={15} /> : <Braces size={15} />}JSON</button>
      </div>
      {exportError && <div className="handoff-export-error" role="alert"><span>{exportError}</span><button type="button" onClick={() => setExportError(null)}>Dismiss</button></div>}
      <button type="button" className="mobile-investigate-jump" onClick={onInvestigate}><SearchCheck size={16} aria-hidden="true" />Investigate this incident</button>
      {!!incident.evidence.some((item) => !item.trusted) && <div className="header-warning"><AlertTriangle size={15} aria-hidden="true" />Untrusted imported evidence is visible for inspection and excluded from answer context.</div>}
      {!!incident.tags.length && <div className="tag-list" aria-label="Incident tags">{incident.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
    </header>
  )
}
