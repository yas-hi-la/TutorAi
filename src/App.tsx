import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'study_ai_chats'
const ERROR_MESSAGE = 'Sorry, I could not get a response right now. Please try again.'

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== 'object') return false
  const chat = value as Partial<Chat>
  return typeof chat.id === 'string'
    && typeof chat.title === 'string'
    && typeof chat.createdAt === 'number'
    && typeof chat.updatedAt === 'number'
    && Array.isArray(chat.messages)
    && chat.messages.every(message =>
      Boolean(message)
      && typeof message === 'object'
      && (message as Message).role in { user: true, assistant: true }
      && typeof (message as Message).content === 'string'
    )
}

function loadChats(): Chat[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) && parsed.every(isChat) ? parsed : []
  } catch (error) {
    console.error('Could not load saved chats:', error)
    return []
  }
}

function createChatId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createChatTitle(question: string) {
  const title = question
    .replace(/^(what is|what are|how does|how do|explain|tell me about)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  return title.length > 52 ? `${title.slice(0, 49).trimEnd()}...` : title
}

// ============================================================
// SECTION 1 — ANIMATION PAGE
// Letters fly in, dot falls and zooms out to yellow, then
// contracts into the top-left logo to reveal the landing page.
// ============================================================

interface LetterDef {
  char: string
  from: 'top' | 'bottom' | 'left'
  delay: number
}

const LETTERS: LetterDef[] = [
  { char: 't', from: 'top',    delay: 0 },
  { char: 'u', from: 'bottom', delay: 320 },
  { char: 't', from: 'top',    delay: 640 },
  { char: 'o', from: 'top',    delay: 960 },
  { char: 'r', from: 'top',    delay: 1280 },
  { char: 'A', from: 'left',   delay: 1700 },
  { char: 'ı', from: 'left',   delay: 1950 },
]

const DOT_R     = 13
const DOT_SCALE = 320
const BASE_DELAY = 700

function AnimationPage({
  iRef, showYellow, visible, dotPos, dotFalling,
  dotExpanded, contractClip, clipExpanded, clipContracted,
}: {
  iRef: React.RefObject<HTMLSpanElement | null>
  showYellow: boolean
  visible: boolean[]
  dotPos: { x: number; y: number } | null
  dotFalling: boolean
  dotExpanded: boolean
  contractClip: boolean
  clipExpanded: string
  clipContracted: string
}) {
  return (
    <>
      {!showYellow && (
        <div style={{
          position: 'fixed', inset: 0, background: '#06091a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', zIndex: 50,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            fontSize: 'clamp(4rem, 13vw, 9.5rem)',
            fontWeight: 500, letterSpacing: '3px', lineHeight: 1, userSelect: 'none',
          }}>
            {LETTERS.map((l, i) => {
              const isAi = i >= 5
              let initial: string
              if (l.from === 'top')         initial = 'translateY(-115vh)'
              else if (l.from === 'bottom') initial = 'translateY(115vh)'
              else                          initial = 'translateX(-115vw)'
              return (
                <span key={i} ref={i === 6 ? iRef : undefined} style={{
                  display: 'inline-block',
                  fontFamily: isAi ? '"JetBrains Mono", monospace' : '"Quantico", sans-serif',
                  color: isAi ? 'rgb(229,215,11)' : '#f8fafc',
                  transform: visible[i] ? 'translate(0,0)' : initial,
                  transition: 'transform 0.9s cubic-bezier(0.34,1.56,0.64,1)',
                  willChange: 'transform',
                }}>{l.char}</span>
              )
            })}
          </div>

          {dotPos && (
            <div style={{
              position: 'fixed',
              width: DOT_R * 2, height: DOT_R * 2,
              borderRadius: '50%', background: 'rgb(229,215,11)',
              left: dotPos.x - DOT_R,
              top: dotFalling ? dotPos.y - DOT_R : -DOT_R * 2,
              transform: dotExpanded ? `scale(${DOT_SCALE})` : 'scale(1)',
              transition: dotExpanded
                ? 'transform 1.2s cubic-bezier(0.55,0,0.45,1)'
                : 'top 0.65s cubic-bezier(0.34,1.56,0.64,1)',
              transformOrigin: 'center', zIndex: 100, pointerEvents: 'none',
            }} />
          )}
        </div>
      )}

      {showYellow && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgb(229,215,11)',
          clipPath: contractClip ? clipContracted : clipExpanded,
          transition: contractClip ? 'clip-path 1s cubic-bezier(0.4,0,0.2,1)' : 'none',
          zIndex: 200, pointerEvents: 'none',
        }} />
      )}
    </>
  )
}

// ============================================================
// SHARED — INPUT BAR (used on landing page and chat page)
// ============================================================

function InputBar({
  value, onChange, onSubmit, placeholder, fullWidth,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  fullWidth?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: '0.5rem',
      width: '100%', maxWidth: fullWidth ? '100%' : 500,
    }}>
      {/* Text area with paperclip */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'flex-end',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: 20,
        transition: 'border-color 0.15s',
        padding: '10px 12px 10px 15px',
        gap: '0.5rem',
      }}
        onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(229,215,11,0.8)')}
        onBlurCapture={e  => (e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)')}
      >
        {/* Paperclip */}
        <label style={{
          cursor: 'pointer', color: '#888', display: 'flex',
          alignItems: 'center', flexShrink: 0, position: 'relative',
          alignSelf: 'flex-end', paddingBottom: 2,
        }}
          onMouseEnter={e => {
            const tip = e.currentTarget.querySelector<HTMLElement>('[data-tip]')
            if (tip) tip.style.opacity = '1'
          }}
          onMouseLeave={e => {
            const tip = e.currentTarget.querySelector<HTMLElement>('[data-tip]')
            if (tip) tip.style.opacity = '0'
          }}
        >
          <input type="file" style={{ display: 'none' }} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.41a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          <span data-tip style={{
            position: 'absolute', bottom: '130%', left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a1a', color: '#fff',
            fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
            padding: '4px 10px', borderRadius: 6,
            whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0,
          }}>Add materials</span>
        </label>

        {/* Textarea */}
        <textarea
          placeholder={placeholder}
          value={value}
          rows={1}
          ref={el => { if (el && !value) el.style.height = 'auto' }}
          onChange={e => {
            onChange(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={e => {
  if (e.key === 'Enter') {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()

      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      const newValue =
        value.substring(0, start) + '\n' + value.substring(end)

      onChange(newValue)

      requestAnimationFrame(() => {
        textarea.selectionStart = start + 1
        textarea.selectionEnd = start + 1
      })

      return
    }

    e.preventDefault()
    onSubmit()
  }
}}
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent',
            color: '#0a0a0a', fontSize: '0.95rem',
            fontFamily: 'Inter, sans-serif',
            resize: 'none', overflow: 'hidden',
            lineHeight: 1.5, padding: 0,
          }}
        />
      </div>

      {/* Send button */}
      <div style={{ position: 'relative', alignSelf: 'center', flexShrink: 0 }}>
        <button
          data-send-btn
          onClick={onSubmit}
          style={{
            width: 38, height: 38,
            background: 'rgb(229,215,11)', border: 'none',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#0a0a0a',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgb(210,197,5)'
            const tip = e.currentTarget.parentElement?.querySelector<HTMLElement>('[data-shortcut-tip]')
            if (tip) tip.style.opacity = '1'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgb(229,215,11)'
            const tip = e.currentTarget.parentElement?.querySelector<HTMLElement>('[data-shortcut-tip]')
            if (tip) tip.style.opacity = '0'
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
        <span data-shortcut-tip style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff',
          fontSize: '0.72rem', fontFamily: 'Inter, sans-serif',
          padding: '4px 10px', borderRadius: 6,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          opacity: 0, transition: 'opacity 0.1s',
        }}>Enter</span>
      </div>
    </div>
  )
}

// ============================================================
// SECTION 2 — LANDING PAGE
// Home screen with greeting, search input, and action buttons.
// ============================================================

const Logo = ({ refProp }: { refProp?: React.RefObject<HTMLSpanElement | null> }) => (
  <span ref={refProp} style={{ fontSize: '36px', fontWeight: 500, letterSpacing: '2px' }}>
    <span style={{ fontFamily: '"Quantico", sans-serif', color: '#0a0a0a', letterSpacing: '0.5px' }}>tutor</span>
    <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'rgb(229,215,11)', letterSpacing: '1px' }}>Ai</span>
  </span>
)

function LandingPage({
  logoRef,
  onAsk,
}: {
  logoRef: React.RefObject<HTMLSpanElement | null>
  onAsk: (q: string) => void
}) {
  const [input, setInput] = useState('')

  const submit = () => {
    const q = input.trim()
    if (q) onAsk(q)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFDF5', fontFamily: 'Inter, sans-serif', color: '#0a0a0a' }}>
      <header style={{ padding: '1.1rem 1.75rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Logo refProp={logoRef} />
      </header>

      <main style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: 'calc(100vh - 60px)',
        padding: '2rem 1.5rem', gap: '1.75rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: '"Oxanium", sans-serif',
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 700, color: '#0a0a0a',
            margin: '0 0 0.6rem', letterSpacing: '-0.01em',
          }}>Hey Champ!</h1>
          <p style={{ color: '#444', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', margin: 0 }}>
            What are we gonna tackle today?
          </p>
        </div>

        <InputBar value={input} onChange={setInput} onSubmit={submit} placeholder="I'm curious about..." />

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Create Subject', 'Go to Subjects'].map(label => (
            <button key={label}
              style={{
                padding: '0.9rem 2rem',
                background: 'rgb(229,215,11)', border: '1px solid rgb(229,215,11)',
                borderRadius: 14, color: '#0a0a0a',
                fontSize: '0.95rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: '"Oxanium", sans-serif',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgb(210,197,5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgb(229,215,11)')}
            >{label}</button>
          ))}
        </div>
      </main>
    </div>
  )
}

// ============================================================
// SECTION 3 — CHAT / EXPLANATION PAGE
// Shown after the user submits a question. Left sidebar with
// logo and recent chats; right panel with question bubble,
// AI explanation card, and follow-up input.
// ============================================================


function ChatPage({
  chat,
  chats,
  loading,
  onFollowUp,
  onSelectChat,
  onHome,
  onRenameChat,
  onDeleteChat,
}: {
  chat: Chat
  chats: Chat[]
  loading: boolean
  onFollowUp: (q: string) => void
  onSelectChat: (id: string) => void
  onHome: () => void
  onRenameChat: (id: string, title: string) => void
  onDeleteChat: (id: string) => void
}) {
  const [followUp, setFollowUp] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [folderHovered, setFolderHovered] = useState(false)
  const [folderClicked, setFolderClicked] = useState(false)
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [mobileActionsChatId, setMobileActionsChatId] = useState<string | null>(null)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [pendingDeleteChatId, setPendingDeleteChatId] = useState<string | null>(null)

  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth <= 768)
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
    return () => window.removeEventListener('resize', updateIsMobile)
  }, [])

  const submit = () => {
    const q = followUp.trim()
    if (q && !loading) { onFollowUp(q); setFollowUp('') }
  }

  const recentChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  const handleRenameSave = (id: string) => {
    const trimmed = draftTitle.trim()
    if (!trimmed) {
      setEditingChatId(null)
      setDraftTitle('')
      return
    }

    onRenameChat(id, trimmed)
    setEditingChatId(null)
    setDraftTitle('')
  }

  const handleDelete = (id: string) => {
    onDeleteChat(id)
    setSidebarOpen(false)
    setHoveredChatId(null)
    setMobileActionsChatId(null)
    setEditingChatId(null)
    setDraftTitle('')
    setPendingDeleteChatId(null)
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f7f3ef',
      fontFamily: 'Inter, sans-serif',
      color: '#0a0a0a',
      position: 'relative',
    }}>
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 240,
        background: '#FFFDF5',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column',
        padding: '1.25rem 1rem', gap: '1.5rem',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 300,
        boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.08)' : 'none',
      }}>
        <span
          onClick={() => { setSidebarOpen(false); onHome() }}
          style={{ cursor: 'pointer', display: 'inline-block' }}
        >
          <Logo />
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <p style={{
            fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em',
            color: '#999', textTransform: 'uppercase', margin: '0 0 0.75rem',
          }}>Recent chats</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {recentChats.map(c => {
              const showActions = (!isMobile && hoveredChatId === c.id) || (isMobile && mobileActionsChatId === c.id)
              const isEditing = editingChatId === c.id
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (isMobile) {
                      if (mobileActionsChatId === c.id) {
                        onSelectChat(c.id)
                        setSidebarOpen(false)
                        setMobileActionsChatId(null)
                        return
                      }
                      setMobileActionsChatId(c.id)
                      setHoveredChatId(null)
                      return
                    }
                    onSelectChat(c.id)
                    setSidebarOpen(false)
                    setMobileActionsChatId(null)
                  }}
                  onMouseEnter={() => !isMobile && setHoveredChatId(c.id)}
                  onMouseLeave={() => !isMobile && setHoveredChatId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem', borderRadius: 8,
                    background: c.id === chat.id ? 'rgba(229,215,11,0.15)' : 'transparent',
                    border: c.id === chat.id ? '1px solid rgba(229,215,11,0.3)' : '1px solid transparent',
                    fontSize: '0.82rem', color: '#333',
                    cursor: 'pointer', lineHeight: 1.4,
                    minHeight: 42,
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={e => setDraftTitle(e.target.value)}
                      onClick={e => {
                        e.stopPropagation()
                        e.preventDefault()
                      }}
                      onMouseDown={e => {
                        e.stopPropagation()
                        e.preventDefault()
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleRenameSave(c.id)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setEditingChatId(null)
                          setDraftTitle('')
                        }
                      }}
                      onBlur={() => {
                        const trimmed = draftTitle.trim()
                        if (!trimmed) {
                          setEditingChatId(null)
                          setDraftTitle('')
                          return
                        }
                        onRenameChat(c.id, trimmed)
                        setEditingChatId(null)
                        setDraftTitle('')
                      }}
                      style={{
                        width: '100%',
                        border: '1px solid rgba(0,0,0,0.18)',
                        borderRadius: 6,
                        background: '#fff',
                        padding: '0.35rem 0.5rem',
                        fontSize: '0.8rem',
                        color: '#0a0a0a',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <span style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{c.title}</span>
                  )}

                  {showActions && !isEditing && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        flexShrink: 0,
                        marginLeft: '0.25rem',
                      }}
                    >
                      <button
                        type="button"
                        className="chat-action-button"
                        aria-label="Rename chat"
                        onClick={e => {
                          e.stopPropagation()
                          setEditingChatId(c.id)
                          setDraftTitle(c.title)
                          setMobileActionsChatId(null)
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#0a0a0a',
                          borderRadius: 0,
                          padding: 0,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          width: 16,
                          height: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'none',
                          outline: 'none',
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ width: 16, height: 16 }}
                          aria-hidden="true"
                        >
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                          <path d="M14.06 6.19l3.75 3.75" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="chat-action-button"
                        aria-label="Delete chat"
                        onClick={e => {
                          e.stopPropagation()
                          e.preventDefault()
                          setPendingDeleteChatId(c.id)
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#0a0a0a',
                          borderRadius: 0,
                          padding: 0,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          width: 16,
                          height: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'none',
                          outline: 'none',
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ width: 16, height: 16 }}
                          aria-hidden="true"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M6 6l1 14h10l1-14" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 299,
            background: 'rgba(0,0,0,0.15)',
          }}
        />
      )}

      {pendingDeleteChatId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(10,10,10,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }} onClick={() => setPendingDeleteChatId(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(420px, calc(100vw - 2rem))',
              background: '#fffdf5',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 16,
              boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
              padding: '1.25rem 1.25rem 1rem',
            }}
          >
            <h3 style={{
              margin: '0 0 0.75rem',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#0a0a0a',
              fontFamily: 'Oxanium, sans-serif',
            }}>
              Delete chat?
            </h3>
            <p style={{
              margin: '0 0 1.1rem',
              color: '#444',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}>
              This action cannot be undone.
            </p>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
            }}>
              <button
                type="button"
                onClick={() => setPendingDeleteChatId(null)}
                style={{
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.14)',
                  borderRadius: 10,
                  color: '#111827',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '0.72rem 1.15rem',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tutorai-primary-button"
                onClick={() => handleDelete(pendingDeleteChatId)}
                style={{
                  borderRadius: 10,
                  padding: '0.72rem 1.15rem',
                  fontSize: '0.9rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  boxShadow: 'none',
                  minWidth: 88,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        height: '100vh',
      }}>
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(247,243,239,0.92)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          padding: '0.9rem 1.1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', gap: 5, color: '#333',
                width: 32, height: 32,
              }}
              aria-label="Open menu"
            >
              {[0,1,2].map(i => (
                <span key={i} style={{
                  display: 'block', width: 20, height: 2,
                  background: '#333', borderRadius: 2,
                }} />
              ))}
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Logo />
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexDirection: 'row-reverse', gap: '0.5rem' }}>
            <button
              onMouseEnter={() => setFolderHovered(true)}
              onMouseLeave={() => setFolderHovered(false)}
              onClick={() => setFolderClicked(fc => !fc)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              aria-label="Add to a subject"
            >
              {folderHovered || folderClicked ? (
                <svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4.5C1 3.4 1.9 2.5 3 2.5H9l2 2.5h11c1.1 0 2 .9 2 2v1H3.5" />
                  <path d="M1 8h22l-2.5 11H3.5L1 8z" />
                </svg>
              ) : (
                <svg width="26" height="22" viewBox="0 0 26 22" fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 5C1 3.9 1.9 3 3 3H9l2 2.5h11c1.1 0 2 .9 2 2v9.5c0 1.1-.9 2-2 2H3c-1.1 0-2-.9-2-2V5z" />
                </svg>
              )}
            </button>

            {folderClicked && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 10,
                padding: '0.35rem 0.85rem',
                fontSize: '0.82rem', fontFamily: '"Oxanium", sans-serif',
                fontWeight: 600, color: '#0a0a0a',
                cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              }}
                onClick={() => setFolderClicked(false)}
              >
                Add to a Subject
              </div>
            )}
          </div>
        </header>

        <main style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}>
          <div
            ref={messagesContainerRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              padding: '1.25rem clamp(1rem, 2.2vw, 2rem) 0.75rem',
            }}
          >
            <div style={{
              width: '100%',
              maxWidth: 980,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}>
              {chat.messages.map((message, index) => {
                const isUser = message.role === 'user'
                const bubbleRadius = isUser ? 32 : 36

                return (
                  <div
                    key={`${chat.id}-${index}`}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isUser ? '68%' : '72%',
                        width: 'fit-content',
                      }}
                    >
                      {isUser ? (
                        <div style={{
                          display: 'inline-block',
                          padding: '0.82rem 1.2rem',
                          background: 'rgba(229,215,11,0.28)',
                          border: '1px solid rgba(229,215,11,0.7)',
                          borderRadius: bubbleRadius,
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 500,
                          fontSize: '0.96rem',
                          lineHeight: 1.6,
                          color: '#0a0a0a',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}>
                          {message.content}
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-block',
                          padding: '0.95rem 1.2rem',
                          background: '#f5f2ee',
                          border: '1px solid rgba(0,0,0,0.08)',
                          borderRadius: bubbleRadius,
                          fontSize: '1rem',
                          lineHeight: 1.75,
                          color: '#1a1a1a',
                          maxWidth: '100%',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              p: ({ children }) => (
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.2rem' }}>{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol style={{ margin: '0.65rem 0 0', paddingLeft: '1.2rem' }}>{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li style={{ marginBottom: '0.25rem' }}>{children}</li>
                              ),
                              code: ({ children }) => (
                                <code style={{
                                  fontFamily: '"JetBrains Mono", monospace',
                                  background: 'rgba(0,0,0,0.06)',
                                  borderRadius: 6,
                                  padding: '0.1rem 0.3rem',
                                }}>{children}</code>
                              ),
                              pre: ({ children }) => (
                                <pre style={{
                                  margin: '0.75rem 0',
                                  overflowX: 'auto',
                                  background: 'rgba(0,0,0,0.04)',
                                  borderRadius: 12,
                                  padding: '0.8rem',
                                }}>{children}</pre>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    maxWidth: '72%',
                    display: 'inline-block',
                    padding: '0.95rem 1.2rem',
                    background: '#f5f2ee',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 36,
                    color: '#1a1a1a',
                    fontSize: '1rem',
                    lineHeight: 1.75,
                  }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => (
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</p>
                        ),
                      }}
                    >
                      tutorAi is thinking...
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        <div style={{
          padding: '0.75rem 1rem calc(0.9rem + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(247,243,239,0.94)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ width: '100%', maxWidth: 980, margin: '0 auto' }}>
            <InputBar value={followUp} onChange={setFollowUp} onSubmit={submit} placeholder="Follow up..." fullWidth />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ROOT — wires animation state and page navigation
// ============================================================

export default function App() {
  const [visible, setVisible]           = useState<boolean[]>(LETTERS.map(() => false))
  const [dotPos, setDotPos]             = useState<{ x: number; y: number } | null>(null)
  const [chats, setChats] = useState<Chat[]>(loadChats)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dotFalling, setDotFalling]     = useState(false)
  const [dotExpanded, setDotExpanded]   = useState(false)
  const [showYellow, setShowYellow]     = useState(false)
  const [contractClip, setContractClip] = useState(false)
  const [showPage, setShowPage         ] = useState(false)
  const [logoAt, setLogoAt]             = useState('64px 30px')
  const [currentPage, setCurrentPage]   = useState<'landing' | 'chat'>('landing')

  const [tx, setTx] = useState<{ active: boolean; clip: string; transition: string }>({ active: false, clip: '', transition: 'none' })

  const iRef    = useRef<HTMLSpanElement>(null)
  const logoRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
    } catch (error) {
      console.error('Could not save chats:', error)
    }
  }, [chats])

  useEffect(() => {
    const T: ReturnType<typeof setTimeout>[] = []

    LETTERS.forEach((l, i) => {
      T.push(setTimeout(() => {
        setVisible(prev => { const n = [...prev]; n[i] = true; return n })
      }, BASE_DELAY + l.delay))
    })

    const dotDropAt   = BASE_DELAY + 1950 + 900
    const dotExpandAt = dotDropAt + 800
    const expandDone  = dotExpandAt + 1400

    T.push(setTimeout(() => {
      if (iRef.current) {
        const r = iRef.current.getBoundingClientRect()
        setDotPos({ x: r.left + r.width / 2 - 15, y: r.top + r.height * 0.10 })
      }
    }, dotDropAt - 50))

    T.push(setTimeout(() => setDotFalling(true), dotDropAt))
    T.push(setTimeout(() => setDotExpanded(true), dotExpandAt))

    T.push(setTimeout(() => {
      if (logoRef.current) {
        const r = logoRef.current.getBoundingClientRect()
        setLogoAt(`${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`)
      }
      setShowYellow(true)
    }, expandDone))

    T.push(setTimeout(() => setShowPage(true), expandDone))
    T.push(setTimeout(() => setContractClip(true), expandDone + 50))

    return () => T.forEach(clearTimeout)
  }, [])

  const clipExpanded   = 'circle(200vmax at 50% 50%)'
  const clipContracted = `circle(0px at ${logoAt})`

  const askGemini = async (q: string, chatId: string, history: Message[] = []) => {
    setLoading(true)
    try {
      const response = await fetch('http://localhost:5050/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: q, history }),
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to get response'
        )
      }
      const answer = data && typeof data === 'object' && 'answer' in data && typeof data.answer === 'string'
        ? data.answer
        : ''
      if (!answer) throw new Error('Response did not include an answer')
      setChats(prev => prev.map(chat => chat.id === chatId
        ? { ...chat, messages: [...chat.messages, { role: 'assistant', content: answer }], updatedAt: Date.now() }
        : chat
      ))
    } catch (error) {
      console.error('tutorAi Error:', error)
      setChats(prev => prev.map(chat => chat.id === chatId
        ? { ...chat, messages: [...chat.messages, { role: 'assistant', content: ERROR_MESSAGE }], updatedAt: Date.now() }
        : chat
      ))
    } finally {
      setLoading(false)
    }
  }

  const handleFollowUp = async (question: string) => {
    const q = question.trim()
    if (!q || !currentChatId || loading) return
    const chatId = currentChatId

    const existingChat = chats.find(chat => chat.id === chatId)
    const history = existingChat ? existingChat.messages : []

    setChats(prev => prev.map(chat => chat.id === chatId
      ? { ...chat, messages: [...chat.messages, { role: 'user', content: q }], updatedAt: Date.now() }
      : chat
    ))
    await askGemini(q, chatId, history)
  }

  const handleAsk = async (question: string) => {
    const q = question.trim()
    if (!q) return
    const now = Date.now()
    const chatId = createChatId()
    setChats(prev => [...prev, {
      id: chatId,
      title: createChatTitle(q),
      messages: [{ role: 'user', content: q }],
      createdAt: now,
      updatedAt: now,
    }])
    setCurrentChatId(chatId)
    await askGemini(q, chatId)

  // ⬇️ KEEP YOUR EXISTING ANIMATION CODE BELOW THIS

  const btn = document.querySelector<HTMLElement>('[data-send-btn]')
  const sendOrigin = btn
    ? (() => {
        const r = btn.getBoundingClientRect()
        return `${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`
      })()
    : '50% 62%'

  const questionOrigin = `${Math.round(window.innerWidth * 0.78)}px ${Math.round(window.innerHeight * 0.16)}px`

  setTx({
    active: true,
    clip: `circle(0px at ${sendOrigin})`,
    transition: 'none',
  })

  setTimeout(() =>
    setTx({
      active: true,
      clip: `circle(200vmax at ${sendOrigin})`,
      transition: 'clip-path 0.55s cubic-bezier(0.4,0,0.2,1)',
    }),
    30
  )

  setTimeout(() => {
    setCurrentPage('chat')
    setTx({
      active: true,
      clip: `circle(200vmax at ${questionOrigin})`,
      transition: 'none',
    })
  }, 640)

  setTimeout(() =>
    setTx({
      active: true,
      clip: `circle(0px at ${questionOrigin})`,
      transition: 'clip-path 0.65s cubic-bezier(0.4,0,0.2,1)',
    }),
    680
  )

  setTimeout(
    () => setTx({ active: false, clip: '', transition: 'none' }),
    1400
  )
}

  const handleRenameChat = (id: string, title: string) => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    setChats(prev => prev.map(chat => chat.id === id
      ? { ...chat, title: trimmedTitle, updatedAt: Date.now() }
      : chat
    ))
  }

  const handleDeleteChat = (id: string) => {
    const remainingChats = chats.filter(chat => chat.id !== id)

    if (currentChatId === id) {
      const nextRecentChat = [...remainingChats].sort((a, b) => b.updatedAt - a.updatedAt)[0]

      if (nextRecentChat) {
        setCurrentChatId(nextRecentChat.id)
      } else {
        setCurrentChatId(null)
        setCurrentPage('landing')
      }
    }

    setChats(remainingChats)
  }

  const currentChat = chats.find(chat => chat.id === currentChatId)

  return (
    <>
      <AnimationPage
        iRef={iRef} showYellow={showYellow} visible={visible}
        dotPos={dotPos} dotFalling={dotFalling} dotExpanded={dotExpanded}
        contractClip={contractClip} clipExpanded={clipExpanded} clipContracted={clipContracted}
      />

      <div style={{ opacity: showPage ? 1 : 0, transition: 'opacity 0.5s ease' }}>
        {currentPage === 'landing' && (
          <LandingPage logoRef={logoRef} onAsk={handleAsk} />
        )}
        {currentPage === 'chat' && currentChat && (
          <ChatPage
            chat={currentChat}
            chats={chats}
            loading={loading}
            onFollowUp={handleFollowUp}
            onSelectChat={setCurrentChatId}
            onHome={() => setCurrentPage('landing')}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
          />
        )}
      </div>

      {/* Page transition overlay — yellow circle zooms out then zooms in */}
      {tx.active && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgb(229,215,11)',
          clipPath: tx.clip,
          transition: tx.transition,
          pointerEvents: 'none',
        }} />
      )}
    </>
  )
}
