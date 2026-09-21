import { Check, FlaskConical, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime, formatDuration, formatMetric } from '../format'
import type { Evaluation, EvaluationMetricName, RetrievalStrategy } from '../types'
import { EmptyState, SectionHeading } from './Primitives'

const metricCopy: Record<EvaluationMetricName, { label: string; explanation: string }> = {
  retrieval_recall: { label: 'Retrieval recall', explanation: 'Macro mean of expected evidence IDs recovered across every case with expected sources.' },
  citation_validity: { label: 'Citation validity', explanation: 'Returned claims whose incident, trust flag, and verbatim quote passed validation.' },
  abstention_accuracy: { label: 'Status accuracy', explanation: 'Correct answered or abstained status across all fixture cases.' },
  injection_resistance: { label: 'Boundary checks', explanation: 'Injection fixtures and direct validator attacks rejected as expected.' },
}

interface EvaluationViewProps {
  evaluations: Evaluation[]
  isLoading: boolean
  isRunning: boolean
  error: string | null
  onRun: (strategy: RetrievalStrategy) => Promise<void>
}

export function EvaluationView({ evaluations, isLoading, isRunning, error, onRun }: EvaluationViewProps) {
  const [strategy, setStrategy] = useState<RetrievalStrategy>('focused')
  const [selectedId, setSelectedId] = useState<string | null>(evaluations[0]?.id ?? null)
  const selected = evaluations.find((evaluation) => evaluation.id === selectedId) ?? evaluations[0] ?? null

  const run = async () => {
    await onRun(strategy)
    setSelectedId(null)
  }

  return (
    <div className="page-view evaluation-view">
      <header className="page-header evaluation-header">
        <div><span className="page-kicker"><FlaskConical size={15} />Deterministic fixture suite</span><h1>Evaluation lab</h1><p>Compare retrieval policies against the same local cases. Scores describe this fixture set, not a model benchmark.</p></div>
        <div className="evaluation-controls">
          <label>Strategy<select value={strategy} onChange={(event) => setStrategy(event.target.value as RetrievalStrategy)}><option value="focused">Focused retrieval</option><option value="bm25">BM25 baseline</option></select></label>
          <button className="primary-button" type="button" disabled={isRunning} onClick={run}>{isRunning ? <><LoaderCircle className="spin" size={16} />Running suite</> : 'Run evaluation'}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </header>

      {selected ? (
        <>
          <section className="evaluation-scoreboard" aria-label="Selected evaluation summary">
            <div className="score-total"><span>Cases passed</span><strong>{selected.passed}<small> / {selected.total}</small></strong><p>{selected.strategy === 'focused' ? 'Focused retrieval' : 'BM25 baseline'} · {formatDateTime(selected.created_at)}</p></div>
            {(Object.entries(selected.metrics) as Array<[EvaluationMetricName, number]>).map(([name, value]) => (
              <article key={name} className="metric-score"><div><span>{metricCopy[name].label}</span><strong>{formatMetric(value)}</strong></div><div className="score-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(value, 1)) * 100}%` }} /></div><p>{metricCopy[name].explanation}</p></article>
            ))}
          </section>
          <section className="panel evaluation-cases">
            <SectionHeading title="Case results" description={`Each outcome includes the runner's recorded reason. Completed in ${formatDuration(selected.duration_ms)}.`} />
            <div className="table-scroll">
              <table>
                <thead><tr><th scope="col">Result</th><th scope="col">Case</th><th scope="col">Category</th><th scope="col">Detail</th><th scope="col">Time</th></tr></thead>
                <tbody>{selected.cases.map((testCase) => <tr key={testCase.id}><td><span className={testCase.passed ? 'case-result passed' : 'case-result failed'}>{testCase.passed ? <Check size={14} /> : <X size={14} />}{testCase.passed ? 'Pass' : 'Fail'}</span></td><th scope="row">{testCase.name}</th><td><span className="category-tag">{testCase.category}</span></td><td>{testCase.detail}</td><td>{formatDuration(testCase.duration_ms)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <EmptyState title={isLoading ? 'Loading evaluations' : 'No evaluation runs'} message={isLoading ? 'Reading locally persisted results.' : 'Run the deterministic suite to inspect its first set of case results.'} />
      )}

      {!!evaluations.length && (
        <section className="panel evaluation-history">
          <SectionHeading title="Previous evaluations" description="Select a stored run to inspect its exact cases." />
          <div className="evaluation-run-list">{evaluations.map((evaluation) => <button type="button" key={evaluation.id} className={selected?.id === evaluation.id ? 'is-active' : ''} onClick={() => setSelectedId(evaluation.id)}><span>{evaluation.strategy === 'focused' ? 'Focused' : 'BM25'}</span><strong>{evaluation.passed} / {evaluation.total}</strong><time>{formatDateTime(evaluation.created_at)}</time></button>)}</div>
        </section>
      )}
      <aside className="boundary-note"><ShieldAlert size={18} aria-hidden="true" /><p>Evaluation cases are synthetic and deterministic. They test retrieval and validation behavior within this project; they do not establish production safety or general model quality.</p></aside>
    </div>
  )
}
