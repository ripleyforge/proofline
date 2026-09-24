import { ChevronDown, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { api } from '../api'
import { formatDateTime } from '../format'
import { finishSubmittedHypothesisDraft, loadHypothesisDraft, sameHypothesisDraft, sameHypothesisEditTarget, saveHypothesisDraft } from '../hypothesisDrafts'
import type { HypothesisDraftLoad, HypothesisDraftNotice, HypothesisEditTarget } from '../hypothesisDrafts'
import { acknowledgeHypothesisSave, getHypothesisSave, startHypothesisSave, subscribeHypothesisSave } from '../hypothesisSaves'
import type { Evidence, Hypothesis, HypothesisInput, HypothesisPage, HypothesisStatus } from '../types'
import { EmptyState, ErrorState, LoadingState, SectionHeading } from './Primitives'

const statuses: Record<HypothesisStatus, string> = { open: 'Open', supported: 'Supported', ruled_out: 'Ruled out' }
const emptyDraft = (): HypothesisInput => ({ statement: '', status: 'open', rationale: '', next_check: '', supporting_evidence_ids: [], challenging_evidence_ids: [] })
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'The request failed.'
const authoredInput = (item: HypothesisInput): HypothesisInput => ({ statement: item.statement, status: item.status, rationale: item.rationale, next_check: item.next_check, supporting_evidence_ids: item.supporting_evidence_ids, challenging_evidence_ids: item.challenging_evidence_ids })
const draftNotices: Record<NonNullable<HypothesisDraftNotice>, string> = {
  unavailable: 'Browser storage cannot keep hypothesis drafts up to date. Keep this editor open until you save.',
  invalid: 'An invalid saved hypothesis draft could not be restored. You can start a new draft.',
  pruned: 'Restored your draft and removed unavailable or conflicting evidence references.',
}

interface HypothesesPanelProps {
  incidentId: string
  evidence: Evidence[]
  onOpenEvidence: (id: string) => void
}

// The incident-keyed parent gives every incident its own request lifetime.
export function HypothesesPanel({ incidentId, evidence, onOpenEvidence }: HypothesesPanelProps) {
  const subscribeSave = useCallback((listener: () => void) => subscribeHypothesisSave(incidentId, listener), [incidentId])
  const getSave = useCallback(() => getHypothesisSave(incidentId), [incidentId])
  const saveState = useSyncExternalStore(subscribeSave, getSave)
  const pendingSave = saveState?.status === 'pending'
  const initialDraftRef = useRef<HypothesisDraftLoad | null>(null)
  if (!initialDraftRef.current) {
    initialDraftRef.current = loadHypothesisDraft(incidentId, new Set(evidence.map((item) => item.id)))
    if (!initialDraftRef.current.draft && saveState?.status === 'pending') initialDraftRef.current.draft = saveState.submitted
  }
  const [page, setPage] = useState<HypothesisPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<HypothesisInput | null>(() => initialDraftRef.current?.draft?.input ?? null)
  const [editing, setEditing] = useState<HypothesisEditTarget | null>(() => initialDraftRef.current?.draft?.editing ?? null)
  const [draftNotice, setDraftNotice] = useState<HypothesisDraftNotice>(() => initialDraftRef.current?.notice ?? null)
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

  const updateDraft = (next: HypothesisInput | null, target: HypothesisEditTarget | null = editing) => {
    setDraft(next)
    setEditing(target)
    if (!saveHypothesisDraft(incidentId, next ? { input: next, editing: target } : null)) setDraftNotice('unavailable')
  }

  useEffect(() => {
    // Persist the validated, incident-scoped version of a restored draft.
    const initial = initialDraftRef.current
    if (initial?.draft && !saveHypothesisDraft(incidentId, initial.draft)) setDraftNotice('unavailable')
  }, [incidentId])

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

  const editorOpen = draft !== null
  useEffect(() => { if (editorOpen) editorRef.current?.focus() }, [editorOpen])

  const startEdit = (hypothesis?: Hypothesis) => {
    updateDraft(hypothesis ? authoredInput(hypothesis) : emptyDraft(), hypothesis ? { id: hypothesis.id, revision: hypothesis.revision } : null)
    setError(null)
    setConflict(false)
    setNotice(null)
  }

  const mergeSaved = useCallback((saved: Hypothesis, created: boolean) => setPage((current) => {
    const existing = current?.items.find((item) => item.id === saved.id)
    const items = [existing && existing.revision > saved.revision ? existing : saved, ...(current?.items ?? []).filter((item) => item.id !== saved.id)].slice(0, 100)
    return {
      total: Math.max((current?.total ?? 0) + (created && !existing ? 1 : 0), items.length),
      items,
    }
  }), [])

  useEffect(() => {
    if (!saveState || saveState.status === 'pending') return
    if (saveState.status === 'succeeded') {
      const { saved, submitted } = saveState
      const sameTarget = draft && sameHypothesisEditTarget(editing, submitted.editing)
      const unchanged = sameTarget && sameHypothesisDraft({ input: draft, editing }, submitted)
      if (unchanged) {
        setDraft(null)
        setEditing(null)
        if (!finishSubmittedHypothesisDraft(incidentId, submitted, saved)) setDraftNotice('unavailable')
      } else if (sameTarget) {
        // Edits made while the write was pending belong to the newly saved
        // record. Keep their contents and use its revision on the next save.
        const target = { id: saved.id, revision: saved.revision }
        setEditing(target)
        if (!saveHypothesisDraft(incidentId, { input: draft, editing: target })) setDraftNotice('unavailable')
      }
      if (!saveState.storageAvailable) setDraftNotice('unavailable')
      mergeSaved(saved, !submitted.editing)
      setNotice(`Hypothesis saved as revision ${saved.revision}.${sameTarget && !unchanged ? ' Your newer edits remain unsaved in the editor.' : ''}`)
      // This new read supersedes any list read begun before the save completed.
      void load()
    } else {
      setConflict(saveState.conflict)
      if (!saveState.conflict) setError(saveState.message)
    }
    acknowledgeHypothesisSave(incidentId, saveState)
  }, [draft, editing, incidentId, load, mergeSaved, saveState])

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft || !draft.statement.trim() || saving || pendingSave || conflict || loading || loadError) return
    setError(null)
    startHypothesisSave(incidentId, { input: draft, editing })
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
      updateDraft(authoredInput(latest), { id: latest.id, revision: latest.revision })
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
    updateDraft({ ...draft, supporting_evidence_ids: supporting, challenging_evidence_ids: challenging })
  }

  return (
    <section id="hypotheses-board" tabIndex={-1} className="panel hypotheses-panel" aria-label="Hypothesis board">
      <SectionHeading title="Hypotheses" description="Record explanations to test. Every status is your judgment, not a model finding."
        action={<button type="button" className="secondary-button" disabled={loading || pendingSave || !!draft || !!loadError} onClick={() => startEdit()}><Plus size={16} />Add hypothesis</button>} />
      {notice && <p className="reasoning-notice" role="status">{notice}</p>}
      {pendingSave && <p className="reasoning-notice" role="status">Saving this hypothesis. You can keep editing; newer edits will remain in your draft.</p>}
      {draftNotice && <p className="reasoning-notice" role="status">{draftNotices[draftNotice]}</p>}
      {draft && <form className="hypothesis-form" onSubmit={save}>
        <h3>{editing ? `Edit hypothesis · revision ${editing.revision}` : 'New hypothesis'}</h3>
        {!draftNotice && <p className="hypothesis-draft-help">Unsaved drafts stay in this browser tab as you navigate or reload.</p>}
        <fieldset disabled={saving}>
          <label htmlFor={statementId}>Hypothesis statement</label>
          <textarea ref={editorRef} id={statementId} value={draft.statement} onChange={(event) => updateDraft({ ...draft, statement: event.target.value })} rows={3} maxLength={500} required />
          <label htmlFor={statusId}>Analyst status</label>
          <select id={statusId} value={draft.status} onChange={(event) => updateDraft({ ...draft, status: event.target.value as HypothesisStatus })}>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor={rationaleId}>Rationale</label>
          <textarea id={rationaleId} value={draft.rationale} onChange={(event) => updateDraft({ ...draft, rationale: event.target.value })} rows={3} maxLength={4000} />
          <label htmlFor={nextCheckId}>Next check</label>
          <textarea id={nextCheckId} value={draft.next_check} onChange={(event) => updateDraft({ ...draft, next_check: event.target.value })} rows={2} maxLength={1000} />
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
        <div className="hypothesis-form-actions"><button type="submit" className="primary-button" disabled={saving || pendingSave || conflict || loading || !!loadError || !draft.statement.trim()}>{saving || pendingSave ? <><LoaderCircle className="spin" size={16} />Saving</> : 'Save hypothesis'}</button>
          <button type="button" className="secondary-button" disabled={saving || pendingSave} onClick={() => { updateDraft(null, null); setError(null); setConflict(false) }}>Discard edit</button></div>
      </form>}
      {loading && !page && <LoadingState label="Loading hypotheses" />}
      {loadError && <ErrorState message={loadError} onRetry={() => void load()} />}
      {page && <>
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
