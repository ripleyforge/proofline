import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatDateTime } from '../format'
import type { Evidence } from '../types'
import { KindBadge } from './Primitives'

export function EvidenceComparison({ evidence, onClose }: { evidence: Evidence[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? [])]
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); trigger?.focus() }
  }, [onClose])

  return <div className="drawer-layer comparison-layer" role="presentation">
    <button type="button" className="drawer-scrim" tabIndex={-1} aria-label="Close evidence comparison" onClick={onClose} />
    <section ref={dialogRef} className="evidence-comparison" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
      <header className="comparison-heading"><div><h2 id="comparison-title">Evidence comparison</h2><p>Read two sources together. Assess agreement and disagreement yourself.</p></div><button ref={closeRef} type="button" className="icon-button" aria-label="Close evidence comparison" onClick={onClose}><X aria-hidden="true" /></button></header>
      <div className="comparison-columns">{evidence.map((source) => <article key={source.id} className="comparison-source" tabIndex={0} aria-label={`Comparison source: ${source.title}`}>
        <div className="comparison-source-kind"><KindBadge kind={source.kind} /><span>{source.id}</span></div>
        <h3>{source.title}</h3>
        <dl className="source-metadata"><div><dt>Observed</dt><dd><time dateTime={source.timestamp}>{formatDateTime(source.timestamp)}</time></dd></div><div><dt>Service</dt><dd>{source.service}</dd></div><div><dt>Trust policy</dt><dd>{source.trusted ? 'Eligible for answer context' : 'Untrusted · excluded from answer context'}</dd></div></dl>
        {!source.trusted && <p className="comparison-trust-warning">Untrusted imported content. This comparison does not change its trust status.</p>}
        <div className="evidence-body"><pre>{source.body}</pre></div>
      </article>)}</div>
    </section>
  </div>
}
