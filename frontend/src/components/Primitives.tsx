import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EvidenceKind, IncidentStatus, ServiceStatus, Severity } from '../types'

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="state-box" role="status"><LoaderCircle className="spin" aria-hidden="true" /><p>{label}</p></div>
}

export function ErrorState({ title = 'Could not load data', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div><h2>{title}</h2><p>{message}</p></div>
      {onRetry && <button type="button" className="secondary-button" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />Retry</button>}
    </div>
  )
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="state-box"><Inbox aria-hidden="true" /><div><h2>{title}</h2><p>{message}</p></div>{action}</div>
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity ${severity.toLowerCase()}`}>{severity}</span>
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`badge incident-status ${status}`}><span aria-hidden="true" />{status}</span>
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return <span className={`badge service-status ${status}`}>{status}</span>
}

export function KindBadge({ kind }: { kind: EvidenceKind }) {
  return <span className={`kind-badge kind-${kind}`}>{kind}</span>
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {action}
    </div>
  )
}
