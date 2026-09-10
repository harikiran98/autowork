import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  onAuthChange,
  requestPasswordRecovery,
  updateUser,
  type User,
} from '@netlify/identity'
import { setStorageNamespace } from '../api/client'

const LOCAL_USER_KEY = 'autowork:local-user'
const isLocal = () => ['localhost', '127.0.0.1'].includes(window.location.hostname)

export interface AutoworkUser {
  id: string
  email: string
  name: string
  local: boolean
}

function normalizeUser(user: User): AutoworkUser {
  const metadataName = typeof user.userMetadata?.full_name === 'string' ? user.userMetadata.full_name : ''
  return {
    id: user.id,
    email: user.email ?? 'member',
    name: user.name || metadataName || user.email?.split('@')[0] || 'Member',
    local: false,
  }
}

function BrandMark({ large = false }: { large?: boolean }) {
  return <div className={`relative grid shrink-0 place-items-center bg-[#101627] text-white shadow-2xl shadow-black/25 ${large ? 'h-16 w-16 rounded-[23px]' : 'h-11 w-11 rounded-[17px]'}`}>
    <span className={`${large ? 'text-[38px]' : 'text-[27px]'} font-bold tracking-[-0.09em]`}>a.</span>
    <span className={`absolute rounded-full bg-emerald-400 ring-[#101627] ${large ? 'bottom-2.5 right-2.5 h-2.5 w-2.5 ring-[3px]' : 'bottom-1.5 right-1.5 h-2 w-2 ring-2'}`} />
  </div>
}

function LoginArtwork() {
  const nodes = [
    [50, 50, 8], [25, 28, 4], [76, 25, 5], [20, 72, 5], [79, 76, 4],
    [51, 16, 3], [51, 84, 3], [8, 49, 3], [92, 50, 3],
  ]
  const edges = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[1,5],[1,7],[2,5],[2,8],[3,6],[3,7],[4,6],[4,8]]
  return <div className="relative hidden min-h-0 overflow-hidden bg-[#0b121a] lg:block">
    <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(75,205,180,.20), transparent 34%), radial-gradient(circle at 80% 72%, rgba(115,105,255,.25), transparent 38%)' }} />
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs><linearGradient id="auth-line"><stop stopColor="#55dec2" /><stop offset="1" stopColor="#8178ff" /></linearGradient></defs>
      {edges.map(([a,b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="url(#auth-line)" strokeWidth=".28" opacity=".42" />)}
      {nodes.map(([x,y,r], i) => <g key={i} className={i ? 'auth-node' : ''} style={{ animationDelay: `${i * -0.47}s` }}>
        <circle cx={x} cy={y} r={r * 1.8} fill={i ? '#6c63ff' : '#45cdb3'} opacity=".08" />
        <circle cx={x} cy={y} r={r} fill={i ? '#171f37' : '#153c3b'} stroke={i ? '#8c85ff' : '#59e0c7'} strokeWidth=".65" />
        <circle cx={x} cy={y} r={Math.max(1, r * .24)} fill="#eafffb" />
      </g>)}
    </svg>
    <div className="absolute inset-x-12 bottom-12 rounded-[28px] border border-white/10 bg-white/[.06] p-7 text-white backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Your intelligent workspace</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-.045em]">Ideas connect.<br />Agents get to work.</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">A living view of your AI team—from the people doing the work to the neural network connecting every task.</p>
    </div>
  </div>
}

type AuthMode = 'login' | 'forgot' | 'invite' | 'recovery'

function LoginPage({ mode: initialMode, token, onLogin }: { mode: AuthMode; token?: string; onLogin: (user: AutoworkUser) => void }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const title = mode === 'login' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : mode === 'invite' ? 'Join autowork' : 'Choose a new password'
  const subtitle = mode === 'login' ? 'Sign in to enter your agent workspace.' : mode === 'forgot' ? 'We’ll email you a secure recovery link.' : 'Set a password to finish securing your account.'

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      if (mode === 'forgot') {
        if (isLocal()) { setMessage('Password recovery is enabled after Netlify Identity is connected.'); return }
        await requestPasswordRecovery(email.trim())
        setMessage('Recovery email sent. You can close this tab after it arrives.')
      } else if (mode === 'invite') {
        if (!token) throw new Error('This invitation link is incomplete. Ask for a fresh invite.')
        if (password.length < 8) throw new Error('Use at least 8 characters.')
        if (password !== confirm) throw new Error('The passwords do not match.')
        onLogin(normalizeUser(await acceptInvite(token, password)))
      } else if (mode === 'recovery') {
        if (password.length < 8) throw new Error('Use at least 8 characters.')
        if (password !== confirm) throw new Error('The passwords do not match.')
        onLogin(normalizeUser(await updateUser({ password })))
      } else if (isLocal()) {
        if (!email.trim() || password.length < 8) throw new Error('Enter an email and an 8-character password for the local preview.')
        const localUser = { id: `local-${email.trim().toLowerCase()}`, email: email.trim(), name: email.trim().split('@')[0], local: true }
        sessionStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser)); onLogin(localUser)
      } else {
        onLogin(normalizeUser(await login(email.trim(), password)))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.')
    } finally { setBusy(false) }
  }

  return <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(420px,46%)_1fr]">
    <section className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-5 py-10 sm:px-10">
      <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
      <div className="relative z-10 w-full max-w-[430px]">
        <div className="mb-10 flex items-center gap-3"><BrandMark large /><div><p className="text-2xl font-bold tracking-[-.055em] text-ink">autowork</p><p className="text-xs text-ink-faint">Intelligent teams, beautifully connected.</p></div></div>
        <div className="rounded-[32px] border border-line bg-glass-strong p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[.17em] text-ink-faint">Private workspace</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.055em] text-ink">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{subtitle}</p>
          {isLocal() && mode === 'login' && <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-ink-soft"><strong className="text-ink">Local preview:</strong> use any email and any password with 8+ characters. Netlify enforces real accounts after deployment.</div>}
          <form onSubmit={submit} className="mt-7 space-y-4">
            {(mode === 'login' || mode === 'forgot') && <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Email address</span><input className="auth-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
            {mode !== 'forgot' && <label className="block"><span className="mb-2 flex items-center justify-between text-xs font-bold text-ink-soft"><span>{mode === 'login' ? 'Password' : 'New password'}</span>{mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }} className="font-semibold text-accent hover:underline">Forgot password?</button>}</span><span className="relative block"><input className="auth-input pr-14" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold text-ink-faint hover:bg-surface-2">{showPassword ? 'Hide' : 'Show'}</button></span></label>}
            {(mode === 'invite' || mode === 'recovery') && <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Confirm password</span><input className="auth-input" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
            {error && <p role="alert" className="rounded-2xl bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-600 dark:text-rose-300">{error}</p>}
            {message && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{message}</p>}
            <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-2xl bg-solid font-bold text-on-solid shadow-xl shadow-black/15 transition-transform hover:-translate-y-0.5 active:scale-[.99] disabled:cursor-wait disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Enter workspace' : mode === 'forgot' ? 'Send recovery link' : 'Set password & continue'}<span className="ml-2">→</span></button>
          </form>
          {mode === 'forgot' && <button onClick={() => { setMode('login'); setError(''); setMessage('') }} className="mt-5 w-full text-center text-xs font-bold text-ink-soft hover:text-ink">← Back to sign in</button>}
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-ink-faint">Access is invitation-only. Your workspace stays separate on this browser.</p>
      </div>
    </section>
    <LoginArtwork />
  </main>
}

export function AuthGate({ children }: { children: (user: AutoworkUser, signOut: () => Promise<void>) => ReactNode }) {
  const [user, setUser] = useState<AutoworkUser | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [token, setToken] = useState<string>()

  const authenticated = (next: AutoworkUser) => { setStorageNamespace(next.id); setUser(next); setReady(true) }

  useEffect(() => {
    let active = true
    const unsubscribe = onAuthChange((_event, next) => {
      if (!active) return
      if (next) authenticated(normalizeUser(next))
      else { setStorageNamespace('guest'); setUser(null); setReady(true) }
    })
    ;(async () => {
      try {
        if (isLocal()) {
          const saved = sessionStorage.getItem(LOCAL_USER_KEY)
          if (saved) authenticated(JSON.parse(saved))
          else setReady(true)
          return
        }
        const callback = await handleAuthCallback()
        if (callback?.type === 'invite') { setMode('invite'); setToken(callback.token); setReady(true); return }
        if (callback?.type === 'recovery') { setMode('recovery'); setReady(true); return }
        const existing = callback?.user ?? await getUser()
        if (existing) authenticated(normalizeUser(existing)); else setReady(true)
      } catch { setReady(true) }
    })()
    return () => { active = false; unsubscribe() }
  }, [])

  const signOut = async () => {
    if (user?.local) sessionStorage.removeItem(LOCAL_USER_KEY)
    else await logout()
    setStorageNamespace('guest'); setUser(null); setMode('login')
  }

  if (!ready) return <main className="grid min-h-dvh place-items-center bg-canvas"><div className="text-center"><BrandMark large /><p className="mt-5 text-sm font-semibold text-ink-soft">Opening autowork…</p></div></main>
  if (!user) return <LoginPage mode={mode} token={token} onLogin={authenticated} />
  return <>{children(user, signOut)}</>
}
