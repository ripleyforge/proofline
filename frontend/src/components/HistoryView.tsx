import { ArrowUpRight, CheckCircle2, Clock3, History, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateTime, formatDuration, truncate } from '../format'
import type { IncidentSummary, Investigation } from '../types'
import { EmptyState, SectionHeading } from './Primitives'

interface HistoryViewProps {
  investigations: Investigation[]
  incidents: IncidentSummary[]
  isLoading: boolean
  onReopen: (run: Investigation) => void
}

export function HistoryView({ investigations, incidents, isLoading, onReopen }: HistoryViewProps) {
  const [incidentFilter, setIncidentFilter] = useState('all')
  const filtered = useMemo(() => incidentFilter === 'all' ? investigations : investigations.filter((run) => run.incident_id === incidentFilter), [incidentFilter, investigations])
  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]))

  return (
    <div className="page-view history-view">
      <header className="page-header">
        <div><span className="page-kicker"><History size={15} />Persisted investigations</span><h1>Run history</h1><p>Reopen an investigation with its exact question, answer mode, citations, warnings, and trace.</p></div>
        <label className="compact-select">Incident<span className="sr-only">Filter run history by incident</span><select value={incidentFilter} onChange={(event) => setIncidentFilter(event.target.value)}><option value="all">All incidents</option>{incidents.map((incident) => <option key={incident.id} value={incident.id}>{incident.title}</option>)}</select></label>
      </header>
      <section className="panel history-panel">
        <SectionHeading title="Saved runs" description={isLoading ? 'Loading persisted runs…' : `${filtered.length} ${filtered.length === 1 ? 'run' : 'runs'} shown`} />
        {filtered.length ? (
          <div className="history-list">
            {filtered.map((run) => (
              <article key={run.id} className="history-item">
                <div className="history-item-main">
                  <div className="history-item-meta">
                    <span className={`result-status ${run.status}`}>{run.status === 'answered' ? <CheckCircle2 size={13} /> : <SearchX size={13} />}{run.status}</span>
                    <span>{run.mode === 'extractive' ? 'Evidence extracts' : 'Local model'}</span>
                    <span>{run.strategy === 'focused' ? 'Focused' : 'BM25'}</span>
                  </div>
                  <h2>{run.question}</h2>
                  <p>{truncate(run.answer || 'No supported answer.', 220)}</p>
                  <div className="history-item-foot"><span>{incidentById.get(run.incident_id)?.title ?? run.incident_id}</span><time dateTime={run.created_at}>{formatDateTime(run.created_at)}</time><span><Clock3 size={13} />{formatDuration(run.duration_ms)}</span></div>
                </div>
                <button type="button" className="secondary-button" onClick={() => onReopen(run)}>Reopen <ArrowUpRight size={15} /></button>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No saved investigations" message={incidentFilter === 'all' ? 'Run an investigation from the workspace to create the first persisted result.' : 'This incident has no persisted investigations yet.'} />}
      </section>
    </div>
  )
}
