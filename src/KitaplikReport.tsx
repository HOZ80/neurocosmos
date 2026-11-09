// ─── Kitaplık kelime raporu (yalnızca öğretmen ekranı) ───────────────────────
// Öğrencinin Kitaplık'ta Biliyorum / Öğreneceğim dediği kelimeler. Bu kelimeler
// öğrencinin beynine kendiliğinden GİTMEZ: öğretmen emin olduklarını seçer ve
// "Beyne ekle" der; seçilenler öğrencinin beyninin en sonuna eklenir.
// Karşılaşma: öğrencinin okuduğu sayfalarda kelimenin (çekimli halleri dahil)
// yaklaşık kaç kez geçtiği. Tamamlanan bölümler okunma sayısı kadar sayılır,
// yarıda kalan bölümde yalnızca açılan sayfalar sayılır.

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MemoryItem } from './memoryShared'
import { loadContent, buildFormIndex, findSpans, tokenize } from './readerData'
import type { Content } from './readerData'
import { loadBrainMarks, loadStudentData } from './readerStore'
import type { BrainMark, StudentData } from './readerStore'

function dayOf(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}
function trDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}` : ''
}
const norm = (s: string) => s.trim().toLocaleLowerCase('tr')

interface Row {
  key: string
  word: string
  meaning: string
  status: 'known' | 'learning'
  book: string        // kitap kodu
  bookTitle: string
  date: string        // YYYY-MM-DD (son işaret)
  seen: number        // yaklaşık karşılaşma
  inBrain: boolean
}

// Okunan sayfalarda her kelimenin kaç kez geçtiği
function countEncounters(content: Content, sd: StudentData): Map<string, number> {
  const index = buildFormIndex(content.vocab)
  const perPage = new Map<string, Map<string, number>>() // "kitap|bölüm|sayfa" → kelime → sayı
  for (const p of content.pages) {
    const m = new Map<string, number>()
    for (const s of p.sentences) for (const sp of findSpans(tokenize(s), index)) m.set(sp.entry.key, (m.get(sp.entry.key) ?? 0) + 1)
    perPage.set(`${p.book}|${p.section}|${p.page}`, m)
  }
  const total = new Map<string, number>()
  const add = (book: string, section: number, page: number, times: number) => {
    const m = perPage.get(`${book}|${section}|${page}`)
    if (m) m.forEach((n, k) => total.set(k, (total.get(k) ?? 0) + n * times))
  }
  // Tamamlanan bölüm okumaları
  const reads = new Map<string, number>()
  for (const r of sd.readings) reads.set(`${r.book_code}|${r.section_no}`, (reads.get(`${r.book_code}|${r.section_no}`) ?? 0) + 1)
  reads.forEach((times, bs) => {
    const [book, sec] = bs.split('|')
    for (const p of content.pages) if (p.book === book && p.section === +sec) add(book, p.section, p.page, times)
  })
  // Şu an okunan bölümde açılan sayfalar (bölüm bitmişse zaten yukarıda sayıldı)
  for (const st of sd.states) {
    if (reads.has(`${st.book_code}|${st.current_section}`)) continue
    for (const pg of st.visited_pages || []) add(st.book_code, st.current_section, pg, 1)
  }
  return total
}

export default function KitaplikReport({ studentName, studentId, brainItems, onAdd }: {
  studentName: string
  studentId: string
  brainItems: MemoryItem[]
  onAdd: (items: MemoryItem[]) => Promise<void>   // seçilenleri öğrencinin beynine ekler
}) {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; marks: BrainMark[]; sd: StudentData | null; content: Content | null }>(
    { status: 'loading', marks: [], sd: null, content: null })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', marks: [], sd: null, content: null })
    setPicked(new Set()); setAdded(null); setAddError(null)
    Promise.all([loadBrainMarks(studentId), loadStudentData(studentId), loadContent().catch(() => null)])
      .then(([marks, sd, content]) => { if (!cancelled) setState({ status: 'ok', marks, sd, content }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, status: 'error' })) })
    return () => { cancelled = true }
  }, [studentId])

  const rows: Row[] = useMemo(() => {
    const { marks, sd, content } = state
    const vocab = new Map<string, { word: string; meaning: string }>()
    const titles = new Map<string, string>()
    if (content) {
      content.vocab.forEach(v => { if (!vocab.has(v.key)) vocab.set(v.key, { word: v.word, meaning: v.meaning }) })
      content.books.forEach(b => titles.set(b.code, b.title || b.code))
    }
    const seen = content && sd ? countEncounters(content, sd) : new Map<string, number>()
    const brain = new Set(brainItems.map(i => norm(i.item)))
    return marks
      .filter(m => m.status === 'known' || m.status === 'learning')
      .map(m => {
        const v = vocab.get(m.word_key)
        const word = v?.word ?? m.word_key
        const book = m.first_book_code || ''
        return {
          key: m.word_key, word, meaning: v?.meaning ?? '', status: m.status, book,
          bookTitle: titles.get(book) ?? book, date: dayOf(m.updated_at || m.first_marked_at),
          seen: seen.get(m.word_key) ?? 0, inBrain: brain.has(norm(word)) || brain.has(norm(m.word_key)),
        }
      })
      .sort((a, b) => (a.inBrain === b.inBrain ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) : a.inBrain ? 1 : -1))
  }, [state, brainItems])

  const candidates = rows.filter(r => !r.inBrain)
  function toggle(k: string) {
    setAdded(null); setAddError(null)
    setPicked(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  function pickAll() {
    setAdded(null); setAddError(null)
    setPicked(p => (candidates.every(r => p.has(r.key)) ? new Set() : new Set(candidates.map(r => r.key))))
  }
  async function addToBrain() {
    const today = dayOf(new Date().toISOString())
    const sel = rows.filter(r => picked.has(r.key) && !r.inBrain)
    if (!sel.length || busy) return
    setBusy(true); setAddError(null)
    try {
      await onAdd(sel.map(r => ({ unit: r.book, item: r.word, type: 'word' as const, date: today, status: r.status })))
      setPicked(new Set())
      setAdded(sel.length)
    } catch {
      setAddError('Beyne eklenemedi. İnternet bağlantını kontrol edip tekrar dene.')
    }
    setBusy(false)
  }

  const chip = (bg: string, fg: string): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px',
    background: bg, color: fg, fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
  })
  const allPicked = candidates.length > 0 && candidates.every(r => picked.has(r.key))
  const pickedNew = rows.filter(r => picked.has(r.key) && !r.inBrain).length

  return (
    <section className="kr-root" style={{
      maxWidth: '620px', width: '100%', margin: '0 auto', background: '#FFFFFF', borderRadius: '22px',
      border: '1px solid #DDD8F5', padding: '18px 16px 20px', fontFamily: "'Nunito', system-ui, sans-serif", color: '#23204A',
      boxShadow: '0 1px 5px rgba(15,23,42,0.05)',
    }}>
      <h2 style={{ margin: '0 0 2px', fontSize: '1.2rem', fontWeight: 800 }}>📚 Kitaplık kelimeleri</h2>
      <p style={{ margin: '0 0 12px', fontSize: '.9rem', color: '#6B6890' }}>
        {studentName} Kitaplık'ta bu kelimeleri işaretledi. Bunlar beynine kendiliğinden gitmez. Emin olduklarını seç ve "Beyne ekle"ye bas; beyninin en sonuna eklenir.
      </p>

      {state.status === 'loading' && <p style={{ margin: 0, fontSize: '.9rem', color: '#6B6890' }}>Yükleniyor…</p>}
      {state.status === 'error' && <p style={{ margin: 0, fontSize: '.9rem', color: '#B42318' }}>Kitaplık kayıtları şu an okunamadı. Biraz sonra tekrar dene.</p>}
      {state.status === 'ok' && rows.length === 0 && (
        <p style={{ margin: 0, fontSize: '.9rem', color: '#6B6890' }}>Henüz işaretlenmiş kelime yok.</p>
      )}

      {state.status === 'ok' && rows.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <button type="button" onClick={pickAll} disabled={candidates.length === 0} style={{
              font: 'inherit', fontWeight: 700, fontSize: '.85rem', padding: '7px 14px', borderRadius: '999px',
              border: '1.5px solid #B9B2E6', background: '#FFFFFF', color: '#23204A', cursor: candidates.length ? 'pointer' : 'default',
              opacity: candidates.length ? 1 : 0.5,
            }}>{allPicked ? 'Seçimi kaldır' : 'Beyninde olmayanların hepsini seç'}</button>
            <button type="button" onClick={addToBrain} disabled={pickedNew === 0 || busy} style={{
              font: 'inherit', fontWeight: 800, fontSize: '.85rem', padding: '7px 16px', borderRadius: '999px',
              border: 'none', background: pickedNew && !busy ? '#6A4CE0' : '#CFCAE8', color: '#FFFFFF', cursor: pickedNew && !busy ? 'pointer' : 'default',
            }}>{busy ? 'Ekleniyor…' : `Beyne ekle (${pickedNew})`}</button>
          </div>
          {added !== null && (
            <p role="status" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: '12px', background: '#E7F8EE', color: '#156A3A', fontSize: '.85rem', fontWeight: 700 }}>
              ✓ {added} kelime {studentName} adlı öğrencinin beynine eklendi.
            </p>
          )}
          {addError && (
            <p role="alert" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: '12px', background: '#FDEEE8', color: '#A2401F', fontSize: '.85rem', fontWeight: 700 }}>
              {addError}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map(r => {
              const on = picked.has(r.key)
              return (
                <label key={r.key} style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '14px',
                  border: `1.5px solid ${on ? '#6A4CE0' : '#E6E2F7'}`, background: on ? '#F4F1FF' : r.inBrain ? '#FAFAFC' : '#FFFFFF',
                  cursor: 'pointer', opacity: r.inBrain && !on ? 0.75 : 1,
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r.key)} style={{ marginTop: '4px', width: '18px', height: '18px', accentColor: '#6A4CE0', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '1rem' }}>
                      {r.word}{r.meaning && <span style={{ fontWeight: 600, color: '#6B6890' }}> · {r.meaning}</span>}
                    </span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '5px', alignItems: 'center' }}>
                      {r.status === 'known'
                        ? <span style={chip('#FFF3DC', '#9A6206')}>Biliyorum dedi</span>
                        : <span style={chip('#DDF6F8', '#0E6F7C')}>Öğreneceğim dedi</span>}
                      <span title="Okuduğu sayfalarda yaklaşık kaç kez gördü" style={chip(r.seen < 8 ? '#FDEEE8' : '#E7F8EE', r.seen < 8 ? '#A2401F' : '#156A3A')}>
                        ≈ {r.seen} kez gördü
                      </span>
                      {r.inBrain && <span style={chip('#ECEAF7', '#4B4775')}>Beyninde var</span>}
                    </span>
                    <span style={{ display: 'block', marginTop: '4px', fontSize: '.8rem', color: '#6B6890' }}>
                      {r.bookTitle}{r.date ? ` · ${trDate(r.date)}` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: '.8rem', color: '#6B6890' }}>
            "Kez gördü": okuduğu sayfalarda kelimenin yaklaşık kaç kez geçtiği. Okuyarak kendiliğinden öğrenme için genelde 8–12 karşılaşma gerekir; 8'in altı turuncu görünür.
          </p>
        </>
      )}
    </section>
  )
}
