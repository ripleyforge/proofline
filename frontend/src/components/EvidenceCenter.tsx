import { BookOpen, Columns2, Filter, Search, ShieldAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime, formatTime } from '../format'
import type { Evidence, EvidenceKind } from '../types'
import { EmptyState, KindBadge, SectionHeading } from './Primitives'
import { EvidenceComparison } from './EvidenceComparison'

const kinds: EvidenceKind[] = ['metric', 'log', 'change', 'runbook', 'note']

interface EvidenceCenterProps {
  evidence: Evidence[]
  requestedEvidenceId: string | null
  onRequestedEvidenceHandled: () => void
  onReferenceToggle: (id: string) => void
  referencedIds: string[]
}

export function EvidenceCenter({ evidence, requestedEvidenceId, onRequestedEvidenceHandled, onReferenceToggle, referencedIds }: EvidenceCenterProps) {
  const [activeKinds, setActiveKinds] = useState<Set<EvidenceKind>>(new Set(kinds))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Evidence | null>(null)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const comparisonSources = comparisonIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is Evidence => !!item)
  const closeComparison = useCallback(() => setComparing(false), [])

  const closeDrawer = useCallback(() => {
    setSelected(null)
    // Restore synchronously so a delayed callback cannot steal focus from
    // the next source or comparison the investigator opens.
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!requestedEvidenceId) return
    const match = evidence.find((item) => item.id === requestedEvidenceId)
    if (match) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSelected(match)
    }
    onRequestedEvidenceHandled()
  }, [requestedEvidenceId, evidence, onRequestedEvidenceHandled])

  useEffect(() => {
    if (!selected) return
    drawerCloseRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeDrawer, selected])

  const openEvidence = (item: Evidence, trigger: HTMLElement) => {
    triggerRef.current = trigger
    setSelected(item)
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [...evidence]
      .filter((item) => activeKinds.has(item.kind))
      .filter((item) => !needle || `${item.title} ${item.body} ${item.service}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [activeKinds, evidence, query])

  const toggleKind = (kind: EvidenceKind) => {
    setActiveKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return (
    <section className="panel evidence-center">
      <SectionHeading
        title="Evidence timeline"
        description="Source material stays visible, ordered, and scoped to this incident."
        action={<span className="source-count">{filtered.length} of {evidence.length} sources</span>}
      />
      <div className="evidence-tools">
        <label className="search-field">
          <span className="sr-only">Search evidence</span>
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search evidence" />
          {query && <button type="button" aria-label="Clear evidence search" onClick={() => setQuery('')}><X size={14} /></button>}
        </label>
        <div className="kind-filters" aria-label="Filter evidence kinds"><Filter size={15} aria-hidden="true" />
          {kinds.map((kind) => <button key={kind} type="button" className={activeKinds.has(kind) ? 'is-active' : ''} aria-pressed={activeKinds.has(kind)} onClick={() => toggleKind(kind)}>{kind}</button>)}
        </div>
      </div>
      <div className="comparison-tray" aria-label="Evidence comparison selection">
        <span><Columns2 size={15} aria-hidden="true" />Compare up to two sources</span>
        {comparisonSources.length ? <div className="comparison-selected">{comparisonSources.map((source) => <span key={source.id}>{source.title}<button type="button" className="icon-button" aria-label={`Remove ${source.title} from comparison`} onClick={() => setComparisonIds((ids) => ids.filter((id) => id !== source.id))}><X size={13} /></button></span>)}</div> : <small>Open a source to add it.</small>}
        <button type="button" className="secondary-button" disabled={comparisonSources.length !== 2} onClick={() => setComparing(true)}>Compare selected ({comparisonSources.length}/2)</button>
      </div>
      {filtered.length ? (
        <ol className="timeline-list">
          {filtered.map((item) => (
            <li key={item.id} className={item.trusted ? '' : 'is-untrusted'}>
              <time dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
              <span className="timeline-line" aria-hidden="true"><span /></span>
              <button type="button" className="evidence-row" onClick={(event) => openEvidence(item, event.currentTarget)}>
                <span className="evidence-row-head"><KindBadge kind={item.kind} /><span>{item.service}</span>{!item.trusted && <span className="untrusted-label"><ShieldAlert size={13} />untrusted</span>}</span>
                <strong>{item.title}</strong>
                <span className="evidence-preview">{item.body}</span>
                <span className="evidence-row-foot"><BookOpen size={14} aria-hidden="true" />Inspect source</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <EmptyState title="No matching evidence" message="Change the search or enable another evidence kind." />}

      {selected && (
        <div className="drawer-layer" role="presentation">
          <button className="drawer-scrim" type="button" tabIndex={-1} aria-label="Close evidence drawer" onClick={closeDrawer} />
          <aside ref={drawerRef} className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-drawer-title">
            <div className="drawer-head">
              <div><KindBadge kind={selected.kind} /><span>{selected.id}</span></div>
              <button ref={drawerCloseRef} className="icon-button" type="button" aria-label="Close evidence drawer" onClick={closeDrawer}><X aria-hidden="true" /></button>
            </div>
            <div className="drawer-body">
              <h2 id="evidence-drawer-title">{selected.title}</h2>
              <dl className="source-metadata">
                <div><dt>Observed</dt><dd>{formatDateTime(selected.timestamp)}</dd></div>
                <div><dt>Service</dt><dd>{selected.service}</dd></div>
                <div><dt>Trust policy</dt><dd>{selected.trusted ? 'Eligible for answer context' : 'Excluded from answer context'}</dd></div>
              </dl>
              {!selected.trusted && <div className="warning-callout"><ShieldAlert size={18} aria-hidden="true" /><p>This imported content is marked untrusted. You can inspect and reference it in a note, but Proofline excludes it from generated answer context.</p></div>}
              <div className="evidence-body"><pre>{selected.body}</pre></div>
            </div>
            <div className="drawer-actions">
              <button className="secondary-button" type="button" disabled={!comparisonIds.includes(selected.id) && comparisonIds.length >= 2} onClick={() => setComparisonIds((ids) => ids.includes(selected.id) ? ids.filter((id) => id !== selected.id) : [...ids, selected.id])}>
                {comparisonIds.includes(selected.id) ? 'Remove from comparison' : comparisonIds.length >= 2 ? 'Comparison full (2 sources)' : 'Add to comparison'}
              </button>
              <button className={referencedIds.includes(selected.id) ? 'secondary-button is-selected' : 'secondary-button'} type="button" onClick={() => onReferenceToggle(selected.id)}>
                {referencedIds.includes(selected.id) ? 'Remove note reference' : 'Reference in note'}
              </button>
            </div>
          </aside>
        </div>
      )}
      {comparing && <EvidenceComparison evidence={comparisonSources} onClose={closeComparison} />}
    </section>
  )
}
