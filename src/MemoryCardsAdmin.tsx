// ─── Öğretmen paneli: Unutmama kartları (kart bankası) ───────────────────────
// Öğrencileri yönet ekranından açılır. Kartları listeler, arar, düzenler,
// ekler/siler; Sheets'ten kopyalanan satırları toplu ekler; kartları
// öğrencilere (ve öğretmenin kendisine) atar; Excel'e indirir; bir kişi
// seçilince o kişinin hangi kartlarda zorlandığını gösterir.
// Bu bölüm ileride (Paket 2) öğrenci başına tek yönetim ekranına sökülmeden
// takılacak: kişi seçimi dışarıdan verilebilir (initialPersonId).

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  bankAssign, bankDeleteCards, bankLoadAll, bankRenameCard, bankUnassign, bankUpsertCards,
} from './memoryStore'
import type { BankAssignment, BankCard, BankPerson, BankProgress } from './memoryStore'
import { STAGE_LABELS, fmtDateTime } from './unutmamaLogic'
import { normalizeMemoryDate } from './memoryShared'

// ── Sütunlar (My Memory Cards tablosundaki sırayla) ──────────────────────────
type ColKey = 'id' | 'card_type' | 'topic' | 'source_item_no' | 'source' | 'question' | 'answer' | 'alternatives' | 'note' | 'added_on' | 'neuron' | 'kind'
const COLS: { key: ColKey; label: string; match: (h: string) => boolean }[] = [
  { key: 'id', label: 'ID', match: h => h === 'id' },
  { key: 'card_type', label: 'Kart tipi', match: h => h.startsWith('kart tipi') },
  { key: 'topic', label: 'Konu', match: h => h === 'konu' },
  { key: 'source_item_no', label: 'Kaynak madde no', match: h => h.startsWith('kaynak madde') },
  { key: 'source', label: 'Kaynak', match: h => h === 'kaynak' },
  { key: 'question', label: 'Soru (Türkçe, kartta görünür)', match: h => h.startsWith('soru') },
  { key: 'answer', label: 'Cevap (İngilizce)', match: h => h.startsWith('cevap') },
  { key: 'alternatives', label: 'Kabul edilen alternatifler', match: h => h.startsWith('kabul') },
  { key: 'note', label: 'Not (kartta görünmez)', match: h => h === 'not' || h.startsWith('not ') || h.startsWith('not(') },
  { key: 'added_on', label: 'Eklenme tarihi', match: h => h.startsWith('eklenme') },
  { key: 'neuron', label: 'Nöron adı', match: h => h.startsWith('nöron') || h.startsWith('noron') },
  { key: 'kind', label: 'Tür', match: h => h === 'tür' || h === 'tur' || h.startsWith('tür ') || h.startsWith('tur ') },
]
const SHORT_LABEL: Record<ColKey, string> = {
  id: 'ID', card_type: 'Kart tipi', topic: 'Konu', source_item_no: 'Kaynak madde no', source: 'Kaynak',
  question: 'Soru', answer: 'Cevap', alternatives: 'Kabul edilen alternatifler', note: 'Not',
  added_on: 'Eklenme tarihi', neuron: 'Nöron adı', kind: 'Tür',
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toKind(raw: string): 'word' | 'structure' {
  const s = raw.trim().toLowerCase()
  return s === 'word' || s === 'kelime' ? 'word' : 'structure'
}
function nextIdFrom(ids: Iterable<string>): () => string {
  let max = 0
  for (const id of ids) { const m = /^K(\d+)$/i.exec(id); if (m) max = Math.max(max, +m[1]) }
  return () => { max++; return 'K' + String(max).padStart(3, '0') }
}
const trLower = (s: string) => s.toLocaleLowerCase('tr-TR')
// Başlık eşleştirme: Türkçe kuralında "ID" → "ıd" olur; noktasız ı da i sayılır.
const headNorm = (s: string) => s.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')

// Sheets'ten kopyalanan metin: sekmeyle ayrılmış; birden çok satırlı hücreler tırnak içinde gelir.
function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  let atCellStart = true
  const t = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
      continue
    }
    if (ch === '"' && atCellStart) { q = true; atCellStart = false; continue }
    if (ch === '\t') { row.push(cur); cur = ''; atCellStart = true; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cur); cur = ''; rows.push(row); row = []; atCellStart = true
      continue
    }
    cur += ch
    atCellStart = false
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

interface PasteResult { cards: BankCard[]; newCount: number; updCount: number; problems: string[] }

function parsePasted(text: string, existing: BankCard[]): PasteResult {
  const rows = parseTsv(text)
  const problems: string[] = []
  if (!rows.length) return { cards: [], newCount: 0, updCount: 0, problems: ['Yapıştırılan metinde satır bulunamadı.'] }
  const head = rows[0].map(headNorm)
  const hasHeader = head.some(h => h === 'id') && head.some(h => h.startsWith('soru'))
  // sütun numarası → alan adı (ya da ek sütunun başlığı)
  const map: ({ key: ColKey } | { extra: string })[] = []
  if (hasHeader) {
    rows[0].forEach((raw, i) => {
      const col = COLS.find(c => c.match(head[i]))
      map.push(col && !map.some(m => 'key' in m && m.key === col.key) ? { key: col.key } : { extra: raw.trim() || `Sütun ${i + 1}` })
    })
  } else {
    const width = Math.max(...rows.map(r => r.length))
    for (let i = 0; i < width; i++) map.push(i < COLS.length ? { key: COLS[i].key } : { extra: `Sütun ${i + 1}` })
  }
  const byId = new Map(existing.map(c => [c.id, c]))
  const nextId = nextIdFrom(existing.map(c => c.id))
  let order = existing.reduce((m, c) => Math.max(m, c.sort_order), 0)
  const seen = new Set<string>()
  const out: BankCard[] = []
  let newCount = 0, updCount = 0
  rows.slice(hasHeader ? 1 : 0).forEach((r, ri) => {
    const lineNo = ri + (hasHeader ? 2 : 1)
    const v: Partial<Record<ColKey, string>> = {}
    const extra: Record<string, string> = {}
    map.forEach((m, i) => {
      const cell = (r[i] ?? '').replace(/\r\n?/g, '\n').trim()
      if ('key' in m) v[m.key] = cell
      else if (cell) extra[m.extra] = cell
    })
    if (!v.question || !v.answer) { problems.push(`${lineNo}. satır atlandı: soru ya da cevap boş.`); return }
    let id = (v.id || '').trim()
    if (id && seen.has(id)) { problems.push(`${lineNo}. satır atlandı: ${id} bu yapıştırmada iki kez var.`); return }
    if (!id) id = nextId()
    seen.add(id)
    const prev = byId.get(id)
    let added = normalizeMemoryDate(v.added_on || '')
    if (!added) {
      if (v.added_on) problems.push(`${lineNo}. satır: tarih okunamadı (${v.added_on}); ${prev ? 'eski tarih' : 'bugünün tarihi'} kullanıldı.`)
      added = prev ? prev.added_on : todayIso()
    }
    out.push({
      id,
      card_type: v.card_type || '',
      topic: v.topic || '',
      source_item_no: v.source_item_no || '',
      source: v.source || '',
      question: v.question,
      answer: v.answer,
      alternatives: v.alternatives || '',
      note: v.note || '',
      added_on: added,
      neuron: v.neuron || '',
      kind: toKind(v.kind || ''),
      extra: { ...(prev?.extra || {}), ...extra },
      sort_order: prev ? prev.sort_order : ++order,
    })
    if (prev) updCount++; else newCount++
  })
  return { cards: out, newCount, updCount, problems }
}

// ── Görünüm parçaları ────────────────────────────────────────────────────────
const card: CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
}
const input: CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.18)',
  fontSize: '16px', fontFamily: 'inherit', outline: 'none', background: '#fff', color: 'var(--foreground)',
  boxSizing: 'border-box',
}
const fieldLabel: CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)', margin: '0 0 6px 2px' }
const primaryBtn: CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px',
  padding: '11px 16px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const quietBtn: CSSProperties = {
  background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '10px',
  padding: '10px 14px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const GOOD = '#2F7D4F', MID = '#B7791F', BAD = '#B23A48'

function firstLine(s: string): string { return s.split('\n')[0] }

function CardEditor({ initial, isNew, takenIds, busy, onSave, onDelete, onCancel }: {
  initial: BankCard
  isNew: boolean
  takenIds: Set<string>
  busy: boolean
  onSave: (c: BankCard, oldId: string) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const [c, setC] = useState<BankCard>(initial)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k: keyof BankCard, v: string) => setC(x => ({ ...x, [k]: v }))
  const extraKeys = Object.keys(c.extra || {})

  function save() {
    const id = c.id.trim()
    if (!id) { setErr('ID boş olamaz.'); return }
    if (id !== initial.id && takenIds.has(id)) { setErr(`${id} başka bir kartta kullanılıyor.`); return }
    if (!c.question.trim() || !c.answer.trim()) { setErr('Soru ve cevap boş olamaz.'); return }
    setErr(null)
    onSave({ ...c, id, question: c.question.trim(), answer: c.answer.trim() }, initial.id)
  }

  const text = (k: ColKey, rows?: number) => {
    const col = COLS.find(x => x.key === k)!
    const val = String(c[k] ?? '')
    return (
      <div key={k}>
        <label style={fieldLabel}>{col.label}</label>
        {rows
          ? <textarea value={val} rows={rows} onChange={e => set(k, e.target.value)} style={{ ...input, resize: 'vertical', lineHeight: 1.4 }} />
          : <input value={val} onChange={e => set(k, e.target.value)} style={input} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 14px 16px' }}>
      {text('id')}
      {text('question', 3)}
      {text('answer', 3)}
      {text('alternatives', 2)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        {text('topic')}
        {text('neuron')}
        <div>
          <label style={fieldLabel}>Tür</label>
          <select value={c.kind} onChange={e => set('kind', e.target.value)} style={input}>
            <option value="structure">Yapı (structure)</option>
            <option value="word">Kelime (word)</option>
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Eklenme tarihi</label>
          <input type="date" value={c.added_on} onChange={e => set('added_on', e.target.value || todayIso())} style={input} />
        </div>
        {text('card_type')}
        {text('source')}
        {text('source_item_no')}
      </div>
      {text('note', 2)}
      {extraKeys.map(k => (
        <div key={'x' + k}>
          <label style={fieldLabel}>{k} (tablodaki ek sütun)</label>
          <input value={c.extra[k]} onChange={e => setC(x => ({ ...x, extra: { ...x.extra, [k]: e.target.value } }))} style={input} />
        </div>
      ))}
      {err && <p role="alert" style={{ margin: 0, fontSize: '14px', color: '#DC2626' }}>{err}</p>}
      {confirmDel ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#991B1B', lineHeight: 1.45 }}>
            Bu kart silinince atandığı herkesten kalkar ve o karttaki ilerlemeleri de silinir. Geri alınamaz.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => onDelete(initial.id)} disabled={busy} style={{ ...primaryBtn, background: '#DC2626' }}>Kartı sil</button>
            <button onClick={() => setConfirmDel(false)} disabled={busy} style={quietBtn}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{isNew ? 'Kartı ekle' : 'Kaydet'}</button>
          <button onClick={onCancel} disabled={busy} style={quietBtn}>Vazgeç</button>
          {!isNew && <button onClick={() => setConfirmDel(true)} disabled={busy} style={{ ...quietBtn, color: '#B91C1C', marginLeft: 'auto' }}>Sil</button>}
        </div>
      )}
    </div>
  )
}

function ResultDots({ p }: { p: BankProgress }) {
  const item = (color: string, n: number, label: string) => (
    <span title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <i style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, display: 'inline-block' }} />{n} {label}
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px 12px' }}>
      {item(GOOD, p.ok_count, 'çıkardı')}
      {item(MID, p.mid_count, 'zorlandı')}
      {item(BAD, p.bad_count, 'çıkaramadı')}
    </span>
  )
}

// ── Excel ────────────────────────────────────────────────────────────────────
async function downloadExcel(cards: BankCard[], assigns: BankAssignment[], progress: BankProgress[], people: BankPerson[]) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const nameOf = (id: string) => people.find(p => p.id === id)?.display_name || '?'
  const head = (cols: string[]) => cols.map(v => ({ value: v, fontWeight: 'bold' as const }))
  const extraKeys = Array.from(new Set(cards.flatMap(c => Object.keys(c.extra || {}))))
  const s1: any[][] = [head([...COLS.map(c => SHORT_LABEL[c.key]), ...extraKeys, 'Atananlar'])]
  for (const c of cards) {
    const who = assigns.filter(a => a.card_id === c.id).map(a => nameOf(a.student_id)).sort((a, b) => a.localeCompare(b, 'tr')).join(', ')
    s1.push([
      c.id, c.card_type, c.topic, c.source_item_no, c.source, c.question, c.answer, c.alternatives, c.note,
      c.added_on, c.neuron, c.kind, ...extraKeys.map(k => c.extra?.[k] ?? ''), who,
    ].map(v => (v === '' ? null : v)))
  }
  const s2: any[][] = [head(['Kişi', 'ID', 'Soru', 'Aralık', 'Son tekrar', 'Sıradaki tekrar', 'Tekrar sayısı', 'Çıkardı', 'Zorlandı', 'Çıkaramadı', 'Son sonuç'])]
  const resLabel: Record<string, string> = { ok: 'Çıkardı', mid: 'Zorlandı', bad: 'Çıkaramadı' }
  const assigned = new Set(assigns.map(a => a.student_id + '|' + a.card_id))
  progress
    .filter(p => assigned.has(p.student_id + '|' + p.card_id))
    .sort((a, b) => nameOf(a.student_id).localeCompare(nameOf(b.student_id), 'tr') || a.card_id.localeCompare(b.card_id))
    .forEach(p => {
      const c = cards.find(x => x.id === p.card_id)
      s2.push([nameOf(p.student_id), p.card_id, c ? firstLine(c.question) : '', STAGE_LABELS[p.stage] ?? '',
        fmtDateTime(Date.parse(p.last_at)), fmtDateTime(Date.parse(p.due_at)), p.review_count, p.ok_count, p.mid_count, p.bad_count,
        p.last_result ? resLabel[p.last_result] : null])
    })
  const w = (n: number) => ({ width: n })
  const blob: Blob = await (writeExcelFile as any)([
    { data: s1, sheet: 'Kartlar', stickyRowsCount: 1, columns: [w(8), w(14), w(22), w(10), w(22), w(44), w(44), w(30), w(30), w(12), w(24), w(10), ...extraKeys.map(() => w(18)), w(28)] },
    { data: s2, sheet: 'İlerleme', stickyRowsCount: 1, columns: [w(18), w(8), w(44), w(10), w(18), w(18), w(10), w(9), w(9), w(11), w(12)] },
  ]).toBlob()
  const name = `Unutmama_kartlari_${todayIso()}.xlsx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  return name
}

// ── Ana ekran ────────────────────────────────────────────────────────────────
export default function MemoryCardsAdmin({ onBack, initialPersonId = '' }: { onBack: () => void; initialPersonId?: string }) {
  const [data, setData] = useState<{ cards: BankCard[]; assignments: BankAssignment[]; progress: BankProgress[]; people: BankPerson[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'paste' | 'new'>('list')
  const [search, setSearch] = useState('')
  const [personId, setPersonId] = useState(initialPersonId)
  const [hardFirst, setHardFirst] = useState(true)
  const [onlyAssigned, setOnlyAssigned] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [pasteAssignTo, setPasteAssignTo] = useState('')

  async function reload() {
    setLoadError(null)
    try { setData(await bankLoadAll()) } catch { setLoadError('Kartlar okunamadı. İnternet bağlantını kontrol edip tekrar dene.') }
  }
  useEffect(() => { void reload() }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn() } catch (e: any) { setError('Kaydedilemedi. ' + (e?.message || '')) }
    setBusy(false)
  }

  const cards = data?.cards ?? []
  const people = useMemo(() => {
    const list = (data?.people ?? []).slice()
    return list.sort((a, b) => (a.role === b.role ? a.display_name.localeCompare(b.display_name, 'tr') : a.role === 'teacher' ? -1 : 1))
  }, [data])
  const personName = (id: string) => people.find(p => p.id === id)?.display_name || '?'
  const assignedBy = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of data?.assignments ?? []) { if (!m.has(a.card_id)) m.set(a.card_id, new Set()); m.get(a.card_id)!.add(a.student_id) }
    return m
  }, [data])
  const progressOf = useMemo(() => {
    const m = new Map<string, BankProgress>()
    for (const p of data?.progress ?? []) m.set(p.student_id + '|' + p.card_id, p)
    return m
  }, [data])
  const takenIds = useMemo(() => new Set(cards.map(c => c.id)), [cards])

  const q = trLower(search.trim())
  let shown = cards.filter(c => !q || [c.id, c.question, c.answer, c.alternatives, c.topic, c.neuron, c.source, c.card_type, c.note].some(x => trLower(x || '').includes(q)))
  const isAssigned = (cid: string) => !!personId && !!assignedBy.get(cid)?.has(personId)
  if (personId && onlyAssigned) shown = shown.filter(c => isAssigned(c.id))
  if (personId && hardFirst) {
    const score = (cid: string) => {
      const p = progressOf.get(personId + '|' + cid)
      if (!isAssigned(cid)) return -2
      if (!p) return -1
      return p.bad_count * 2 + p.mid_count + (p.last_result === 'bad' ? 5 : 0)
    }
    shown = shown.slice().sort((a, b) => score(b.id) - score(a.id) || a.sort_order - b.sort_order)
  }

  // Seçili kişinin özeti
  const now = Date.now()
  let sumAssigned = 0, sumDue = 0, sumLastBad = 0
  if (personId) for (const c of cards) {
    if (!isAssigned(c.id)) continue
    sumAssigned++
    const p = progressOf.get(personId + '|' + c.id)
    if (!p || Date.parse(p.due_at) <= now) sumDue++
    if (p?.last_result === 'bad') sumLastBad++
  }

  function toggleAssign(cid: string) {
    if (!personId) return
    const on = isAssigned(cid)
    void run(async () => {
      if (on) await bankUnassign(personId, [cid]); else await bankAssign(personId, [cid])
      await reload()
    })
  }
  function bulkAssign(assign: boolean) {
    if (!personId) return
    const ids = shown.map(c => c.id).filter(id => assign ? !isAssigned(id) : isAssigned(id))
    if (!ids.length) return
    void run(async () => {
      if (assign) await bankAssign(personId, ids); else await bankUnassign(personId, ids)
      await reload()
      setMessage(`${ids.length} kart ${personName(personId)} için ${assign ? 'atandı' : 'kaldırıldı'}.${assign ? '' : ' İlerlemesi silinmedi; yeniden atanırsa kaldığı yerden devam eder.'}`)
    })
  }
  function saveCard(c: BankCard, oldId: string) {
    void run(async () => {
      if (mode === 'new') await bankUpsertCards([c])
      else if (oldId !== c.id) await bankRenameCard(oldId, c)
      else await bankUpsertCards([c])
      await reload()
      setOpenId(null)
      if (mode === 'new') { setMode('list'); setMessage(`${c.id} eklendi.`) } else setMessage(`${c.id} kaydedildi.`)
    })
  }
  function deleteCard(id: string) {
    void run(async () => {
      await bankDeleteCards([id])
      await reload()
      setOpenId(null)
      setMessage(`${id} silindi.`)
    })
  }

  const paste = useMemo(() => (pasteText.trim() ? parsePasted(pasteText, cards) : null), [pasteText, cards])
  function savePaste() {
    if (!paste || !paste.cards.length) return
    void run(async () => {
      await bankUpsertCards(paste.cards)
      if (pasteAssignTo) await bankAssign(pasteAssignTo, paste.cards.map(c => c.id))
      await reload()
      setMessage(`${paste.newCount} yeni kart eklendi, ${paste.updCount} kart güncellendi${pasteAssignTo ? `; hepsi ${personName(pasteAssignTo)} için atandı` : ''}.`)
      setPasteText(''); setPasteAssignTo(''); setMode('list')
    })
  }
  function exportExcel() {
    if (!data) return
    void run(async () => {
      const name = await downloadExcel(data.cards, data.assignments, data.progress, people)
      setMessage(`${name} indirildi.`)
    })
  }

  const blankCard = (): BankCard => ({
    id: nextIdFrom(cards.map(c => c.id))(), card_type: '', topic: '', source_item_no: '', source: '', question: '', answer: '',
    alternatives: '', note: '', added_on: todayIso(), neuron: '', kind: 'structure', extra: {},
    sort_order: cards.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
          <button onClick={onBack} style={{ ...quietBtn, padding: '9px 14px', whiteSpace: 'nowrap', flexShrink: 0 }}>← Geri</button>
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--foreground)', textAlign: 'center' }}>Unutmama kartları</h1>
          <span style={{ flexShrink: 0, minWidth: '56px', textAlign: 'right', fontSize: '13px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{data ? `${cards.length} kart` : ''}</span>
        </div>

        {message && (
          <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '14px', lineHeight: 1.45 }}>
            <span style={{ flex: 1 }}>{message}</span>
            <button onClick={() => setMessage(null)} aria-label="Kapat" style={{ background: 'none', border: 'none', color: '#065F46', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}
        {error && <p role="alert" style={{ margin: '0 0 14px', fontSize: '14px', color: '#DC2626' }}>{error}</p>}

        {loadError && (
          <div style={{ ...card, padding: '16px', color: '#991B1B', fontSize: '14px' }}>
            <p style={{ margin: '0 0 10px' }}>{loadError}</p>
            <button onClick={() => void reload()} style={quietBtn}>Tekrar dene</button>
          </div>
        )}
        {!loadError && !data && <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>Kartlar yükleniyor…</p>}

        {data && mode === 'paste' && (
          <div style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Sheets'ten kart ekle</h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              Sheets'te satırları seçip kopyala, buraya yapıştır. Sütun sırası My Memory Cards'taki gibi olmalı:
              ID, Kart tipi, Konu, Kaynak madde no, Kaynak, Soru, Cevap, Kabul edilen alternatifler, Not, Eklenme tarihi, Nöron adı, Tür.
              Başlık satırını da kopyalarsan sıra önemli olmaz. ID'si olan kart zaten varsa güncellenir; ID boşsa yeni numara verilir.
            </p>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8} placeholder="Buraya yapıştır" style={{ ...input, fontSize: '14px', resize: 'vertical' }} />
            {paste && (
              <div style={{ fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                <b>{paste.cards.length}</b> kart okundu: {paste.newCount} yeni, {paste.updCount} güncellenecek.
                {paste.problems.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#B45309' }}>
                    {paste.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}
                    {paste.problems.length > 8 && <li>ve {paste.problems.length - 8} uyarı daha</li>}
                  </ul>
                )}
                {paste.cards.length > 0 && (
                  <div style={{ marginTop: '8px', maxHeight: '180px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 10px', background: '#fff' }}>
                    {paste.cards.slice(0, 30).map(c => (
                      <div key={c.id} style={{ fontSize: '13px', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        <b>{c.id}</b> {firstLine(c.question)} <span style={{ color: 'var(--muted-foreground)' }}>→ {firstLine(c.answer)}</span>
                      </div>
                    ))}
                    {paste.cards.length > 30 && <div style={{ fontSize: '13px', paddingTop: '4px', color: 'var(--muted-foreground)' }}>ve {paste.cards.length - 30} kart daha</div>}
                  </div>
                )}
              </div>
            )}
            <div>
              <label style={fieldLabel}>Eklenen kartları şu kişiye de ata (isteğe bağlı)</label>
              <select value={pasteAssignTo} onChange={e => setPasteAssignTo(e.target.value)} style={input}>
                <option value="">Kimseye atama</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={savePaste} disabled={busy || !paste || !paste.cards.length} style={{ ...primaryBtn, opacity: busy || !paste || !paste.cards.length ? 0.5 : 1 }}>{busy ? 'Kaydediliyor…' : 'Kartları kaydet'}</button>
              <button onClick={() => { setMode('list'); setPasteText('') }} disabled={busy} style={quietBtn}>Vazgeç</button>
            </div>
          </div>
        )}

        {data && mode === 'new' && (
          <div style={{ ...card, paddingTop: '12px' }}>
            <h2 style={{ margin: '0 14px 8px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Yeni kart</h2>
            <CardEditor initial={blankCard()} isNew takenIds={takenIds} busy={busy} onSave={saveCard} onDelete={() => {}} onCancel={() => setMode('list')} />
          </div>
        )}

        {data && mode === 'list' && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button onClick={() => { setMode('new'); setOpenId(null); setMessage(null) }} style={primaryBtn}>+ Kart ekle</button>
              <button onClick={() => { setMode('paste'); setOpenId(null); setMessage(null) }} style={quietBtn}>Sheets'ten yapıştır</button>
              <button onClick={exportExcel} disabled={busy || !cards.length} style={{ ...quietBtn, opacity: busy || !cards.length ? 0.5 : 1 }}>Excel'e indir</button>
            </div>

            <div style={{ ...card, padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={fieldLabel}>Kişi (seçince kartlarına atama yapılır ve durumu görünür)</label>
                <select value={personId} onChange={e => { setPersonId(e.target.value); setOpenId(null) }} style={input}>
                  <option value="">Bütün kartlar</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.display_name}{p.role === 'teacher' ? ' (kendi kartların)' : ''}</option>)}
                </select>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara: soru, cevap, konu, ID…" style={input} />
              {personId && (
                <>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                    {personName(personId)}: <b>{sumAssigned}</b> kart atanmış · <b>{sumDue}</b> kartın tekrar zamanı gelmiş · son tekrarda çıkaramadığı <b style={{ color: sumLastBad ? BAD : undefined }}>{sumLastBad}</b>
                  </p>
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '14px', color: 'var(--foreground)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={hardFirst} onChange={e => setHardFirst(e.target.checked)} /> En çok zorlandıkları üstte
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={onlyAssigned} onChange={e => setOnlyAssigned(e.target.checked)} /> Yalnızca atanmış kartlar
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => bulkAssign(true)} disabled={busy} style={{ ...quietBtn, fontSize: '14px' }}>Görünen kartların hepsini ata</button>
                    <button onClick={() => bulkAssign(false)} disabled={busy} style={{ ...quietBtn, fontSize: '14px' }}>Görünen kartlardan kaldır</button>
                  </div>
                </>
              )}
            </div>

            {busy && <p style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--muted-foreground)' }}>Kaydediliyor…</p>}

            {!cards.length && (
              <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', lineHeight: 1.5 }}>
                Henüz kart yok. “+ Kart ekle” ile tek tek ya da “Sheets'ten yapıştır” ile toplu ekleyebilirsin.
              </p>
            )}
            {cards.length > 0 && shown.length === 0 && (
              <p style={{ color: 'var(--muted-foreground)', fontSize: '14px' }}>Aramaya uyan kart yok.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shown.map(c => {
                const who = Array.from(assignedBy.get(c.id) ?? [])
                const assigned = isAssigned(c.id)
                const p = personId ? progressOf.get(personId + '|' + c.id) : undefined
                const open = openId === c.id
                return (
                  <div key={c.id} style={{ ...card, borderColor: p?.last_result === 'bad' && assigned ? '#E8A3AC' : 'var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'stretch' }}>
                      {personId && (
                        <button
                          onClick={() => toggleAssign(c.id)}
                          disabled={busy}
                          aria-pressed={assigned}
                          aria-label={assigned ? 'Atamayı kaldır' : 'Ata'}
                          title={assigned ? 'Atamayı kaldır' : 'Ata'}
                          style={{ width: '52px', flexShrink: 0, background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                        >
                          <span style={{
                            width: '24px', height: '24px', borderRadius: '7px', display: 'grid', placeItems: 'center',
                            border: assigned ? '2px solid var(--primary)' : '2px solid rgba(15,23,42,0.25)',
                            background: assigned ? 'var(--primary)' : '#fff', color: '#fff', fontSize: '15px', fontWeight: 700,
                          }}>{assigned ? '✓' : ''}</span>
                        </button>
                      )}
                      <button onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open} style={{
                        flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.35 }}>{firstLine(c.question)}{c.question.includes('\n') ? ' …' : ''}</div>
                        <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginTop: '2px', lineHeight: 1.35 }}>{firstLine(c.answer)}{c.answer.includes('\n') ? ' …' : ''}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                          <span>{c.id}</span>
                          {c.topic && <span>{c.topic}</span>}
                          {!personId && <span>{who.length ? who.map(personName).join(', ') : 'Kimseye atanmamış'}</span>}
                        </div>
                        {personId && assigned && (
                          <div style={{ fontSize: '13px', color: 'var(--foreground)', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {p ? (
                              <>
                                <ResultDots p={p} />
                                <span style={{ color: 'var(--muted-foreground)' }}>
                                  Aralık: {STAGE_LABELS[p.stage]} · sıradaki tekrar: {fmtDateTime(Date.parse(p.due_at))}
                                  {p.last_result === 'bad' && <b style={{ color: BAD }}> · son tekrarda çıkaramadı</b>}
                                </span>
                              </>
                            ) : <span style={{ color: 'var(--muted-foreground)' }}>Henüz tekrar etmedi.</span>}
                          </div>
                        )}
                      </button>
                    </div>
                    {open && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                        <CardEditor key={c.id} initial={c} isNew={false} takenIds={takenIds} busy={busy} onSave={saveCard} onDelete={deleteCard} onCancel={() => setOpenId(null)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
