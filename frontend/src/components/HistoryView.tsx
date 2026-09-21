import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, History, LoaderCircle, Search, SearchX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { formatDateTime, formatDuration, truncate } from '../format'
import type { IncidentSummary, InvestigationPage, InvestigationStatus } from '../types'
import { EmptyState, ErrorState, LoadingState, SectionHeading } from './Primitives'

const pageSize = 20

interface HistoryViewProps {
  incidents: IncidentSummary[]
  onReopen: (id: string) => Promise<void>
}

export function HistoryView({ incidents, onReopen }: HistoryViewProps) {
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [incidentFilter, setIncidentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | InvestigationStatus>('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<InvestigationPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [reopenError, setReopenError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]))

  const loadPage = useCallback(async () => {
    const requestId = ++requestRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await api.investigationPage({
        limit: pageSize,
        offset,
        q: query || undefined,
        incidentId: incidentFilter || undefined,
        status: statusFilter || undefined,
      })
      if (requestRef.current !== requestId) return
      setPage(result)
    } catch (cause) {
      if (requestRef.current !== requestId) return
      setError(cause instanceof Error ? cause.message : 'Run history could not be loaded.')
    } finally {
      if (requestRef.current === requestId) setIsLoading(false)
    }
  }, [incidentFilter, offset, query, statusFilter])

  useEffect(() => {
    void loadPage()
    return () => { requestRef.current += 1 }
  }, [loadPage])

  const search = (event: React.FormEvent) => {
    event.preventDefault()
    setOffset(0)
    setQuery(queryDraft.trim())
  }

  const clearSearch = () => {
    setQueryDraft('')
    setQuery('')
    setOffset(0)
  }

  const reopen = async (id: string) => {
    setOpeningId(id)
    setReopenError(null)
    try {
      await onReopen(id)
    } catch (cause) {
      setReopenError(cause instanceof Error ? cause.message : 'The saved run could not be reopened.')
      setOpeningId(null)
    }
  }

  const items = page?.items ?? []
  const hasFilters = Boolean(query || incidentFilter || statusFilter)
  const rangeStart = page && page.total ? page.offset + 1 : 0
  const rangeEnd = page ? Math.min(page.offset + page.items.length, page.total) : 0

  return (
    <div className="page-view history-view">
      <header className="page-header history-page-header">
        <div><h1>Run history</h1><p>Search saved questions, inspect their recorded outcome, and reopen one complete run on demand.</p></div>
      </header>

      <form className="history-filters" onSubmit={search}>
        <label className="history-search">
          <span>Search questions</span>
          <span className="history-search-input"><Search size={16} aria-hidden="true" /><input value={queryDraft} maxLength={200} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Literal question text" />{queryDraft && <button type="button" aria-label="Clear question search" onClick={clearSearch}><X size={14} /></button>}</span>
        </label>
        <label>Incident<select aria-label="Incident filter" value={incidentFilter} onChange={(event) => { setIncidentFilter(event.target.value); setOffset(0) }}><option value="">All incidents</option>{incidents.map((incident) => <option key={incident.id} value={incident.id}>{incident.title}</option>)}</select></label>
        <label>Status<select aria-label="Status filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as '' | InvestigationStatus); setOffset(0) }}><option value="">All statuses</option><option value="answered">Answered</option><option value="abstained">Abstained</option></select></label>
        <button type="submit" className="primary-button">Search</button>
      </form>

      <section className="panel history-panel" aria-busy={isLoading}>
        <SectionHeading title="Saved runs" description={page ? `Showing ${rangeStart}–${rangeEnd} of ${page.total}` : 'Newest investigations first'} action={isLoading && page ? <span className="loading-inline"><LoaderCircle className="spin" size={14} />Updating</span> : undefined} />
        {reopenError && <div className="inline-load-error" role="alert"><span>{reopenError}</span><button type="button" className="secondary-button" onClick={() => setReopenError(null)}>Dismiss</button></div>}
        {error && page && <div className="inline-load-error" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => void loadPage()}>Retry</button></div>}
        {isLoading && !page ? <LoadingState label="Loading saved investigations" /> : error && !page ? (
          <ErrorState title="Could not load run history" message={error} onRetry={() => void loadPage()} />
        ) : items.length ? (
          <div className={isLoading ? 'history-list is-updating' : 'history-list'}>
            {items.map((run) => (
              <article key={run.id} className="history-item">
                <div className="history-item-main">
                  <div className="history-item-meta">
                    <span className={`result-status ${run.status}`}>{run.status === 'answered' ? <CheckCircle2 size={13} /> : <SearchX size={13} />}{run.status}</span>
                    <span>{run.mode === 'extractive' ? 'Evidence extracts' : 'Local model'}</span>
                    <span>{run.strategy === 'focused' ? 'Focused' : 'BM25'}</span>
                  </div>
                  <h2>{run.question}</h2>
                  <p>{truncate(run.answer_preview || 'No supported answer.', 210)}</p>
                  <div className="history-item-foot"><span>{incidentById.get(run.incident_id)?.title ?? run.incident_id}</span><time dateTime={run.created_at}>{formatDateTime(run.created_at)}</time><span><Clock3 size={13} />{formatDuration(run.duration_ms)}</span></div>
                </div>
                <button type="button" className="secondary-button" disabled={openingId !== null} onClick={() => void reopen(run.id)}>{openingId === run.id ? <><LoaderCircle className="spin" size={15} />Opening</> : <>Reopen <ArrowUpRight size={15} /></>}</button>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No saved investigations" message={hasFilters ? 'No saved question matches these filters. Change or clear a filter.' : 'Run an investigation from the workspace to create the first saved result.'} />}
        {page && page.total > pageSize && (
          <nav className="pagination" aria-label="Run history pages">
            <button type="button" className="secondary-button" aria-label="Previous page" disabled={isLoading || page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}><ChevronLeft size={15} />Previous</button>
            <span>Page {Math.floor(page.offset / page.limit) + 1} of {Math.ceil(page.total / page.limit)}</span>
            <button type="button" className="secondary-button" aria-label="Next page" disabled={isLoading || page.offset + page.items.length >= page.total} onClick={() => setOffset(page.offset + page.limit)}>Next<ChevronRight size={15} /></button>
          </nav>
        )}
      </section>
      <aside className="history-boundary"><History size={17} aria-hidden="true" /><p>Search finds literal text within saved questions. Reopening retrieves the saved sources, trace, warnings, and answer.</p></aside>
    </div>
  )
}
