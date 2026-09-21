import { ChevronRight } from 'lucide-react'
import { formatDateTime, truncate } from '../format'
import type { IncidentSummary } from '../types'
import { IncidentStatusBadge, SeverityBadge } from './Primitives'

interface IncidentQueueProps {
  incidents: IncidentSummary[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function IncidentQueue({ incidents, activeId, onSelect }: IncidentQueueProps) {
  return (
    <aside className="incident-queue" aria-label="Incident queue">
      <div className="queue-heading">
        <div>
          <h2>Incident queue</h2>
          <p>{incidents.length} synthetic {incidents.length === 1 ? 'case' : 'cases'}</p>
        </div>
      </div>
      <div className="queue-list">
        {incidents.map((incident) => (
          <button
            key={incident.id}
            type="button"
            className={incident.id === activeId ? 'incident-card is-active' : 'incident-card'}
            onClick={() => onSelect(incident.id)}
            aria-pressed={incident.id === activeId}
          >
            <span className="incident-card-top">
              <SeverityBadge severity={incident.severity} />
              <span className="incident-time">{formatDateTime(incident.start_time)}</span>
            </span>
            <strong>{incident.title}</strong>
            <span className="incident-summary">{truncate(incident.summary, 110)}</span>
            <span className="incident-card-foot">
              <IncidentStatusBadge status={incident.status} />
              <span>{incident.evidence_count} sources</span>
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}
