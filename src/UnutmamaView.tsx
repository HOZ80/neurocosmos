// Unutmama (tekrar) alanı — Kişisel (P) bölümünden açılır, hafıza beyniyle bağlıdır.
// Kartlar Google Sheets'ten (yayınlanmış CSV) okunur. İlerleme bu tarayıcıda tutulur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  STAGE_LABELS, buildMemoryItems, fmtDateTime, isDue, nextProgress, parseUnutCards,
} from './unutmamaLogic'
import type { UnutCard, UnutProgressMap, UnutResult } from './unutmamaLogic'
import type { MemoryItem } from './memoryShared'

// Memory sayfasındaki öğrenci seçiminde bu ad görünür (sadece Owner).
export const UNUTMAMA_STUDENT_NAME = 'Unutmama'

const PROGRESS_KEY = 'nc_unutmama_progress_v1'
const CARDS_CACHE_KEY = 'nc_unutmama_cards_v1'

function lsGet(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* sessiz */ } }

function readProgress(): UnutProgressMap {
  try {
    const p = JSON.parse(lsGet(PROGRESS_KEY) || '{}')
    return p && typeof p === 'object' ? p : {}
  } catch { return {} }
}

export type UnutStatus = 'loading' | 'ok' | 'error'
export interface UnutState {
  status: UnutStatus
  cards: UnutCard[]
  progress: UnutProgressMap
  dueCount: number
  memoryItems: MemoryItem[]
  grade: (id: string, result: UnutResult) => void
}

// enabled=false iken hiçbir şey yüklenmez (öğrenci profillerinde çalışmaz).
export function useUnutmama(csvUrl: string, enabled: boolean): UnutState {
  const [load, setLoad] = useState<{ status: UnutStatus; cards: UnutCard[] }>({ status: 'loading', cards: [] })
  const [progress, setProgress] = useState<UnutProgressMap>(() => readProgress())
  const [tick, setTick] = useState(0)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    if (!enabled || !csvUrl) return
    let cancelled = false
    const useCache = () => {
      try {
        const cached = JSON.parse(lsGet(CARDS_CACHE_KEY) || 'null') as UnutCard[] | null
        if (cached && cached.length) { if (!cancelled) setLoad({ status: 'ok', cards: cached }); return }
      } catch { /* önbellek bozuksa hata göster */ }
      if (!cancelled) setLoad({ status: 'error', cards: [] })
    }
    fetch(csvUrl, { cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error('bad status'); return res.text() })
      .then(text => {
        const cards = parseUnutCards(text)
        if (!cards.length) throw new Error('no cards')
        lsSet(CARDS_CACHE_KEY, JSON.stringify(cards))
        if (!cancelled) setLoad({ status: 'ok', cards })
      })
      .catch(useCache)
    return () => { cancelled = true }
  }, [csvUrl, enabled])

  // Sayaç dakikada bir kendini yeniler (sayfa açık kalırsa süresi gelen kartlar eklensin).
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setTick(x => x + 1), 60000)
    return () => clearInterval(t)
  }, [enabled])

  const grade = useCallback((id: string, result: UnutResult) => {
    const next = { ...progressRef.current, [id]: nextProgress(progressRef.current[id], result, Date.now()) }
    progressRef.current = next
    lsSet(PROGRESS_KEY, JSON.stringify(next))
    setProgress(next)
  }, [])

  const nowMs = Date.now()
  const dueCount = load.cards.filter(c => isDue(progress[c.id], nowMs)).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoryItems = useMemo(() => buildMemoryItems(load.cards, progress, Date.now()), [load.cards, progress, tick])

  return { status: load.status, cards: load.cards, progress, dueCount, memoryItems, grade }
}

// ─── Görünüm ─────────────────────────────────────────────────────────────────
const GOOD = '#2F7D4F'
const MID = '#B7791F'
const BAD = '#B23A48'

const mainBtn: CSSProperties = {
  width: '100%', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: '12px',
  padding: '13px', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
}

function numbered(line: string): { n: string | null; t: string } {
  const m = /^(\d+)\.\s*(.*)$/.exec(line)
  return m ? { n: m[1], t: m[2] } : { n: null, t: line }
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function QuestionBox({ card }: { card: UnutCard }) {
  const lines = card.soru.split('\n')
  return (
    <div style={{
      fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3, padding: '16px 18px',
      border: '2px solid var(--primary)', borderRadius: '14px', background: 'rgba(79,70,229,0.07)',
      color: 'var(--foreground)',
    }}>
      {lines.map((l, i) => {
        const x = numbered(l)
        const last = i === lines.length - 1
        return (
          <div key={i} style={last ? undefined : { paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px dashed var(--primary)' }}>
            {lines.length > 1 && x.n ? `${x.n}. ` : ''}{'\u201c'}{lines.length > 1 ? x.t : l}{'\u201d'}
          </div>
        )
      })}
    </div>
  )
}

function AnswerBox({ card }: { card: UnutCard }) {
  const main = card.cevap.split('\n')
  const alts = card.alt.split(' | ').map(s => s.trim()).filter(Boolean)
  const labelStyle: CSSProperties = { display: 'block', fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: '3px' }
  const rowStyle = (last: boolean): CSSProperties => last ? {} : { paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--border)' }
  const total = main.length + alts.length
  let idx = 0
  return (
    <div style={{ border: `2px solid ${GOOD}`, borderRadius: '14px', background: 'var(--card)', padding: '14px 18px' }}>
      {main.map((l, i) => {
        const x = numbered(l)
        idx++
        return (
          <div key={`m${i}`} style={rowStyle(idx === total)}>
            {main.length > 1 && x.n && <span style={labelStyle}>{x.n}</span>}
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem', color: 'var(--foreground)' }}>{x.t}</p>
          </div>
        )
      })}
      {alts.map((l, i) => {
        const x = numbered(l)
        idx++
        return (
          <div key={`a${i}`} style={rowStyle(idx === total)}>
            <span style={labelStyle}>{x.n ? `${x.n} · ` : ''}alternatif</span>
            <p style={{ margin: 0, fontWeight: 400, fontSize: '1.05rem', color: 'var(--muted-foreground)' }}>{x.t}</p>
          </div>
        )
      })}
    </div>
  )
}

const ICONS: Record<UnutResult, ReactElement> = {
  ok: <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>,
  mid: <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9c2.7-3 5.3-3 8 0s5.3 3 8 0M4 16c2.7-3 5.3-3 8 0s5.3 3 8 0" /></svg>,
  bad: <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
}
const BTN_META: { r: UnutResult; label: string; color: string }[] = [
  { r: 'ok', label: 'Çıkardım', color: GOOD },
  { r: 'mid', label: 'Zorlandım', color: MID },
  { r: 'bad', label: 'Çıkaramadım', color: BAD },
]

export function UnutmamaView({ unut }: { unut: UnutState }) {
  const { status, cards, progress, dueCount, grade } = unut
  const [openAns, setOpenAns] = useState(false)
  const [graded, setGraded] = useState<{ id: string; what: string } | null>(null)

  const cardsKey = cards.map(c => c.id).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => shuffled(cards), [cardsKey])
  const nowMs = Date.now()
  const current: UnutCard | null =
    (graded && cards.find(c => c.id === graded.id)) ||
    order.find(c => isDue(progress[c.id], nowMs)) || null

  function onGrade(r: UnutResult) {
    if (!current) return
    grade(current.id, r)
    const what = r === 'ok' ? 'Bir üst aralığa geçti.' : r === 'mid' ? 'Aynı aralıkta kaldı.' : 'Başa döndü.'
    setGraded({ id: current.id, what })
  }

  function nextCard() { setGraded(null); setOpenAns(false) }

  const header = (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '0 0 4px', color: 'var(--foreground)' }}>Unutmama</h1>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>
        {status === 'ok' ? <><b>{dueCount}</b> kart hazır</> : ' '}
      </p>
    </div>
  )

  let body: ReactElement
  if (status === 'loading') {
    body = <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>Kartlar yükleniyor…</p>
  } else if (status === 'error') {
    body = <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>Kartlar şu an okunamadı. İnternet bağlantını kontrol edip sayfayı yenile.</p>
  } else if (!current) {
    let nx: number | null = null
    cards.forEach(c => { const p = progress[c.id]; if (p && (nx === null || p.due < nx)) nx = p.due })
    body = (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Şu an tekrar edilecek kart yok.
        {nx !== null && <><br />Sıradaki tekrar: {fmtDateTime(nx)}</>}
      </div>
    )
  } else {
    const done = graded && graded.id === current.id
    const p = progress[current.id]
    body = (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <QuestionBox card={current} />
        {!openAns && !done && (
          <button type="button" style={mainBtn} onClick={() => setOpenAns(true)}>Cevabı göster</button>
        )}
        {(openAns || done) && (
          <>
            <AnswerBox card={current} />
            {!done && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '18px', marginTop: '2px' }}>
                {BTN_META.map(b => (
                  <button key={b.r} type="button" aria-label={b.label} title={b.label} onClick={() => onGrade(b.r)} style={{
                    width: '58px', height: '58px', border: 0, borderRadius: '18px', background: b.color, color: '#fff',
                    display: 'grid', placeItems: 'center', cursor: 'pointer',
                  }}>{ICONS[b.r]}</button>
                ))}
              </div>
            )}
            {done && p && (
              <>
                <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(79,70,229,0.08)', fontSize: '0.92rem', color: 'var(--foreground)' }}>
                  <b>{graded!.what}</b><br />
                  Sıradaki tekrar: {fmtDateTime(p.due)} ({STAGE_LABELS[p.stage]} sonra)
                </div>
                <button type="button" style={mainBtn} onClick={nextCard}>Sıradaki kart</button>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '620px' }}>
      {header}
      {body}
    </div>
  )
}

// P dashboard'unun üstündeki şerit: bugün kaç kart hazır.
export function UnutmamaStrip({ status, due, onClick }: { status: UnutStatus; due: number; onClick: () => void }) {
  const right = status === 'ok' ? `Tekrar: ${due}` : status === 'loading' ? '…' : 'yüklenemedi'
  return (
    <button type="button" onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
      padding: '12px 16px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
    }}>
      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Unutmama</span>
      <span style={{
        fontSize: '13px', fontWeight: 700, color: 'var(--primary)', background: 'rgba(79,70,229,0.08)',
        padding: '4px 12px', borderRadius: '999px',
      }}>{right}</span>
    </button>
  )
}
