import { useEffect, useState } from 'react'
import { getAccessToken, normalizeLoginName } from './auth'

// ─── Öğretmen paneli: Öğrenciler ──────────────────────────────────────────────
// Öğrenci ekle, alan aç/kapat, şifre değiştir, pasife al / yeniden aç.
// Bütün işler Netlify'daki "ogrenci-yonetimi" görevinden geçer; o görev
// çağıranın öğretmen olduğunu her seferinde kendisi doğrular.

type StudentArea = 'A1' | 'A2' | 'child_omur' | 'child_oztug' | 'library'

interface Student {
  id: string
  loginName: string
  displayName: string
  areas: string[]
  active: boolean
}

const AREAS: { id: StudentArea; label: string }[] = [
  { id: 'A1', label: 'English Group A' },
  { id: 'A2', label: 'English Group B' },
  { id: 'child_omur', label: 'Ömür paneli' },
  { id: 'child_oztug', label: 'Öztuğ paneli' },
  { id: 'library', label: 'Kitaplık' },
]

async function call(islem: string, payload: Record<string, unknown> = {}): Promise<any> {
  const token = await getAccessToken().catch(() => null)
  if (!token) throw new Error('Oturumun sona erdi. Çıkış yapıp yeniden gir.')
  let res: Response
  try {
    res = await fetch('/.netlify/functions/ogrenci-yonetimi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ islem, ...payload }),
      cache: 'no-store',
    })
  } catch {
    throw new Error('İnternet bağlantısı yok gibi görünüyor.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.error) || 'İşlem yapılamadı.')
  return data
}

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
}
const input: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.18)',
  fontSize: '16px', fontFamily: 'inherit', outline: 'none', background: '#fff', color: 'var(--foreground)',
}
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)', margin: '0 0 6px 2px',
}
const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px',
  padding: '12px 18px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const quietBtn: React.CSSProperties = {
  background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '10px',
  padding: '11px 16px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

function AreaChips({ value, onToggle, disabled }: { value: string[]; onToggle: (a: StudentArea) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {AREAS.map(a => {
        const on = value.includes(a.id)
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(a.id)}
            style={{
              padding: '10px 14px', borderRadius: '100px', fontSize: '14px', fontWeight: 600,
              fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
              border: on ? '1.5px solid var(--primary)' : '1.5px solid rgba(15,23,42,0.15)',
              background: on ? 'rgba(79,70,229,0.10)' : '#fff',
              color: on ? 'var(--primary)' : 'var(--muted-foreground)',
              opacity: disabled ? 0.6 : 1,
            }}
          >{on ? '✓ ' : ''}{a.label}</button>
        )
      })}
    </div>
  )
}

function StudentRow({ s, open, onOpen, onChanged, onMessage }: {
  s: Student
  open: boolean
  onOpen: () => void
  onChanged: (list: Student[]) => void
  onMessage: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => { if (!open) { setError(null); setNewPw(''); setConfirmClose(false) } }, [open])

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn() } catch (e: any) { setError(e?.message || 'İşlem yapılamadı.') }
    setBusy(false)
  }

  function toggleArea(a: StudentArea) {
    const next = s.areas.includes(a) ? s.areas.filter(x => x !== a) : [...s.areas, a]
    run(async () => {
      const data = await call('alanlar', { id: s.id, alanlar: next })
      onChanged(data.students)
    })
  }

  function savePassword() {
    if (newPw.length < 6) { setError('Şifre en az 6 karakter olmalı.'); return }
    run(async () => {
      await call('sifre', { id: s.id, sifre: newPw })
      setNewPw('')
      onMessage(`${s.displayName} için şifre değiştirildi. Yeni şifreyi Keep'ine yazmayı unutma.`)
    })
  }

  function setActive(active: boolean) {
    run(async () => {
      const data = await call('aktif', { id: s.id, aktif: active })
      setConfirmClose(false)
      onChanged(data.students)
      onMessage(active ? `${s.displayName} yeniden açıldı.` : `${s.displayName} pasife alındı. Artık giriş yapamaz.`)
    })
  }

  const areaNames = AREAS.filter(a => s.areas.includes(a.id)).map(a => a.label)

  return (
    <div style={{ ...card, opacity: s.active ? 1 : 0.75 }}>
      <button
        onClick={onOpen}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
          background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
          background: s.active ? 'var(--primary)' : '#94A3B8', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px',
        }}>{(s.displayName[0] || '?').toLocaleUpperCase('tr-TR')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>
              {s.displayName}
            </span>
            {!s.active && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#B45309', background: '#FEF3C7', borderRadius: '100px', padding: '2px 8px' }}>
                Pasif
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '2px', overflowWrap: 'anywhere' }}>
            Giriş adı: {s.loginName}{areaNames.length ? ` · ${areaNames.join(', ')}` : ' · Açık alanı yok'}
          </div>
        </div>
        <span aria-hidden style={{ color: 'var(--muted-foreground)', fontSize: '18px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
      </button>

      {open && (
        <div style={{ padding: '4px 16px 18px', display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: '14px' }}>
            <span style={fieldLabel}>Girebildiği alanlar (dokununca hemen kaydedilir)</span>
            <AreaChips value={s.areas} onToggle={toggleArea} disabled={busy || !s.active} />
            {!s.active && <p style={{ margin: '8px 2px 0', fontSize: '13px', color: 'var(--muted-foreground)' }}>Alanları değiştirmek için önce hesabı yeniden aç.</p>}
          </div>

          <div>
            <label htmlFor={`pw-${s.id}`} style={fieldLabel}>Yeni şifre (en az 6 karakter)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id={`pw-${s.id}`}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                style={{ ...input, flex: 1, minWidth: 0 }}
              />
              <button onClick={savePassword} disabled={busy || !newPw} style={{ ...primaryBtn, opacity: busy || !newPw ? 0.5 : 1, flexShrink: 0 }}>
                Değiştir
              </button>
            </div>
          </div>

          <div>
            {s.active ? (
              confirmClose ? (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px' }}>
                  <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#991B1B', lineHeight: 1.45 }}>
                    {s.displayName} pasife alınınca giriş yapamaz. Kayıtları silinmez, istediğin zaman yeniden açabilirsin.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => setActive(false)} disabled={busy} style={{ ...primaryBtn, background: '#DC2626' }}>Pasife al</button>
                    <button onClick={() => setConfirmClose(false)} disabled={busy} style={quietBtn}>Vazgeç</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmClose(true)} disabled={busy} style={{ ...quietBtn, color: '#B91C1C' }}>
                  Pasife al
                </button>
              )
            ) : (
              <button onClick={() => setActive(true)} disabled={busy} style={primaryBtn}>Hesabı yeniden aç</button>
            )}
          </div>

          {busy && <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>Kaydediliyor…</p>}
          {error && <p role="alert" style={{ margin: 0, fontSize: '14px', color: '#DC2626' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

function NewStudentForm({ onDone, onCancel }: { onDone: (list: Student[], name: string, login: string) => void; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [loginName, setLoginName] = useState('')
  const [loginTouched, setLoginTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [areas, setAreas] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changeDisplayName(v: string) {
    setDisplayName(v)
    if (!loginTouched) setLoginName(normalizeLoginName(v).replace(/[^a-z0-9._-]/g, ''))
  }

  async function save() {
    setError(null)
    const login = normalizeLoginName(loginName)
    if (!displayName.trim()) { setError('Görünen adı yaz.'); return }
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(login)) { setError('Giriş adı 2-30 karakter olmalı; yalnızca harf, rakam, nokta, alt çizgi ve tire.'); return }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı.'); return }
    setBusy(true)
    try {
      const data = await call('ekle', { gorunenAd: displayName.trim(), girisAdi: login, sifre: password, alanlar: areas })
      onDone(data.students, displayName.trim(), login)
    } catch (e: any) {
      setError(e?.message || 'Öğrenci eklenemedi.')
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '19px', fontWeight: 700, color: 'var(--foreground)' }}>Yeni öğrenci</h2>
      <div>
        <label htmlFor="ns-name" style={fieldLabel}>Görünen ad (ekranda görünecek)</label>
        <input id="ns-name" value={displayName} onChange={e => changeDisplayName(e.target.value)} style={input} />
      </div>
      <div>
        <label htmlFor="ns-login" style={fieldLabel}>Giriş adı (öğrenci bunu yazacak)</label>
        <input
          id="ns-login"
          value={loginName}
          onChange={e => { setLoginTouched(true); setLoginName(e.target.value) }}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          style={input}
        />
      </div>
      <div>
        <label htmlFor="ns-pw" style={fieldLabel}>Şifre (en az 6 karakter)</label>
        <input id="ns-pw" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} style={input} />
      </div>
      <div>
        <span style={fieldLabel}>Girebileceği alanlar</span>
        <AreaChips value={areas} onToggle={a => setAreas(v => v.includes(a) ? v.filter(x => x !== a) : [...v, a])} disabled={busy} />
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: '14px', color: '#DC2626' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Ekleniyor…' : 'Öğrenciyi ekle'}</button>
        <button onClick={onCancel} disabled={busy} style={quietBtn}>Vazgeç</button>
      </div>
    </div>
  )
}

export default function StudentAdmin({ onClose }: { onClose: () => void }) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function load() {
    setLoadError(null)
    call('liste')
      .then(d => setStudents(d.students))
      .catch(e => setLoadError(e?.message || 'Öğrenci listesi okunamadı.'))
  }
  useEffect(load, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <button onClick={onClose} style={{ ...quietBtn, padding: '9px 14px' }}>← Geri</button>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--foreground)' }}>Öğrenciler</h1>
          <span style={{ width: '72px' }} />
        </div>

        {message && (
          <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', fontSize: '14px', lineHeight: 1.45 }}>
            <span style={{ flex: 1 }}>{message}</span>
            <button onClick={() => setMessage(null)} aria-label="Kapat" style={{ background: 'none', border: 'none', color: '#065F46', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {adding ? (
          <div style={{ marginBottom: '16px' }}>
            <NewStudentForm
              onCancel={() => setAdding(false)}
              onDone={(list, name, login) => {
                setStudents(list)
                setAdding(false)
                setMessage(`${name} eklendi. Giriş adı: ${login}. Şifreyi Keep'ine yazmayı unutma.`)
              }}
            />
          </div>
        ) : (
          <button onClick={() => { setAdding(true); setMessage(null) }} style={{ ...primaryBtn, width: '100%', marginBottom: '16px', padding: '14px' }}>
            + Yeni öğrenci ekle
          </button>
        )}

        {loadError && (
          <div style={{ ...card, padding: '16px', color: '#991B1B', fontSize: '14px' }}>
            <p style={{ margin: '0 0 10px' }}>{loadError}</p>
            <button onClick={load} style={quietBtn}>Tekrar dene</button>
          </div>
        )}

        {!loadError && !students && (
          <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>Öğrenciler yükleniyor…</p>
        )}

        {students && students.length === 0 && (
          <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>Henüz öğrenci yok. Yukarıdaki düğmeyle ilk öğrenciyi ekle.</p>
        )}

        {students && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {students.map(s => (
              <StudentRow
                key={s.id}
                s={s}
                open={openId === s.id}
                onOpen={() => setOpenId(id => id === s.id ? null : s.id)}
                onChanged={setStudents}
                onMessage={m => setMessage(m)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
