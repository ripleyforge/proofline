import { ChevronDown, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { formatDateTime } from '../format'
import type { Evidence, Hypothesis, HypothesisInput, HypothesisPage, HypothesisStatus } from '../types'
import { EmptyState, ErrorState, LoadingState, SectionHeading } from './Primitives'

const statuses: Record<HypothesisStatus, string> = { open: 'Open', supported: 'Supported', ruled_out: 'Ruled out' }
const emptyDraft = (): HypothesisInput => ({ statement: '', status: 'open', rationale: '', next_check: '', supporting_evidence_ids: [], challenging_evidence_ids: [] })
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'The request failed.'

interface HypothesesPanelProps {
  incidentId: string
  evidence: Evidence[]
  onOpenEvidence: (id: string) => void
}

// The incident-keyed parent gives every incident its own request lifetime.
export function HypothesesPanel({ incidentId, evidence, onOpenEvidence }: HypothesesPanelProps) {
  const [page, setPage] = useState<HypothesisPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<HypothesisInput | null>(null)
  const [editing, setEditing] = useState<Hypothesis | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestRef = useRef(0)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const statementId = useId()
  const statusId = useId()
  const rationaleId = useId()
  const nextCheckId = useId()

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    setLoadError(null)
    try {
      const result = await api.hypotheses(incidentId)
      if (requestRef.current === requestId) setPage(result)
    } catch (cause) {
      if (requestRef.current === requestId) setLoadError(messageFrom(cause))
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }, [incidentId])

  useEffect(() => {
    void load()
    return () => { requestRef.current += 1 }
  }, [load])

  const editingId = editing?.id
  const editorOpen = draft !== null
  useEffect(() => { if (editorOpen) editorRef.current?.focus() }, [editorOpen, editingId])

  const startEdit = (hypothesis?: Hypothesis) => {
    setEditing(hypothesis ?? null)
    setDraft(hypothesis ? { ...hypothesis } : emptyDraft())
    setError(null)
    setConflict(false)
    setNotice(null)
  }

  const mergeSaved = (saved: Hypothesis, created: boolean) => setPage((current) => ({
    total: (current?.total ?? 0) + (created ? 1 : 0),
    items: [saved, ...(current?.items ?? []).filter((item) => item.id !== saved.id)].slice(0, 100),
  }))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft || !draft.statement.trim() || saving || conflict) return
    const requestId = ++requestRef.current
    setSaving(true)
    setError(null)
    try {
      // Send only the authored input, never incidental server metadata.
      const input: HypothesisInput = {
        statement: draft.statement.trim(), status: draft.status, rationale: draft.rationale,
        next_check: draft.next_check, supporting_evidence_ids: draft.supporting_evidence_ids,
        challenging_evidence_ids: draft.challenging_evidence_ids,
      }
      const saved = editing
        ? await api.updateHypothesis(incidentId, editing.id, { ...input, expected_revision: editing.revision })
        : await api.createHypothesis(incidentId, input)
      if (requestRef.current !== requestId) return
      mergeSaved(saved, !editing)
      setDraft(null)
      setEditing(null)
      setNotice(`Hypothesis saved as revision ${saved.revision}.`)
    } catch (cause) {
      if (requestRef.current !== requestId) return
      if (cause instanceof ApiError && cause.status === 409) setConflict(true)
      else setError(messageFrom(cause))
    } finally {
      if (requestRef.current === requestId) setSaving(false)
    }
  }

  const reloadSaved = async () => {
    if (!editing || saving) return
    const requestId = ++requestRef.current
    setSaving(true)
    setError(null)
    try {
      const history = await api.hypothesisRevisions(incidentId, editing.id)
      const latest = history.items[0]
      if (!latest) throw new Error('No saved revision was returned. Your draft is still available.')
      if (requestRef.current !== requestId) return
      mergeSaved(latest, false)
      setEditing(latest)
      setDraft({ ...latest })
      setConflict(false)
      setNotice(`Loaded revision ${latest.revision}.`)
    } catch (cause) {
      if (requestRef.current === requestId) setError(messageFrom(cause))
    } finally {
      if (requestRef.current === requestId) setSaving(false)
    }
  }

  const setReference = (id: string, side: string) => {
    if (!draft) return
    const supporting = draft.supporting_evidence_ids.filter((item) => item !== id)
    const challenging = draft.challenging_evidence_ids.filter((item) => item !== id)
    if (side === 'supporting') supporting.push(id)
    if (side === 'challenging') challenging.push(id)
    if (supporting.length > 30 || challenging.length > 30) {
      setError('Each side can contain up to 30 sources. Remove a reference before adding another.')
      return
    }
    setDraft({ ...draft, supporting_evidence_ids: supporting, challenging_evidence_ids: challenging })
  }

  return (
    <section id="hypotheses-board" tabIndex={-1} className="panel hypotheses-panel" aria-label="Hypothesis board">
      <SectionHeading title="Hypotheses" description="Record explanations to test. Every status is your judgment, not a model finding."
        action={<button type="button" className="secondary-button" disabled={loading || !!draft || !!loadError} onClick={() => startEdit()}><Plus size={16} />Add hypothesis</button>} />
      {notice && <p className="reasoning-notice" role="status">{notice}</p>}
      {draft && <form className="hypothesis-form" onSubmit={save}>
        <h3>{editing ? `Edit hypothesis · revision ${editing.revision}` : 'New hypothesis'}</h3>
        <fieldset disabled={saving}>
          <label htmlFor={statementId}>Hypothesis statement</label>
          <textarea ref={editorRef} id={statementId} value={draft.statement} onChange={(event) => setDraft({ ...draft, statement: event.target.value })} rows={3} maxLength={500} required />
          <label htmlFor={statusId}>Analyst status</label>
          <select id={statusId} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as HypothesisStatus })}>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor={rationaleId}>Rationale</label>
          <textarea id={rationaleId} value={draft.rationale} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} rows={3} maxLength={4000} />
          <label htmlFor={nextCheckId}>Next check</label>
          <textarea id={nextCheckId} value={draft.next_check} onChange={(event) => setDraft({ ...draft, next_check: event.target.value })} rows={2} maxLength={1000} />
          <details className="hypothesis-reference-picker">
            <summary>Evidence references <span>{draft.supporting_evidence_ids.length} supporting / {draft.challenging_evidence_ids.length} challenging</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <p>Choose the role each source plays in your reasoning. Untrusted sources stay labeled and excluded from answer context.</p>
            {evidence.map((source) => <div className="hypothesis-reference-choice" key={source.id}>
              <div><button type="button" className="source-link" onClick={() => onOpenEvidence(source.id)}>{source.title}</button><small>{source.id}{!source.trusted && <span className="untrusted-label"> · Untrusted</span>}</small></div>
              <select aria-label={`Role for ${source.title}`} value={draft.supporting_evidence_ids.includes(source.id) ? 'supporting' : draft.challenging_evidence_ids.includes(source.id) ? 'challenging' : ''} onChange={(event) => setReference(source.id, event.target.value)}>
                <option value="">No reference</option><option value="supporting">Supporting</option><option value="challenging">Challenging</option>
              </select>
            </div>)}
          </details>
        </fieldset>
        {conflict && <div className="hypothesis-conflict" role="alert"><p>A newer revision was saved elsewhere. Your unsaved draft is preserved in the editor; copy anything you want to keep before reloading. Reload replaces the editor with the latest saved version.</p><button type="button" className="secondary-button" disabled={saving} onClick={() => void reloadSaved()}>Reload saved version</button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="hypothesis-form-actions"><button type="submit" className="primary-button" disabled={saving || conflict || !draft.statement.trim()}>{saving ? <><LoaderCircle className="spin" size={16} />Saving</> : 'Save hypothesis'}</button>
          <button type="button" className="secondary-button" disabled={saving} onClick={() => { setDraft(null); setEditing(null); setError(null); setConflict(false) }}>Discard edit</button></div>
      </form>}
      {loading ? <LoadingState label="Loading hypotheses" /> : loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : page && <>
        <p className="reasoning-count">Showing {page.items.length} of {page.total} hypotheses{page.total > page.items.length ? ' · Latest 100 only' : ''}</p>
        {page.items.length ? <div className="hypothesis-list">{page.items.map((item) => <article key={item.id} className="hypothesis-item">
          <div className="hypothesis-item-heading"><span className={`hypothesis-status ${item.status}`}>{statuses[item.status]}<span className="sr-only"> analyst judgment</span></span><small>Revision {item.revision}</small></div>
          <h3>{item.statement}</h3>
          <div className="hypothesis-item-actions"><button type="button" className="secondary-button" disabled={!!draft} aria-label={`Edit hypothesis: ${item.statement}`} onClick={() => startEdit(item)}>Edit</button><time dateTime={item.updated_at}>{formatDateTime(item.updated_at)}</time></div>
          <details className="hypothesis-reasoning"><summary>Reasoning and references <ChevronDown size={14} aria-hidden="true" /></summary><HypothesisContent hypothesis={item} evidence={evidence} onOpenEvidence={onOpenEvidence} /></details>
          <HypothesisHistory key={`${item.id}:${item.revision}`} hypothesis={item} evidence={evidence} onOpenEvidence={onOpenEvidence} />
        </article>)}</div> : <EmptyState title="No hypotheses yet" message="Add an explanation, the evidence for and against it, and the next check that could change your view." />}
      </>}
    </section>
  )
}

function HypothesisContent({ hypothesis, evidence, onOpenEvidence }: { hypothesis: Hypothesis; evidence: Evidence[]; onOpenEvidence: (id: string) => void }) {
  return <div className="hypothesis-content"><dl><div><dt>Rationale</dt><dd>{hypothesis.rationale || 'No rationale recorded.'}</dd></div><div><dt>Next check</dt><dd>{hypothesis.next_check || 'No next check recorded.'}</dd></div></dl>
    {(['supporting', 'challenging'] as const).map((side) => <div className="hypothesis-source-list" key={side}><h4>{side === 'supporting' ? 'Supporting sources' : 'Challenging sources'}</h4>{hypothesis[`${side}_evidence_ids`].length ? hypothesis[`${side}_evidence_ids`].map((id) => {
      const source = evidence.find((item) => item.id === id)
      return <button type="button" className="source-link" key={id} onClick={() => onOpenEvidence(id)}>{source?.title ?? id}{source && !source.trusted && <span className="untrusted-label">Untrusted</span>}</button>
    }) : <p>None recorded.</p>}</div>)}
  </div>
}

function HypothesisHistory({ hypothesis, evidence, onOpenEvidence }: { hypothesis: Hypothesis; evidence: Evidence[]; onOpenEvidence: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<HypothesisPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    let active = true
    setPage(null)
    setError(null)
    void api.hypothesisRevisions(hypothesis.incident_id, hypothesis.id).then(
      (result) => { if (active) setPage(result) },
      (cause: unknown) => { if (active) setError(messageFrom(cause)) },
    )
    return () => { active = false }
  }, [open, hypothesis.incident_id, hypothesis.id, retry])
  return <details className="hypothesis-history" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Revision history <ChevronDown size={14} aria-hidden="true" /></summary>
    {open && (error ? <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /> : page ? <>
      <p className="reasoning-count">Showing {page.items.length} of {page.total} revisions{page.total > page.items.length ? ' · Latest 100 only' : ''}</p>
      <ol>{page.items.map((revision) => <li key={revision.revision}><div><strong>Revision {revision.revision} · {statuses[revision.status]}</strong><time dateTime={revision.updated_at}>{formatDateTime(revision.updated_at)}</time></div><h4>{revision.statement}</h4><HypothesisContent hypothesis={revision} evidence={evidence} onOpenEvidence={onOpenEvidence} /></li>)}</ol>
    </> : <LoadingState label="Loading revision history" />)}
  </details>
}
