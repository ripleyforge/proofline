import { AlertTriangle, Clock3, Database, Network, Radio, SearchCheck, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
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
  const [view, setView] = useState<AppView>(readView)
  const [config, setConfig] = useState<Config | null>(null)
  const [incidents, setIncidents] = useState<IncidentSummary[]>([])
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [incident, setIncident] = useState<IncidentDetail | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [history, setHistory] = useState<Investigation[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [currentRun, setCurrentRun] = useState<Investigation | null>(null)
  const [requestedEvidenceId, setRequestedEvidenceId] = useState<string | null>(null)
  const [noteEvidenceIds, setNoteEvidenceIds] = useState<string[]>([])
  const [bootLoading, setBootLoading] = useState(true)
  const [incidentLoading, setIncidentLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [evaluationLoading, setEvaluationLoading] = useState(false)
  const [investigationRunning, setInvestigationRunning] = useState(false)
  const [evaluationRunning, setEvaluationRunning] = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [incidentError, setIncidentError] = useState<string | null>(null)
  const [investigationError, setInvestigationError] = useState<string | null>(null)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const selectedIncidentRef = useRef<string | null>(null)
  const incidentRequestRef = useRef(0)
  const investigationRequestRef = useRef(0)
  const noteRequestRef = useRef(0)

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
    const onHashChange = () => setView(readView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const changeView = (next: AppView) => {
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

  const loadHistory = useCallback(async () => {
    if (!incidents.length) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const groups = await Promise.all(incidents.map((item) => api.investigations(item.id)))
      const loaded = groups.flat()
      const loadedIds = new Set(loaded.map((run) => run.id))
      setHistory((current) => [...loaded, ...current.filter((run) => !loadedIds.has(run.id))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (error) {
      setHistoryError(messageFrom(error))
    } finally {
      setHistoryLoading(false)
    }
  }, [incidents])

  useEffect(() => { void loadHistory() }, [loadHistory])

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
    setNoteEvidenceIds([])
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
      setHistory((current) => [result, ...current.filter((item) => item.id !== result.id)])
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
    setNoteEvidenceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const saveNote = async (body: string): Promise<boolean> => {
    const incidentId = selectedIncidentRef.current
    if (!incidentId) return false
    const requestId = ++noteRequestRef.current
    const evidenceIds = [...noteEvidenceIds]
    setNoteSaving(true)
    setNoteError(null)
    try {
      const note = await api.createNote(incidentId, { body, evidence_ids: evidenceIds })
      if (selectedIncidentRef.current !== incidentId || noteRequestRef.current !== requestId) return false
      setNotes((current) => [note, ...current])
      setNoteEvidenceIds([])
      return true
    } catch (error) {
      if (selectedIncidentRef.current === incidentId && noteRequestRef.current === requestId) setNoteError(messageFrom(error))
      return false
    } finally {
      if (selectedIncidentRef.current === incidentId && noteRequestRef.current === requestId) setNoteSaving(false)
    }
  }

  const reopenRun = (run: Investigation) => {
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
    setNoteEvidenceIds([])
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

  return (
    <Shell view={view} onViewChange={changeView}>
      {view === 'workspace' && (
        <div className="workspace-layout">
          <IncidentQueue incidents={incidents} activeId={selectedIncidentId} onSelect={selectIncident} />
          <div className="workspace-main">
            {incidentLoading ? <LoadingState label="Loading incident evidence" /> : incidentError ? <ErrorState message={incidentError} onRetry={selectedIncidentId ? () => void loadIncident(selectedIncidentId) : undefined} /> : incident ? (
              <>
                <IncidentHeader incident={incident} onInvestigate={focusInvestigation} />
                <div className="overview-grid"><MetricCharts metrics={incident.metrics} /><ServiceMap services={incident.services} /></div>
                <EvidenceCenter
                  evidence={incident.evidence}
                  requestedEvidenceId={requestedEvidenceId}
                  onRequestedEvidenceHandled={() => setRequestedEvidenceId(null)}
                  onReferenceToggle={toggleNoteEvidence}
                  referencedIds={noteEvidenceIds}
                />
                <NotesPanel
                  notes={notes}
                  evidence={incident.evidence}
                  selectedEvidenceIds={noteEvidenceIds}
                  maxChars={config.limits.note_chars}
                  isSaving={noteSaving}
                  error={noteError}
                  onToggleEvidence={toggleNoteEvidence}
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
            isRunning={investigationRunning}
            error={investigationError}
            onAsk={runInvestigation}
            onOpenEvidence={setRequestedEvidenceId}
          />}
        </div>
      )}
      {view === 'evaluations' && <EvaluationView evaluations={evaluations} isLoading={evaluationLoading} isRunning={evaluationRunning} error={evaluationError} onRun={runEvaluation} />}
      {view === 'history' && <HistoryView investigations={history} incidents={incidents} isLoading={historyLoading} error={historyError} onRetry={() => void loadHistory()} onReopen={reopenRun} />}
    </Shell>
  )
}

function IncidentHeader({ incident, onInvestigate }: { incident: IncidentDetail; onInvestigate: () => void }) {
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
      <button type="button" className="mobile-investigate-jump" onClick={onInvestigate}><SearchCheck size={16} aria-hidden="true" />Investigate this incident</button>
      {!!incident.evidence.some((item) => !item.trusted) && <div className="header-warning"><AlertTriangle size={15} aria-hidden="true" />Untrusted imported evidence is visible for inspection and excluded from answer context.</div>}
      {!!incident.tags.length && <div className="tag-list" aria-label="Incident tags">{incident.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
    </header>
  )
}
