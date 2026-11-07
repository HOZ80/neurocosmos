// Unutmama (tekrar) alanı — kartlar ve ilerleme veritabanında (memoryStore.ts).
// Her hesap yalnızca kendisine atanmış kartları görür. Öğretmen (Owner) için
// kendi kartları; öğrenciler için öğretmenin atadıkları. İlerleme önce bu
// tarayıcıya yazılır, sonra veritabanına gönderilir (internet yoksa bekler).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import {
  STAGE_LABELS, buildMemoryItems, fmtDateTime, isDue, nextProgress,
} from './unutmamaLogic'
import type { UnutCard, UnutProgressMap, UnutResult } from './unutmamaLogic'
import type { MemoryItem } from './memoryShared'
import {
  addUnutPending, fetchMyCardProgress, fetchMyCards, flushUnutPending, legacyUnutPendingDone,
  legacyUnutRows, markLegacyUnutDone, mergeUnutProgress, pendingAsProgress, readUnutCache,
  readUnutPending, writeUnutCache,
} from './memoryStore'

// Memory sayfasındaki öğrenci seçiminde bu ad görünür (sadece Owner).
export const UNUTMAMA_STUDENT_NAME = 'Memory'

export type UnutStatus = 'loading' | 'ok' | 'error'
export interface UnutState {
  status: UnutStatus
  cards: UnutCard[]
  progress: UnutProgressMap
  dueCount: number
  memoryItems: MemoryItem[]
  grade: (id: string, result: UnutResult) => void
}

// accountId: giriş yapmış hesap. enabled=false iken hiçbir şey yüklenmez.
// migrateLegacy: bu tarayıcıdaki eski Unutmama kaydını (yalnızca öğretmenin
// kendi kartları için tutuluyordu) bir kereye mahsus veritabanına taşır.
export function useUnutmama(accountId: string | null, enabled: boolean, migrateLegacy = false): UnutState {
  const on = enabled && !!accountId
  const [load, setLoad] = useState<{ status: UnutStatus; cards: UnutCard[] }>({ status: 'loading', cards: [] })
  const [progress, setProgress] = useState<UnutProgressMap>({})
  const [tick, setTick] = useState(0)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const cardsRef = useRef<UnutCard[]>([])
  cardsRef.current = load.cards

  // Veritabanından tazele: kartlar + ilerleme; bekleyen (gönderilmemiş) kayıtlar üstte kalır.
  const refresh = useCallback(async (uid: string, isCancelled: () => boolean) => {
    await flushUnutPending(uid)
    try {
      const [cards, server] = await Promise.all([fetchMyCards(), fetchMyCardProgress(uid)])
      if (isCancelled()) return
      if (migrateLegacy && !legacyUnutPendingDone()) {
        const rows = legacyUnutRows(cards)
        if (rows.length) addUnutPending(uid, rows)
        const ok = await flushUnutPending(uid)
        if (ok) {
          markLegacyUnutDone(uid)
          if (rows.length) {
            const again = await fetchMyCardProgress(uid)
            if (isCancelled()) return
            Object.assign(server, again)
          }
        }
      }
      const merged = mergeUnutProgress(server, pendingAsProgress(readUnutPending(uid)))
      writeUnutCache(uid, cards, merged)
      setLoad({ status: 'ok', cards })
      setProgress(merged)
    } catch {
      if (isCancelled()) return
      setLoad(l => (l.status === 'ok' ? l : { status: 'error', cards: [] }))
    }
  }, [migrateLegacy])

  useEffect(() => {
    if (!on || !accountId) return
    let cancelled = false
    const isCancelled = () => cancelled
    // Önce bu tarayıcıdaki kopya (beklemeden görünsün), sonra veritabanı.
    const cache = readUnutCache(accountId)
    const cachedProgress = mergeUnutProgress(cache.progress, pendingAsProgress(readUnutPending(accountId)))
    setProgress(cachedProgress)
    setLoad(cache.cards ? { status: 'ok', cards: cache.cards } : { status: 'loading', cards: [] })
    void refresh(accountId, isCancelled)

    // Sayfa öne gelince ya da internet geri gelince: bekleyenleri gönder, tazele.
    const wake = () => { if (document.visibilityState === 'visible') void refresh(accountId, isCancelled) }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [on, accountId, refresh])

  // Sayaç dakikada bir kendini yeniler (sayfa açık kalırsa süresi gelen kartlar eklensin).
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setTick(x => x + 1), 60000)
    return () => clearInterval(t)
  }, [on])

  const grade = useCallback((id: string, result: UnutResult) => {
    if (!accountId) return
    const p = nextProgress(progressRef.current[id], result, Date.now())
    const next = { ...progressRef.current, [id]: p }
    progressRef.current = next
    setProgress(next)
    writeUnutCache(accountId, null, next)
    addUnutPending(accountId, [{ card_id: id, stage: p.stage, last: p.last, due: p.due, result }])
    void flushUnutPending(accountId)
  }, [accountId])

  const nowMs = Date.now()
  const dueCount = load.cards.filter(c => isDue(progress[c.id], nowMs)).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoryItems = useMemo(() => buildMemoryItems(load.cards, progress, Date.now()), [load.cards, progress, tick])

  if (!on) return { status: 'loading', cards: [], progress: {}, dueCount: 0, memoryItems: [], grade }
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
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '0 0 4px', color: 'var(--foreground)' }}>Memory</h1>
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

// P dashboard'unun üstündeki şerit: bugün kaç kart hazır. İçeriği kadar küçük, sağa yaslı.
export function UnutmamaStrip({ status, due, onClick }: { status: UnutStatus; due: number; onClick: () => void }) {
  const right = status === 'ok' ? `Tekrar: ${due}` : status === 'loading' ? '…' : 'yüklenemedi'
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" onClick={onClick} style={{
        display: 'inline-flex', alignItems: 'center', gap: '10px', textAlign: 'left',
        background: 'rgba(79,70,229,0.08)', border: '1px solid rgba(79,70,229,0.35)', borderRadius: '12px',
        padding: '7px 8px 7px 14px', cursor: 'pointer',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>Memory</span>
        <span style={{
          fontSize: '12px', fontWeight: 700, color: 'var(--primary)', background: '#fff',
          padding: '3px 10px', borderRadius: '999px',
        }}>{right}</span>
      </button>
    </div>
  )
}

// Çocuk panelinde My Brain kartının hemen altındaki küçük Memory kartı.
// Yalnızca çocuğa atanmış kart varsa görünür (App.tsx karar verir).
export function UnutmamaChildCard({ unut, onOpen }: { unut: UnutState; onOpen: () => void }) {
  const { status, cards, progress, dueCount } = unut
  let nextMs: number | null = null
  if (dueCount === 0) cards.forEach(c => { const p = progress[c.id]; if (p && (nextMs === null || p.due < nextMs)) nextMs = p.due })
  const sub: CSSProperties = { margin: '2px 0 0', fontSize: '13px', color: '#475569' }
  return (
    <button onClick={onOpen} style={{
      width: '100%', textAlign: 'left', background: '#FFFFFF', border: '1.5px solid #6A4CE033',
      borderRadius: '14px', padding: '11px 14px', margin: '-12px 0 22px',
      boxShadow: '0 1px 5px rgba(15,23,42,0.06)', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
          background: 'radial-gradient(circle at 50% 40%, #3B2F8F 0%, #1A1838 75%)',
          boxShadow: '0 0 0 1px #6A4CE055, 0 3px 10px rgba(106,76,224,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E9E4FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="7" y="4" width="13" height="16" rx="2.5" />
            <path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20" />
            <path d="M11 10.5h5M11 14h3" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Memory</p>
          {status !== 'ok' ? (
            <p style={sub}>{status === 'loading' ? 'Yükleniyor…' : 'Kartlar şu an okunamadı'}</p>
          ) : dueCount > 0 ? (
            <p style={{ ...sub, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#1597A8', display: 'inline-block' }} />
              {dueCount} kart seni bekliyor
            </p>
          ) : (
            <p style={sub}>Bugünlük tamam{nextMs !== null ? ` · sıradaki: ${fmtDateTime(nextMs)}` : ''}</p>
          )}
        </div>
        <span style={{ color: '#64748B', fontSize: '18px', flexShrink: 0 }}>→</span>
      </div>
    </button>
  )
}
