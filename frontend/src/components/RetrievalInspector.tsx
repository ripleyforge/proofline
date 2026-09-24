import { ChevronDown, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Evidence, RetrievalCandidate, RetrievalInspection } from '../types'

const percent = (value: number) => `${Math.round(value * 100)}%`
const score = (value: number) => value.toFixed(3)
const exclusionLabels: Record<NonNullable<RetrievalCandidate['exclusion_reason']>, string> = {
  untrusted: 'Untrusted source: excluded from retrieval',
  empty_query: 'No searchable query terms',
  below_coverage: 'Incident coverage gate not met',
  no_overlap: 'No matching query terms',
}

// Keyed by the current question and incident, so a late reply cannot describe a new question.
export function RetrievalInspector({ incidentId, question, evidence, onOpenEvidence }: {
  incidentId: string; question: string; evidence: Evidence[]; onOpenEvidence: (id: string) => void
}) {
  const [result, setResult] = useState<RetrievalInspection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  useEffect(() => () => { requestRef.current += 1 }, [])

  const inspect = async () => {
    if (!question.trim() || loading) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const inspection = await api.inspectRetrieval(incidentId, question.trim())
      if (requestRef.current === requestId) setResult(inspection)
    } catch (cause) {
      if (requestRef.current === requestId) setError(cause instanceof Error ? cause.message : 'Retrieval inspection failed.')
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }

  return <details className="retrieval-inspector">
    <summary>Inspect retrieval <ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="retrieval-inspector-body">
      <p>Compare BM25 and focused ranking for the current question. This reads evidence without saving a run or calling a model.</p>
      <button type="button" className="secondary-button" disabled={!question.trim() || loading} onClick={() => void inspect()}>{loading ? <><LoaderCircle className="spin" size={15} />Inspecting</> : result ? 'Refresh retrieval comparison' : 'Compare retrieval strategies'}</button>
      {!question.trim() && <p className="field-help">Enter a question above to inspect its sources.</p>}
      {error && <p className="form-error" role="alert">{error} Try the comparison again.</p>}
      {result && <div className="retrieval-inspection-result" aria-live="polite">
        <p className="retrieval-gate"><strong>{result.admitted ? 'Retrieval admitted' : 'Retrieval excluded'}</strong> · Best source coverage {percent(result.max_coverage)}</p>
        <p>The incident-wide gate requires {percent(result.coverage_threshold)} coverage from at least one trusted source. Individual returned sources may cover less. Only the top {result.limit} ranks enter answer context.</p>
        <p className="retrieval-score-note">Scores measure relevance, not truth or confidence.</p>
        <dl className="retrieval-query"><dt>Query terms</dt><dd>{result.query_tokens.join(', ') || 'None after tokenization'}</dd></dl>
        <div className="retrieval-candidates">{result.candidates.map((candidate) => {
          const source = evidence.find((item) => item.id === candidate.evidence_id)
          return <article className="retrieval-candidate" key={candidate.evidence_id}>
            <button type="button" className="source-link" onClick={() => onOpenEvidence(candidate.evidence_id)}>{source?.title ?? candidate.evidence_id}</button>
            <small>{candidate.evidence_id}{!candidate.trusted && <span className="untrusted-label"> · Untrusted</span>}</small>
            <div className="retrieval-ranks"><Rank label="BM25" value={candidate.bm25_rank} limit={result.limit} /><Rank label="Focused" value={candidate.focused_rank} limit={result.limit} /></div>
            {candidate.exclusion_reason && <p className="retrieval-exclusion">{exclusionLabels[candidate.exclusion_reason]}</p>}
            <details className="retrieval-candidate-details"><summary>Scores and matched terms</summary><dl>
              <div><dt>BM25 score</dt><dd>{score(candidate.bm25_score)}</dd></div>
              <div><dt>Context boost</dt><dd>{score(candidate.context_boost)}</dd></div>
              <div><dt>Evidence-kind boost</dt><dd>{score(candidate.kind_boost)}</dd></div>
              <div><dt>Focused score</dt><dd>{score(candidate.focused_score)}</dd></div>
              <div><dt>Source coverage</dt><dd>{percent(candidate.coverage)}</dd></div>
              <div><dt>Matched terms</dt><dd>{candidate.matched_terms.join(', ') || 'None'}</dd></div>
            </dl></details>
          </article>
        })}</div>
      </div>}
    </div>
  </details>
}

function Rank({ label, value, limit }: { label: string; value: number | null; limit: number }) {
  return <div><span>{label}</span><strong>{value === null ? 'Excluded' : `#${value}`}</strong>{value !== null && <small>{value <= limit ? 'In context' : 'Outside context'}</small>}</div>
}
