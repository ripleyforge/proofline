import {
  AlertTriangle,
  BookOpen,
  Braces,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  SearchCheck,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { downloadInvestigation } from '../api'
import { formatDuration } from '../format'
import type { Config, GenerationMode, Investigation, RetrievalStrategy } from '../types'

interface InvestigationPanelProps {
  incidentTitle: string
  suggestedQuestions: string[]
  config: Config
  currentRun: Investigation | null
  isRunning: boolean
  error: string | null
  onAsk: (input: { question: string; strategy: RetrievalStrategy; mode: GenerationMode }) => Promise<void>
  onOpenEvidence: (id: string) => void
}

export function InvestigationPanel({
  incidentTitle,
  suggestedQuestions,
  config,
  currentRun,
  isRunning,
  error,
  onAsk,
  onOpenEvidence,
}: InvestigationPanelProps) {
  const [question, setQuestion] = useState('')
  const [strategy, setStrategy] = useState<RetrievalStrategy>('focused')
  const [mode, setMode] = useState<GenerationMode>('extractive')
  const [exportError, setExportError] = useState<string | null>(null)
  const strategyHelpId = useId()
  const modeHelpId = useId()

  useEffect(() => {
    if (!config.generation_modes.includes(mode)) setMode('extractive')
  }, [config.generation_modes, mode])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!question.trim()) return
    await onAsk({ question: question.trim(), strategy, mode })
  }

  const exportRun = async (format: 'markdown' | 'json') => {
    if (!currentRun) return
    setExportError(null)
    try {
      await downloadInvestigation(currentRun.id, format)
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed')
    }
  }

  return (
    <aside className="investigation-panel" aria-label="Investigation">
      <div className="investigation-heading">
        <div className="heading-icon"><SearchCheck size={19} aria-hidden="true" /></div>
        <div><h2>Investigate</h2><p>Ask against {incidentTitle}</p></div>
      </div>
      <form onSubmit={submit} className="investigation-form">
        <label htmlFor="investigation-question">Question</label>
        <textarea
          id="investigation-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={config.limits.question_chars}
          rows={4}
          placeholder="What changed before the first failure?"
          required
        />
        <div className="character-count">{question.length} / {config.limits.question_chars}</div>
        {!!suggestedQuestions.length && (
          <div className="suggestions">
            <span>Suggested questions</span>
            {suggestedQuestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}
          </div>
        )}

        <fieldset aria-describedby={strategyHelpId}>
          <legend>Retrieval strategy</legend>
          <div className="choice-grid">
            <label className={strategy === 'focused' ? 'choice-card is-selected' : 'choice-card'}>
              <input type="radio" name="strategy" value="focused" checked={strategy === 'focused'} onChange={() => setStrategy('focused')} />
              <strong>Focused</strong><span>Incident context and evidence-kind priors</span>
            </label>
            <label className={strategy === 'bm25' ? 'choice-card is-selected' : 'choice-card'}>
              <input type="radio" name="strategy" value="bm25" checked={strategy === 'bm25'} onChange={() => setStrategy('bm25')} />
              <strong>BM25</strong><span>Transparent lexical baseline</span>
            </label>
          </div>
          <p className="field-help" id={strategyHelpId}>Both strategies search only evidence from this incident.</p>
        </fieldset>

        <fieldset aria-describedby={modeHelpId}>
          <legend>Answer mode</legend>
          <div className="choice-grid">
            <label className={mode === 'extractive' ? 'choice-card is-selected' : 'choice-card'}>
              <input type="radio" name="mode" value="extractive" checked={mode === 'extractive'} onChange={() => setMode('extractive')} />
              <strong>Evidence extracts</strong><span>Deterministic quotes. No AI generation.</span>
            </label>
            <label className={`${mode === 'local' ? 'choice-card is-selected' : 'choice-card'} ${!config.generation_modes.includes('local') ? 'is-disabled' : ''}`}>
              <input type="radio" name="mode" value="local" checked={mode === 'local'} disabled={!config.generation_modes.includes('local')} onChange={() => setMode('local')} />
              <strong>Local model</strong><span>{config.local_model.available ? config.local_model.name || 'Installed Ollama model' : config.local_model.reason || 'Not available'}</span>
            </label>
          </div>
          <p className="field-help" id={modeHelpId}>Quote checks confirm source integrity. They do not verify the meaning or root cause.</p>
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button ask-button" type="submit" disabled={isRunning || !question.trim()}>
          {isRunning ? <><LoaderCircle className="spin" size={17} />Investigating</> : <><Send size={17} />Run investigation</>}
        </button>
      </form>

      {currentRun ? (
        <InvestigationResult run={currentRun} onOpenEvidence={onOpenEvidence} onExport={exportRun} exportError={exportError} />
      ) : (
        <div className="result-empty"><ShieldCheck size={22} aria-hidden="true" /><p>Results will show their sources, trace, warnings, and actual answer mode here.</p></div>
      )}
    </aside>
  )
}

function InvestigationResult({ run, onOpenEvidence, onExport, exportError }: {
  run: Investigation
  onOpenEvidence: (id: string) => void
  onExport: (format: 'markdown' | 'json') => void
  exportError: string | null
}) {
  return (
    <section className="investigation-result" aria-live="polite">
      <div className="result-heading">
        <div><span className={`result-status ${run.status}`}>{run.status === 'answered' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{run.status}</span></div>
        <span className="run-duration"><Clock3 size={14} />{formatDuration(run.duration_ms)}</span>
      </div>
      <div className="mode-disclosure">
        <strong>{run.mode === 'extractive' ? 'Evidence extracts' : 'Local model output'}</strong>
        <span>{run.strategy === 'focused' ? 'Focused retrieval' : 'BM25 baseline'}</span>
      </div>
      <p className="answer-copy">{run.answer || 'The available evidence did not support an answer.'}</p>

      {!!run.claims.length && (
        <div className="claim-list">
          <h3>Statements and sources</h3>
          {run.claims.map((claim, index) => (
            <article key={`${claim.evidence_id}-${index}`}>
              <div className="claim-integrity"><ShieldCheck size={14} />{claim.verified ? 'Quote matched source' : 'Quote not verified'}</div>
              <p>{claim.text}</p>
              <blockquote>“{claim.quote}”</blockquote>
              <button type="button" className="source-link" onClick={() => onOpenEvidence(claim.evidence_id)}><BookOpen size={14} />Open {claim.evidence_id}</button>
            </article>
          ))}
        </div>
      )}

      {!!run.citations.length && (
        <div className="result-sources">
          <h3>Sources</h3>
          {run.citations.map((citation) => <button type="button" key={citation.id} onClick={() => onOpenEvidence(citation.id)}><span>{citation.title}</span><small>{citation.id}</small></button>)}
        </div>
      )}

      {!!run.warnings.length && (
        <div className="result-warnings" role="status"><h3><AlertTriangle size={15} />Warnings</h3>{run.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
      )}

      <details className="trace-details">
        <summary>Retrieval and validation trace <ChevronDown size={15} aria-hidden="true" /></summary>
        <ol>{run.trace.map((step, index) => <li key={`${step.step}-${index}`}><span>{step.step}</span><p>{step.detail}</p><time>{formatDuration(step.duration_ms)}</time></li>)}</ol>
      </details>

      <div className="export-actions">
        <span><Download size={15} />Export brief</span>
        <button type="button" onClick={() => onExport('markdown')}><FileText size={15} />Markdown</button>
        <button type="button" onClick={() => onExport('json')}><Braces size={15} />JSON</button>
      </div>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
    </section>
  )
}
