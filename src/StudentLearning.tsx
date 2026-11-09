// ─── Öğretmen: öğrencinin Öğrenme sayfası ─────────────────────────────────────
// Öğrencileri yönet > öğrenci > "Öğrenme sayfası". Tek öğrencinin her şeyi bir arada:
//  - Beyin: My Brain kayıtları (ekle, düzelt, sil, Sheets'ten yapıştır, Excel'e indir,
//    3B beyni gör). Yeni kayıt hep en sona eklenir; eski nöronların yeri değişmez.
//  - Unutmama: kart bankası bu öğrenci seçili olarak (atama, durum, zorlandıkları).
//  - Drill: konu konu ilerleme (yalnızca okunur; içerik Google tablosunda).
//  - Kitaplık: işaretlediği kelimeler; "Beyne ekle" bu sayfadaki beyne yazar.
// Bütün yazma işleri öğretmen yetkisiyle; güvenlik kuralları veritabanında.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  addBrainItems, deleteBrainItems, downloadBrainExcel, fetchBrain, parseBrainPaste, todayIso, updateBrainItem,
} from './brainStore'
import type { BrainRow } from './brainStore'
import { fmtDate } from './memoryShared'
import type { MemoryItem, MemStatus, MemType } from './memoryShared'
import { rest } from './memoryStore'

const MemoryCardsAdmin = lazy(() => import('./MemoryCardsAdmin'))
const KitaplikReport = lazy(() => import('./KitaplikReport'))
const MemoryBrain = lazy(() => import('./MemoryBrain'))

export interface LearningStudent { id: string; name: string; areas: string[] }

type Tab = 'brain' | 'cards' | 'drill' | 'library'

// ── Görünüm ──────────────────────────────────────────────────────────────────
const card: CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
}
const input: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.18)',
  fontSize: '16px', fontFamily: 'inherit', outline: 'none', background: '#fff', color: 'var(--foreground)',
}
const fieldLabel: CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)', margin: '0 0 6px 2px',
}
const primaryBtn: CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px',
  padding: '11px 16px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const quietBtn: CSSProperties = {
  background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '10px',
  padding: '10px 14px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const muted: CSSProperties = { margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.5 }

const STATUS: Record<MemStatus, { label: string; color: string; bg: string }> = {
  known: { label: 'Biliyor', color: '#9A6206', bg: '#FFF3DC' },
  learning: { label: 'Öğreniyor', color: '#0E6F7C', bg: '#DDF6F8' },
  fading: { label: 'Tekrar zamanı', color: '#4B4775', bg: '#ECEAF7' },
}
const DOT: Record<MemStatus, string> = { known: '#D08A10', learning: '#1597A8', fading: '#8A86A6' }
const TYPE_LABEL: Record<MemType, string> = { word: 'Kelime', structure: 'Yapı' }

function Chip({ status }: { status: MemStatus }) {
  const s = STATUS[status]
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '999px', background: s.bg, color: s.color, fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function Note({ kind, text, onClose }: { kind: 'ok' | 'err'; text: string; onClose?: () => void }) {
  const ok = kind === 'ok'
  return (
    <div role={ok ? 'status' : 'alert'} style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px', borderRadius: '12px', padding: '11px 14px', marginBottom: '12px', fontSize: '14px', lineHeight: 1.45,
      background: ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${ok ? '#A7F3D0' : '#FECACA'}`, color: ok ? '#065F46' : '#991B1B',
    }}>
      <span style={{ flex: 1 }}>{text}</span>
      {onClose && <button onClick={onClose} aria-label="Kapat" style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>}
    </div>
  )
}

// ── Beyin kaydı düzenleyici ──────────────────────────────────────────────────
function BrainEditor({ initial, isNew, busy, unitTitles, onSave, onDelete, onCancel }: {
  initial: MemoryItem
  isNew: boolean
  busy: boolean
  unitTitles: Record<string, string>
  onSave: (it: MemoryItem) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [f, setF] = useState<MemoryItem>(initial)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (patch: Partial<MemoryItem>) => setF(x => ({ ...x, ...patch }))
  const ok = f.item.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(f.date)
  const unitName = unitTitles[f.unit.trim()]
  return (
    <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={fieldLabel}>Kelime ya da yapı (öğrencinin göreceği şekilde)</label>
        <input value={f.item} onChange={e => set({ item: e.target.value })} autoComplete="off" spellCheck={false} style={input} autoFocus={isNew} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <div>
          <label style={fieldLabel}>Ünite ya da kitap kodu</label>
          <input value={f.unit} onChange={e => set({ unit: e.target.value })} placeholder="A1-U01" autoComplete="off" spellCheck={false} style={input} />
          {unitName && unitName !== f.unit.trim() && <p style={{ ...muted, fontSize: '12px', margin: '4px 2px 0' }}>{unitName}</p>}
        </div>
        <div>
          <label style={fieldLabel}>Tarih</label>
          <input type="date" value={f.date} onChange={e => set({ date: e.target.value })} style={input} />
        </div>
        <div>
          <label style={fieldLabel}>Tür</label>
          <select value={f.type} onChange={e => set({ type: e.target.value as MemType })} style={input}>
            <option value="word">Kelime</option>
            <option value="structure">Yapı</option>
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Durum</label>
          <select value={f.status} onChange={e => set({ status: e.target.value as MemStatus })} style={input}>
            <option value="known">Biliyor</option>
            <option value="learning">Öğreniyor</option>
            <option value="fading">Tekrar zamanı</option>
          </select>
        </div>
      </div>
      {!isNew && f.type !== initial.type && (
        <p style={{ ...muted, fontSize: '13px', color: '#B45309' }}>Türü değiştirmek bu kaydın beyindeki yerini değiştirir (kelimeler ve yapılar beynin farklı bölgelerinde).</p>
      )}
      {confirmDel ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '12px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#991B1B', lineHeight: 1.45 }}>
            “{initial.item}” beyinden silinsin mi? Bu kayıttan sonra eklenenlerin beyindeki yeri kayar.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={onDelete} disabled={busy} style={{ ...primaryBtn, background: '#DC2626' }}>Sil</button>
            <button onClick={() => setConfirmDel(false)} disabled={busy} style={quietBtn}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => onSave({ ...f, item: f.item.trim(), unit: f.unit.trim() })} disabled={busy || !ok} style={{ ...primaryBtn, opacity: busy || !ok ? 0.5 : 1 }}>
            {busy ? 'Kaydediliyor…' : isNew ? 'Beyne ekle' : 'Kaydet'}
          </button>
          <button onClick={onCancel} disabled={busy} style={quietBtn}>Vazgeç</button>
          {!isNew && <button onClick={() => setConfirmDel(true)} disabled={busy} style={{ ...quietBtn, color: '#B91C1C', marginLeft: 'auto' }}>Sil</button>}
        </div>
      )}
    </div>
  )
}

// ── Beyin sekmesi ────────────────────────────────────────────────────────────
function BrainTab({ student, rows, loadError, reload, unitTitles }: {
  student: LearningStudent
  rows: BrainRow[] | null
  loadError: boolean
  reload: () => Promise<void>
  unitTitles: Record<string, string>
}) {
  const [mode, setMode] = useState<'list' | 'new' | 'paste'>('list')
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [show3d, setShow3d] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn() } catch (e: any) { setError('Kaydedilemedi. ' + (e?.message || '')) }
    setBusy(false)
  }

  const list = rows ?? []
  const paste = useMemo(() => (pasteText.trim() ? parseBrainPaste(pasteText) : null), [pasteText])
  const q = search.trim().toLocaleLowerCase('tr-TR')
  const shown = list
    .map((r, i) => ({ r, n: i + 1 }))
    .filter(({ r }) => !q || r.item.toLocaleLowerCase('tr-TR').includes(q) || r.unit.toLocaleLowerCase('tr-TR').includes(q)
      || (unitTitles[r.unit] || '').toLocaleLowerCase('tr-TR').includes(q))
  const words = list.filter(r => r.type === 'word').length
  const count = (s: MemStatus) => list.filter(r => r.status === s).length
  const last = list[list.length - 1]

  const blank = (): MemoryItem => ({ unit: last?.unit ?? '', item: '', type: 'word', date: todayIso(), status: 'learning' })

  function saveNew(it: MemoryItem) {
    void run(async () => {
      await addBrainItems(student.id, [it])
      await reload()
      setMode('list')
      setMessage(`“${it.item}” beynin sonuna eklendi.`)
    })
  }
  function saveEdit(id: string, it: MemoryItem) {
    void run(async () => {
      await updateBrainItem(id, it)
      await reload()
      setOpenId(null)
      setMessage(`“${it.item}” kaydedildi.`)
    })
  }
  function remove(r: BrainRow) {
    void run(async () => {
      await deleteBrainItems([r.id])
      await reload()
      setOpenId(null)
      setMessage(`“${r.item}” beyinden silindi.`)
    })
  }
  function savePaste() {
    if (!paste || !paste.items.length) return
    void run(async () => {
      await addBrainItems(student.id, paste.items)
      await reload()
      const n = paste.items.length
      setPasteText(''); setMode('list')
      setMessage(`${n} kayıt beynin sonuna eklendi.`)
    })
  }
  function exportExcel() {
    void run(async () => {
      const name = await downloadBrainExcel(student.name, list, unitTitles)
      setMessage(`${name} indirildi.`)
    })
  }

  if (loadError && !rows) {
    return (
      <div style={{ ...card, padding: '16px', color: '#991B1B', fontSize: '14px' }}>
        <p style={{ margin: '0 0 10px' }}>Beyin okunamadı. İnternet bağlantını kontrol edip tekrar dene.</p>
        <button onClick={() => void reload()} style={quietBtn}>Tekrar dene</button>
      </div>
    )
  }
  if (!rows) return <p style={muted}>Beyin yükleniyor…</p>

  return (
    <div>
      {message && <Note kind="ok" text={message} onClose={() => setMessage(null)} />}
      {error && <Note kind="err" text={error} onClose={() => setError(null)} />}

      <div style={{ ...card, padding: '14px 16px', marginBottom: '12px' }}>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--foreground)' }}>
          <b>{list.length}</b> kayıt: {words} kelime, {list.length - words} yapı
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--muted-foreground)', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          {(['known', 'learning', 'fading'] as MemStatus[]).map(s => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i style={{ width: '9px', height: '9px', borderRadius: '50%', background: DOT[s], display: 'inline-block' }} />{count(s)} {STATUS[s].label.toLocaleLowerCase('tr-TR')}
            </span>
          ))}
        </p>
      </div>

      {mode === 'new' && (
        <div style={{ ...card, paddingTop: '12px', marginBottom: '12px' }}>
          <h2 style={{ margin: '0 14px 8px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Yeni kayıt</h2>
          <BrainEditor initial={blank()} isNew busy={busy} unitTitles={unitTitles} onSave={saveNew} onDelete={() => {}} onCancel={() => setMode('list')} />
        </div>
      )}

      {mode === 'paste' && (
        <div style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Sheets'ten yapıştır</h2>
          <p style={muted}>
            Sheets'te satırları seçip kopyala, buraya yapıştır. Sütun sırası eski hafıza tablosundaki gibi: unit_id, item, type, date, status.
            Başlık satırını da kopyalarsan sıra önemli olmaz. Tarih boşsa bugünün tarihi yazılır. Satırlar beynin sonuna, yapıştırdığın sırayla eklenir.
          </p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={7} placeholder="Buraya yapıştır" style={{ ...input, fontSize: '14px', resize: 'vertical' }} />
          {paste && (
            <div style={{ fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.5 }}>
              <b>{paste.items.length}</b> kayıt okundu.
              {paste.problems.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#B45309' }}>
                  {paste.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}
                  {paste.problems.length > 8 && <li>ve {paste.problems.length - 8} uyarı daha</li>}
                </ul>
              )}
              {paste.items.length > 0 && (
                <div style={{ marginTop: '8px', maxHeight: '180px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 10px', background: '#fff' }}>
                  {paste.items.slice(0, 40).map((it, i) => (
                    <div key={i} style={{ fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <b>{it.item}</b>
                      <span style={{ color: 'var(--muted-foreground)' }}>{TYPE_LABEL[it.type]} · {it.unit || 'ünitesiz'} · {fmtDate(it.date)}</span>
                      <Chip status={it.status} />
                    </div>
                  ))}
                  {paste.items.length > 40 && <div style={{ fontSize: '13px', paddingTop: '4px', color: 'var(--muted-foreground)' }}>ve {paste.items.length - 40} kayıt daha</div>}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={savePaste} disabled={busy || !paste || !paste.items.length} style={{ ...primaryBtn, opacity: busy || !paste || !paste.items.length ? 0.5 : 1 }}>
              {busy ? 'Ekleniyor…' : `Beyne ekle (${paste?.items.length ?? 0})`}
            </button>
            <button onClick={() => { setMode('list'); setPasteText('') }} disabled={busy} style={quietBtn}>Vazgeç</button>
          </div>
        </div>
      )}

      {mode === 'list' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button onClick={() => { setMode('new'); setOpenId(null); setMessage(null) }} style={primaryBtn}>+ Kayıt ekle</button>
            <button onClick={() => { setMode('paste'); setOpenId(null); setMessage(null) }} style={quietBtn}>Sheets'ten yapıştır</button>
            <button onClick={exportExcel} disabled={busy || !list.length} style={{ ...quietBtn, opacity: busy || !list.length ? 0.5 : 1 }}>Excel'e indir</button>
            <button onClick={() => setShow3d(v => !v)} aria-expanded={show3d} style={quietBtn}>{show3d ? 'Beyni kapat' : 'Beyni gör'}</button>
          </div>

          {show3d && (
            <div style={{ marginBottom: '14px' }}>
              <Suspense fallback={<p style={muted}>Beyin yükleniyor…</p>}>
                <MemoryBrain
                  students={[student.name]}
                  studentName={student.name}
                  onSelectStudent={() => {}}
                  items={list}
                  skipped={0}
                  showDiagnostics={false}
                  status="ok"
                  unitTitles={unitTitles}
                />
              </Suspense>
            </div>
          )}

          <p style={{ ...muted, fontSize: '13px', margin: '0 2px 10px' }}>
            Yeni kayıtlar beynin en sonuna eklenir; eski nöronların yeri değişmez. Bir kaydı silmek, ondan sonra eklenenlerin beyindeki yerini kaydırır. Durumu yalnızca sen belirlersin.
          </p>

          {list.length > 0 && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara: kelime, yapı, ünite…" style={{ ...input, marginBottom: '10px' }} />
          )}
          {busy && <p style={{ ...muted, margin: '0 0 10px' }}>Kaydediliyor…</p>}
          {!list.length && <p style={muted}>Beyni henüz boş. “+ Kayıt ekle” ile tek tek, “Sheets'ten yapıştır” ile toplu ekleyebilirsin; Kitaplık sekmesinden de kelime eklenebilir.</p>}
          {list.length > 0 && !shown.length && <p style={muted}>Aramaya uyan kayıt yok.</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shown.map(({ r, n }) => {
              const open = openId === r.id
              const uname = unitTitles[r.unit]
              return (
                <div key={r.id} style={card}>
                  <button onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', background: 'none', border: 'none',
                    padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ width: '30px', flexShrink: 0, fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'right' }}>{n}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: 'var(--foreground)', overflowWrap: 'anywhere' }}>
                        {r.item}
                      </span>
                      <span style={{ display: 'block', fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '3px', overflowWrap: 'anywhere' }}>
                        {TYPE_LABEL[r.type]} · {r.unit ? (uname && uname !== r.unit ? `${uname} (${r.unit})` : r.unit) : 'ünitesiz'} · {fmtDate(r.date)}
                      </span>
                    </span>
                    <Chip status={r.status} />
                  </button>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                      <BrainEditor key={r.id} initial={r} isNew={false} busy={busy} unitTitles={unitTitles}
                        onSave={it => saveEdit(r.id, it)} onDelete={() => remove(r)} onCancel={() => setOpenId(null)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Drill sekmesi (yalnızca okunur) ─────────────────────────────────────────
const DRILL_STAGES = ['8 saat', '1 gün', '2 gün', '1 hafta', '2 hafta', '1 ay', '3 ay']

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })
}

function DrillTab({ student, drillLabels }: { student: LearningStudent; drillLabels: Record<string, string> }) {
  const [state, setState] = useState<{
    status: 'loading' | 'ok' | 'error'
    progress: { unit_key: string; topic_id: string; review_stage: number; next_review: string | null; last_at: string | null }[]
    custom: { unit_key: string; topics: unknown; saved_at: string | null }[]
  }>({ status: 'loading', progress: [], custom: [] })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const sid = encodeURIComponent(student.id)
    Promise.all([
      rest(`drill_progress?student_id=eq.${sid}&select=unit_key,topic_id,review_stage,next_review,last_at&order=last_at.desc&limit=5000`).then(r => r.json()),
      rest(`drill_custom_topics?student_id=eq.${sid}&select=unit_key,topics,saved_at`).then(r => r.json()),
    ])
      .then(([progress, custom]) => { if (!cancelled) setState({ status: 'ok', progress, custom }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, status: 'error' })) })
    return () => { cancelled = true }
  }, [student.id, tick])

  if (state.status === 'loading') return <p style={muted}>Drill ilerlemesi yükleniyor…</p>
  if (state.status === 'error') {
    return (
      <div style={{ ...card, padding: '16px', color: '#991B1B', fontSize: '14px' }}>
        <p style={{ margin: '0 0 10px' }}>Drill ilerlemesi okunamadı.</p>
        <button onClick={() => { setState(s => ({ ...s, status: 'loading' })); setTick(t => t + 1) }} style={quietBtn}>Tekrar dene</button>
      </div>
    )
  }

  // Konu adları: önce Drill tablosundan, sonra öğrencinin elle eklediği konulardan
  const customLabels: Record<string, string> = {}
  const customByUnit = new Map<string, string[]>()
  for (const c of state.custom) {
    const names: string[] = []
    if (Array.isArray(c.topics)) {
      for (const t of c.topics as { id?: unknown; label?: unknown }[]) {
        const id = typeof t?.id === 'string' ? t.id : ''
        const label = typeof t?.label === 'string' ? t.label : ''
        if (id && label) customLabels[id] = label
        if (label) names.push(label)
      }
    }
    if (names.length) customByUnit.set(c.unit_key, names)
  }
  const label = (id: string) => drillLabels[id] || customLabels[id] || id

  const units = Array.from(new Set([...state.progress.map(p => p.unit_key), ...customByUnit.keys()]))
    .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }))
  if (!units.length) return <p style={muted}>{student.name} henüz Drill çalışmadı.</p>

  const now = Date.now()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ ...muted, fontSize: '13px' }}>Drill'in konuları ve soruları herkese aynı; Google tablosunda kalır. Burada yalnızca {student.name} adlı öğrencinin ilerlemesi görünür.</p>
      {units.map(u => {
        const rows = state.progress.filter(p => p.unit_key === u)
        const custom = customByUnit.get(u)
        return (
          <div key={u} style={{ ...card, padding: '14px 16px' }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--foreground)' }}>Ünite {u}</h3>
            {rows.length === 0 && <p style={muted}>Bu ünitede henüz tamamlanan konu yok.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {rows.map(p => {
                const due = p.next_review ? Date.parse(p.next_review) <= now : false
                const started = p.review_stage >= 0
                return (
                  <div key={p.topic_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', fontSize: '14px', color: 'var(--foreground)', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                    <b style={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{label(p.topic_id)}</b>
                    <span style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                      {started ? `${DRILL_STAGES[Math.min(p.review_stage, 6)]} aralığında` : 'henüz bir turu bitmedi'}
                      {p.last_at ? ` · son çalışma ${fmtDay(p.last_at)}` : ''}
                      {p.next_review ? ` · sıradaki tekrar ${fmtDay(p.next_review)}` : ''}
                    </span>
                    {due && <span style={{ fontSize: '12px', fontWeight: 700, color: '#9A6206', background: '#FFF3DC', borderRadius: '999px', padding: '1px 8px' }}>tekrar zamanı geldi</span>}
                  </div>
                )
              })}
            </div>
            {custom && (
              <p style={{ ...muted, fontSize: '13px', marginTop: '8px' }}>Elle eklediği konular: {custom.join(', ')}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sayfa ────────────────────────────────────────────────────────────────────
export default function StudentLearning({ student, onBack, unitTitles, drillLabels }: {
  student: LearningStudent
  onBack: () => void
  unitTitles: Record<string, string>
  drillLabels: Record<string, string>
}) {
  const [tab, setTab] = useState<Tab>('brain')
  const [rows, setRows] = useState<BrainRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const hasLibrary = student.areas.includes('library')

  async function reload() {
    setLoadError(false)
    try { setRows(await fetchBrain(student.id)) } catch { setLoadError(true) }
  }
  useEffect(() => { setRows(null); void reload() }, [student.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickTab(t: Tab) { setTab(t); window.scrollTo(0, 0) }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'brain', label: 'Beyin' },
    { id: 'cards', label: 'Unutmama' },
    { id: 'drill', label: 'Drill' },
    { id: 'library', label: 'Kitaplık' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <button onClick={onBack} style={{ ...quietBtn, padding: '9px 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>← Geri</button>
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--foreground)', textAlign: 'center', overflowWrap: 'anywhere' }}>
            {student.name}
          </h1>
          <span style={{ width: '72px', flexShrink: 0 }} />
        </div>

        <div role="tablist" aria-label="Öğrenme sayfası bölümleri" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '4px', marginBottom: '16px',
          background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '12px',
          position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5,
        }}>
          {tabs.map(t => {
            const on = tab === t.id
            return (
              <button key={t.id} role="tab" aria-selected={on} onClick={() => pickTab(t.id)} style={{
                font: 'inherit', fontSize: '14px', fontWeight: on ? 700 : 600, padding: '9px 4px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: on ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
              }}>
                {t.label}{t.id === 'brain' && rows ? ` (${rows.length})` : ''}
              </button>
            )
          })}
        </div>

        {tab === 'brain' && <BrainTab student={student} rows={rows} loadError={loadError} reload={reload} unitTitles={unitTitles} />}

        {tab === 'cards' && (
          <Suspense fallback={<p style={muted}>Kartlar yükleniyor…</p>}>
            <MemoryCardsAdmin onBack={onBack} initialPersonId={student.id} embedded />
          </Suspense>
        )}

        {tab === 'drill' && <DrillTab student={student} drillLabels={drillLabels} />}

        {tab === 'library' && (
          hasLibrary ? (
            <Suspense fallback={<p style={muted}>Kitaplık yükleniyor…</p>}>
              <KitaplikReport
                studentName={student.name}
                studentId={student.id}
                brainItems={rows ?? []}
                onAdd={async items => { await addBrainItems(student.id, items); await reload() }}
              />
            </Suspense>
          ) : (
            <p style={muted}>{student.name} adlı öğrencinin Kitaplık alanı açık değil. Alanı öğrenci listesinden açabilirsin.</p>
          )
        )}
      </div>
    </div>
  )
}
