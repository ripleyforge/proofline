import { BookMarked, LoaderCircle, Plus, X } from 'lucide-react'
import { formatDateTime } from '../format'
import type { Evidence, Note } from '../types'
import { EmptyState, SectionHeading } from './Primitives'

interface NotesPanelProps {
  notes: Note[]
  evidence: Evidence[]
  selectedEvidenceIds: string[]
  body: string
  formOpen: boolean
  maxChars: number
  isSaving: boolean
  error: string | null
  onToggleEvidence: (id: string) => void
  onBodyChange: (body: string) => void
  onFormOpenChange: (open: boolean) => void
  onSave: (body: string) => Promise<boolean>
  onOpenEvidence: (id: string) => void
}

export function NotesPanel({ notes, evidence, selectedEvidenceIds, body, formOpen, maxChars, isSaving, error, onToggleEvidence, onBodyChange, onFormOpenChange, onSave, onOpenEvidence }: NotesPanelProps) {
  const selectedEvidence = selectedEvidenceIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is Evidence => Boolean(item))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    await onSave(body.trim())
  }

  return (
    <section className="panel notes-panel">
      <SectionHeading title="Investigation notes" description="Saved locally with explicit evidence references." action={<button type="button" className="secondary-button" onClick={() => onFormOpenChange(!formOpen)}><Plus size={16} />{formOpen ? 'Close editor' : 'Add note'}</button>} />
      {formOpen && (
        <form className="note-form" onSubmit={submit}>
          <label htmlFor="note-body">Note</label>
          <textarea id="note-body" rows={4} maxLength={maxChars} value={body} onChange={(event) => onBodyChange(event.target.value)} placeholder="Record what the evidence supports and what remains unknown." required />
          <div className="note-form-meta"><span>{body.length} / {maxChars}</span><span>{selectedEvidence.length} references</span></div>
          {selectedEvidence.length > 0 && <div className="selected-references" aria-label="Selected evidence references">{selectedEvidence.map((item) => <span key={item.id}>{item.title}<button type="button" aria-label={`Remove ${item.title}`} onClick={() => onToggleEvidence(item.id)}><X size={12} /></button></span>)}</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button" disabled={isSaving || !body.trim()}>{isSaving ? <><LoaderCircle className="spin" size={16} />Saving</> : 'Save note'}</button>
        </form>
      )}
      {notes.length ? (
        <div className="notes-list">
          {notes.map((note) => (
            <article key={note.id}>
              <div className="note-meta"><BookMarked size={15} aria-hidden="true" /><time dateTime={note.created_at}>{formatDateTime(note.created_at)}</time></div>
              <p>{note.body}</p>
              {!!note.evidence_ids.length && <div className="note-references">{note.evidence_ids.map((id) => <button key={id} type="button" onClick={() => onOpenEvidence(id)}>{id}</button>)}</div>}
            </article>
          ))}
        </div>
      ) : <EmptyState title="No notes yet" message="Add a note when you have a supported observation or an open question to preserve." />}
    </section>
  )
}
