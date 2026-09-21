import {
  Activity,
  FlaskConical,
  History,
  Menu,
  PanelLeftClose,
  SearchCheck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppView } from '../types'

interface ShellProps {
  view: AppView
  onViewChange: (view: AppView) => void
  children: ReactNode
}

const navItems: Array<{ id: AppView; label: string; icon: typeof Activity }> = [
  { id: 'workspace', label: 'Workspace', icon: SearchCheck },
  { id: 'evaluations', label: 'Evaluation lab', icon: FlaskConical },
  { id: 'history', label: 'Run history', icon: History },
]

export function Shell({ view, onViewChange, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const railRef = useRef<HTMLElement>(null)

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
    window.setTimeout(() => menuButtonRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobile()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(railRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeMobile, mobileOpen])

  const navigate = (next: AppView) => {
    onViewChange(next)
    if (mobileOpen) closeMobile()
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <Brand compact />
        <button ref={menuButtonRef} className="icon-button on-dark" type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
          <Menu aria-hidden="true" />
        </button>
      </header>

      {mobileOpen && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={closeMobile} />}

      <aside ref={railRef} className={`command-rail ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
        <div className="rail-top">
          <Brand />
          <button ref={closeButtonRef} className="icon-button on-dark mobile-only" type="button" aria-label="Close navigation" onClick={closeMobile}>
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="rail-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'rail-link is-active' : 'rail-link'}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="local-mode"><span aria-hidden="true" /> Local only</div>
          <p>Synthetic incident data</p>
          <p className="forge-mark">A Ripley Forge project</p>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand-compact' : 'brand'} aria-label="Proofline">
      <span className="brand-mark" aria-hidden="true"><PanelLeftClose size={20} strokeWidth={2.2} /></span>
      <span>Proofline</span>
    </div>
  )
}
