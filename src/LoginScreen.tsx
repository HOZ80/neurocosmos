import { useState } from 'react'
import { signIn, AuthError, type Account } from './auth'

// ─── Giriş ekranı ──────────────────────────────────────────────────────────────
// Giriş adı + şifre. Bir kez girildikten sonra telefon hatırlar; öğrenci
// çıkış yapmadıkça bu ekranı bir daha görmez.
// Renkler kart ekranıyla (EntryScreen) aynı koyu palet.

const dark = {
  bg: '#0F0B1E', surface: '#1B1533', accent: '#7C5CFC', spark: '#4EEAC1',
  text: '#F2EFFA', textMuted: '#9C93B8', line: '#332C55', error: '#FF8A8A',
}

export default function LoginScreen({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const account = await signIn(loginName, password)
      onSignedIn(account)
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Giriş yapılamadı. Biraz sonra tekrar dene.')
      setBusy(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: '14px', border: `1px solid ${dark.line}`,
    background: dark.surface, color: dark.text, fontSize: '16px', outline: 'none', fontFamily: 'inherit',
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: '14px', fontWeight: 600, color: dark.textMuted, margin: '0 0 8px 4px',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '32px 20px', background: dark.bg,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&display=swap');
        .nc-login-input:focus { border-color: ${dark.accent} !important; box-shadow: 0 0 0 3px ${dark.accent}44; }
        .nc-login-btn:focus-visible { outline: 3px solid ${dark.spark}; outline-offset: 2px; }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'linear-gradient(135deg, #4F46E5, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 3.5c-1.8 0-3.2 1.3-3.4 3-1.4.4-2.4 1.7-2.4 3.2 0 .7.2 1.3.6 1.9-.5.6-.8 1.4-.8 2.2 0 1.6 1.1 2.9 2.6 3.3.1 1.7 1.5 3 3.2 3 .7 0 1.3-.2 1.8-.5" />
            <path d="M12 4.3v14.9" />
            <path d="M14.5 3.5c1.8 0 3.2 1.3 3.4 3 1.4.4 2.4 1.7 2.4 3.2 0 .7-.2 1.3-.6 1.9.5.6.8 1.4.8 2.2 0 1.6-1.1 2.9-2.6 3.3-.1 1.7-1.5 3-3.2 3-.7 0-1.3-.2-1.8-.5" />
            <path d="M9 8.7c.6.5 1.5.8 2 .8" />
            <path d="M15 8.7c-.6.5-1.5.8-2 .8" />
            <path d="M8 13.2c.6.4 1.3.6 2 .6" />
            <path d="M16 13.2c-.6.4-1.3.6-2 .6" />
          </svg>
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: dark.text }}>
          Neuro<span style={{ color: dark.accent }}>cosmos</span>
        </span>
      </div>

      <h1 style={{
        fontFamily: "'Baloo 2', var(--font-display)", fontWeight: 700,
        fontSize: 'clamp(24px, 5.5vw, 30px)', textAlign: 'center', margin: '0 0 28px',
        color: dark.text, maxWidth: '380px',
      }}>Merhaba! Hadi başlayalım</h1>

      <form
        onSubmit={e => { e.preventDefault(); submit() }}
        style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '18px' }}
      >
        <div>
          <label htmlFor="nc-login-name" style={label}>Giriş adın</label>
          <input
            id="nc-login-name"
            className="nc-login-input"
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={field}
          />
        </div>

        <div>
          <label htmlFor="nc-login-pw" style={label}>Şifren</label>
          <div style={{ position: 'relative' }}>
            <input
              id="nc-login-pw"
              className="nc-login-input"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...field, paddingRight: '84px' }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: dark.textMuted, fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', padding: '8px',
              }}
            >{showPw ? 'Gizle' : 'Göster'}</button>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, color: dark.error, fontSize: '14px', lineHeight: 1.45, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="nc-login-btn"
          disabled={busy}
          style={{
            marginTop: '4px', padding: '15px', borderRadius: '14px', border: 'none',
            background: dark.accent, color: '#fff', fontFamily: 'var(--font-display)',
            fontSize: '17px', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
    </div>
  )
}
