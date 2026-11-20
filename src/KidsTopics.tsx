// ─── Çocuk paneli: Konular / Yeni ve çocuk teması ─────────────────────────────
// Ömür ve Öztuğ'un paneli. İçerik A1/A2 ile AYNI tablolardan gelir:
//   Units tablosunda seviyesi "Çocuk" olan satırlar (kimlik C-U01, C-U02 …),
//   Grammar ve Drill tablolarında aynı kimlikle satırlar, kart kilitleri
//   aynı *_locked sütunlarından. Çocuğa özel sütunlar (Units):
//     cocuk      – kime görünür: omur / oztug / ikisi (boşsa ikisi)
//     tarih      – bu tarihten itibaren 14 gün "Yeni" bölümünde
//     kitap_kodu – doluysa konunun içinde Hikâye kartı (Kitaplık okuyucusu)
//     simge      – konunun simgesi (tek emoji)
//     renk       – turuncu / mavi / pembe / yeşil / mor / sarı
// Konu listesini App.tsx hazırlar (buildKidsTopics); bu dosya yalnızca gösterir
// ve öğrenci etkinliğine sayı yazar. Kırmızı hiçbir yerde kullanılmaz.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account } from './auth'
import type { UnutState } from './UnutmamaView'
import type { MemoryItem } from './memoryShared'
import ChildReaderApp from './Reader'
import { loadCachedContent } from './readerData'
import InstallButton from './InstallButton'
import { useActivityPlace, activityStat, activityMiss, bump } from './activityStore'

// ── Veri biçimleri ───────────────────────────────────────────────────────────
export type KState = 'ok' | 'locked' | 'empty' | 'loading'
export interface KSeg { start: number; end: number; text: string }
export interface KGrammarSlot { slot: number; label: string; blocks: { type: string; content: string }[] }
export interface KDrillItem { topicId: string; topicLabel: string; instruction: string; model?: string; cue: string; expected: string }
export interface KColor { main: string; dark: string; soft: string; line: string; ink: string; bg: string }

export interface KidsTopic {
  id: string
  index: number
  title: string
  subtitle: string
  icon: string
  color: KColor
  isNew: boolean
  date: number | null
  locked: boolean
  bookCode: string
  grammar: { state: KState; slots: KGrammarSlot[] }
  listen: { state: KState; url: string; segments: KSeg[] }
  dictation: { state: KState; url: string; segments: KSeg[] }
  shadowing: { state: KState; url: string; segments: KSeg[]; clips: string[] }
  drill: { state: KState; items: KDrillItem[] }
}

export type HintPart = { word: string; kind: 'ok' | 'hint' | 'mask' }
export interface KidsDeps {
  renderInline: (text: string) => ReactNode[]
  answerHint: (expected: string, typed: string) => { allOk: boolean; parts: HintPart[]; extra: boolean; target: string }
  showExpected: (expected: string) => string
}

// ── Yardımcılar (App.tsx de kullanır) ───────────────────────────────────────
export function normTr(s: string | undefined): string {
  return (s ?? '').trim().toLocaleLowerCase('tr')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/â/g, 'a')
}

// 2026-11-19, 19.11.2026, 19/11/2026 → zaman damgası (yerel gün başı)
export function parseKidsDate(s: string | undefined): number | null {
  const v = (s ?? '').trim()
  if (!v) return null
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime()
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime()
  return null
}

const PALETTE: Record<string, KColor> = {
  turuncu: { main: '#C2410C', dark: '#9A3412', soft: '#FFEDD5', line: '#FED7AA', ink: '#9A3412', bg: '#FFF8F1' },
  mavi: { main: '#1D4ED8', dark: '#1E3A8A', soft: '#DBEAFE', line: '#BFDBFE', ink: '#1E40AF', bg: '#F4F8FF' },
  pembe: { main: '#BE185D', dark: '#9D174D', soft: '#FCE7F3', line: '#FBCFE8', ink: '#9D174D', bg: '#FFF5FA' },
  yesil: { main: '#15803D', dark: '#14532D', soft: '#DCFCE7', line: '#BBF7D0', ink: '#166534', bg: '#F3FCF6' },
  mor: { main: '#6D28D9', dark: '#4C1D95', soft: '#EDE9FE', line: '#DDD6FE', ink: '#5B21B6', bg: '#F7F5FF' },
  sari: { main: '#B45309', dark: '#78350F', soft: '#FEF3C7', line: '#FDE68A', ink: '#92400E', bg: '#FFFBEB' },
}
const PALETTE_ORDER = ['turuncu', 'mavi', 'pembe', 'yesil', 'mor', 'sari']
// Tablodaki renk adı; boş ya da tanınmayan ad → sırayla bir renk
export function kidsColor(name: string | undefined, index: number): KColor {
  const n = normTr(name)
  return PALETTE[n] ?? PALETTE[PALETTE_ORDER[index % PALETTE_ORDER.length]]
}

export interface KTheme { main: string; dark: string; soft2: string; bg: string; shadow: string }
export const KIDS_THEMES: Record<'child_omur' | 'child_oztug', KTheme> = {
  child_omur: { main: '#DB2777', dark: '#9D174D', soft2: '#FBCFE8', bg: '#FFF5FA', shadow: 'rgba(219,39,119,.28)' },
  child_oztug: { main: '#15803D', dark: '#14532D', soft2: '#BBF7D0', bg: '#F3FCF6', shadow: 'rgba(21,128,61,.28)' },
}

// Konunun içindeki kartların sabit renkleri (mock-up'taki gibi)
const CARD_META = {
  grammar: { label: 'Grammar', sub: 'Kuralı öğren', bg: '#4338CA' },
  listen: { label: 'Dinle', sub: 'Video ve ses', bg: '#0369A1' },
  dictation: { label: 'Dictation', sub: 'Dinle ve yaz', bg: '#B45309' },
  drill: { label: 'Drill', sub: 'Oyna ve pekiştir', bg: '#BE185D' },
  shadowing: { label: 'Shadowing', sub: 'Dinle ve tekrar et', bg: '#0F766E' },
} as const
type KCard = keyof typeof CARD_META

// Öğrenci etkinliğindeki kart adları (StudentActivity.tsx ile aynı)
const ACT_CARD: Record<KCard, string> = { grammar: 'grammar', listen: 'audio', dictation: 'dictation', drill: 'drill', shadowing: 'shadowing' }

// ── Stil ─────────────────────────────────────────────────────────────────────
const KIDS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@600;700;800&display=swap');
.kd{min-height:100vh;box-sizing:border-box;font-family:'Nunito',system-ui,sans-serif;color:#1E1B2E;-webkit-tap-highlight-color:transparent}
.kd *{box-sizing:border-box}
.kd-in{max-width:520px;margin:0 auto;padding:22px 18px 40px;display:flex;flex-direction:column;gap:18px}
.kd-h{font-family:'Baloo 2','Nunito',sans-serif;font-weight:800;margin:0;line-height:1.05}
.kd button{font-family:inherit}
.kd-tap{transition:transform .15s ease,box-shadow .15s ease;cursor:pointer;border:none;text-align:left;color:inherit;font:inherit}
@media (hover:hover){.kd-tap:hover{transform:translateY(-2px)}}
.kd-tap:active{transform:scale(.97)}
.kd-tap:disabled{cursor:default;transform:none}
.kd-back{display:flex;align-items:center;gap:6px;min-height:46px;padding:0 16px;border-radius:14px;background:#FFFFFF;font-size:16px;font-weight:800;color:#3B3650;cursor:pointer;align-self:flex-start}
.kd-big{text-align:center;min-height:60px;border-radius:18px;border:none;font-family:'Baloo 2',sans-serif;font-size:23px;font-weight:800;cursor:pointer;color:#FFFFFF;padding:0 24px}
.kd-big:disabled{background:#E9E4EC !important;color:#6B6580 !important;cursor:not-allowed}
.kd-soft{text-align:center;min-height:50px;border-radius:16px;background:#FFFFFF;font-size:16px;font-weight:800;cursor:pointer;padding:0 18px}
.kd-input{width:100%;min-height:62px;padding:10px 18px;border-radius:18px;outline:none;font-family:'Baloo 2',sans-serif;font-size:24px;font-weight:700;color:#1E1B2E;background:#FFFFFF}
.kd-chip{padding:4px 10px;border-radius:10px;font-family:'Baloo 2',sans-serif;font-size:20px;font-weight:800}
@keyframes kdwig{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes kdpop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
@keyframes kdbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes kdshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes kdstar{0%{transform:scale(.2) rotate(-30deg);opacity:0}60%{transform:scale(1.25) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}
@keyframes kdfall{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(540deg);opacity:0}}
@keyframes kdpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.kd-wig{animation:kdwig 2.4s ease-in-out infinite;transform-origin:50% 80%;display:inline-block}
.kd-pop{animation:kdpop .5s ease-out both}
.kd-bob{animation:kdbob 2.6s ease-in-out infinite;display:inline-block}
.kd-shake{animation:kdshake .35s ease-in-out}
.kd-star{animation:kdstar .6s ease-out both}
.kd-pulse{animation:kdpulse 1.2s ease-in-out infinite}
.kd-cf{position:fixed;top:0;width:10px;height:14px;border-radius:3px;animation:kdfall 1.7s ease-out both;pointer-events:none;z-index:50}
@media (prefers-reduced-motion: reduce){.kd-wig,.kd-pop,.kd-bob,.kd-shake,.kd-star,.kd-pulse{animation:none}.kd-cf{display:none}.kd-tap{transition:none}}
`

function KidsStyle() { return <style>{KIDS_CSS}</style> }

// ── Küçük parçalar ───────────────────────────────────────────────────────────
function Chevron({ color = '#FFFFFF', size = 26 }: { color?: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
}
function LockIcon({ size = 34 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B6580" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}
function StarIcon({ size = 24, className }: { size?: number; className?: string }) {
  return <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="#F59E0B" stroke="#B45309" strokeWidth="1.3" strokeLinejoin="round"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" /></svg>
}
const CARD_ICONS: Record<KCard, ReactNode> = {
  grammar: <path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h6M8 11h6" />,
  listen: <><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="14" width="5" height="7" rx="2" /><rect x="16" y="14" width="5" height="7" rx="2" /></>,
  dictation: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  drill: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  shadowing: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
}
function CardIcon({ k, size = 40 }: { k: KCard; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{CARD_ICONS[k]}</svg>
}

function BackButton({ label, line, onClick }: { label: string; line: string; onClick: () => void }) {
  return (
    <button className="kd-back kd-tap" onClick={onClick} style={{ border: `2px solid ${line}` }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B3650" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      {label}
    </button>
  )
}

const CF_COLORS = ['#DB2777', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#14B8A6']
// Doğru cevap kutlaması: ekranın üstünden konfeti (hareket azaltma açıkken görünmez)
function Confetti({ burst }: { burst: number }) {
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (!burst) return undefined
    setOn(burst)
    const t = window.setTimeout(() => setOn(0), 1900)
    return () => window.clearTimeout(t)
  }, [burst])
  if (!on) return null
  return (
    <div aria-hidden="true">
      {Array.from({ length: 30 }, (_, i) => (
        <span key={`${on}-${i}`} className="kd-cf" style={{ left: `${(i * 37) % 100}%`, background: CF_COLORS[i % CF_COLORS.length], animationDelay: `${(i % 6) * 0.07}s`, width: `${8 + (i % 3) * 3}px` }} />
      ))}
    </div>
  )
}

function Dots({ total, current, done, color }: { total: number; current: number; done: boolean; color: string }) {
  if (total > 14) {
    const pct = Math.round(((current + (done ? 1 : 0)) / total) * 100)
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 12, borderRadius: 999, background: '#FFFFFF', border: `2px solid ${color}`, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{Math.min(current + 1, total)} / {total}</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {Array.from({ length: total }, (_, j) => (
        <span key={j} style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${color}`, background: j < current || (j === current && done) ? color : j === current ? `${color}55` : '#FFFFFF' }} />
      ))}
    </div>
  )
}

function StarCounter({ n }: { n: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: '#FFFFFF', border: '2px solid #FDE68A' }} aria-label={`${n} yıldız`}>
      <StarIcon />
      <span className="kd-h" style={{ fontSize: 20 }}>{n}</span>
    </div>
  )
}

// Yanlışta kelime kelime ipucu: doğru kısım, yeşil ipucu kelimesi, kalanı noktalı
function HintRow({ parts }: { parts: HintPart[] }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {parts.map((p, i) => (
        <span key={i} className="kd-chip" style={p.kind === 'ok' ? { background: '#FFFFFF', color: '#3B3650' } : p.kind === 'hint' ? { background: '#BBF7D0', color: '#166534' } : { background: '#FFEDD5', color: '#C2410C' }}>
          {p.kind === 'mask' ? '•'.repeat(Math.max(2, Math.min(10, p.word.length))) : p.word}
        </span>
      ))}
    </div>
  )
}

function DoneBox({ title, line, color, onAgain, onBack, backLabel }: { title: string; line: string; color: string; onAgain?: () => void; onBack: () => void; backLabel: string }) {
  return (
    <div className="kd-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '30px 20px', borderRadius: 28, background: '#FFFFFF', textAlign: 'center' }}>
      <StarIcon size={104} className="kd-star" />
      <div className="kd-h" style={{ fontSize: 36, color }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{line}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {onAgain && <button className="kd-big kd-tap" style={{ background: color }} onClick={onAgain}>Tekrar oyna</button>}
        <button className="kd-soft kd-tap" style={{ border: `2px solid ${color}55`, color: '#3B3650' }} onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  )
}

// Cümle cümle çalan küçük ses düğmesi (tek ses öğesi; telefonlar için güvenli)
function useKidsAudio() {
  const ref = useRef<HTMLAudioElement | null>(null)
  const raf = useRef(0)
  const token = useRef(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'
    ref.current = a
    const on = () => setPlaying(true)
    const off = () => setPlaying(false)
    a.addEventListener('play', on); a.addEventListener('pause', off); a.addEventListener('ended', off)
    return () => {
      token.current++
      cancelAnimationFrame(raf.current)
      a.removeEventListener('play', on); a.removeEventListener('pause', off); a.removeEventListener('ended', off)
      a.pause()
    }
  }, [])
  const stop = useCallback(() => { token.current++; cancelAnimationFrame(raf.current); ref.current?.pause() }, [])
  // src dosyasını start–end aralığında çalar (end verilmezse sonuna kadar)
  const play = useCallback(async (src: string, start = 0, end?: number, rate = 1) => {
    const a = ref.current
    if (!a || !src) return
    const my = ++token.current
    cancelAnimationFrame(raf.current)
    a.pause()
    let abs = src
    try { abs = new URL(src, window.location.href).href } catch { /* olduğu gibi */ }
    try {
      if (a.src !== abs) {
        a.src = src
        a.muted = true
        const p = a.play().catch(() => undefined)
        if (a.readyState < 1) {
          await new Promise<void>(res => {
            const ok = () => { a.removeEventListener('loadedmetadata', ok); res() }
            a.addEventListener('loadedmetadata', ok)
            window.setTimeout(ok, 5000)
          })
        }
        await p
        if (my !== token.current) { a.pause(); a.muted = false; return }
        a.pause()
        a.muted = false
      }
      a.currentTime = start
      a.playbackRate = rate
      await a.play()
    } catch { a.muted = false; return }
    if (my !== token.current || end == null) return
    const tick = () => {
      if (my !== token.current) return
      if (a.paused) return
      if (a.currentTime >= end - 0.03) { a.pause(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [])
  return { play, stop, playing }
}

function PlayButton({ playing, onClick, color, label, big }: { playing: boolean; onClick: () => void; color: string; label: string; big?: boolean }) {
  const s = big ? 84 : 64
  return (
    <button className={'kd-tap' + (playing ? ' kd-pulse' : '')} onClick={onClick} aria-label={playing ? 'Durdur' : label}
      style={{ width: s, height: s, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 20px ${color}55`, flexShrink: 0 }}>
      {playing
        ? <svg width={s * 0.42} height={s * 0.42} viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6" y="5" width="4" height="14" rx="1.5" /><rect x="14" y="5" width="4" height="14" rx="1.5" /></svg>
        : <svg width={s * 0.46} height={s * 0.46} viewBox="0 0 24 24" fill="#FFFFFF"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Panel (ana ekran)
// ═══════════════════════════════════════════════════════════════════════════
function BrainCard({ theme, items, status, onOpen }: { theme: KTheme; items: MemoryItem[]; status: string; onOpen: () => void }) {
  const known = items.filter(i => i.status === 'known').length
  const words = items.filter(i => i.type === 'word').length
  const sub = status === 'loading' && items.length === 0 ? 'Yükleniyor…'
    : items.length === 0 ? 'Öğrendiğin kelimeler burada parlıyor'
    : `${words} kelime${items.length - words > 0 ? ` · ${items.length - words} yapı` : ''} · ${known} biliyorum`
  return (
    <button className="kd-tap" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 22, background: theme.dark, color: '#FFFFFF', width: '100%' }}>
      <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1V5a2 2 0 0 0-2-1z" /><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-5 1V5a2 2 0 0 1 2-1z" /></svg>
      <span style={{ flex: 1 }}>
        <span className="kd-h" style={{ display: 'block', fontSize: 24 }}>My Brain</span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, opacity: .92 }}>{sub}</span>
      </span>
      <Chevron />
    </button>
  )
}

function MemoryCard({ theme, unut, onOpen }: { theme: KTheme; unut: UnutState; onOpen: () => void }) {
  const sub = unut.status !== 'ok' ? 'Yükleniyor…' : unut.dueCount > 0 ? `${unut.dueCount} kart seni bekliyor` : 'Bugünlük tamam!'
  return (
    <button className="kd-tap" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 20, background: '#FFFFFF', border: `2px solid ${theme.soft2}`, width: '100%', marginTop: -6 }}>
      <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, background: theme.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="4" width="13" height="16" rx="2.5" /><path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20" /><path d="M11 10.5h5M11 14h3" /></svg>
      </span>
      <span style={{ flex: 1 }}>
        <span className="kd-h" style={{ display: 'block', fontSize: 21 }}>Memory</span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#5B5670' }}>{sub}</span>
      </span>
      {unut.dueCount > 0 && <span style={{ minWidth: 30, height: 30, borderRadius: 999, background: theme.main, color: '#FFFFFF', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>{unut.dueCount}</span>}
      <Chevron color="#5B5670" size={22} />
    </button>
  )
}

export function cardCount(t: KidsTopic): number {
  return (t.bookCode ? 1 : 0) + (['grammar', 'listen', 'dictation', 'shadowing', 'drill'] as const).filter(k => t[k].state === 'ok').length
}

function KidsHome({ childName, theme, topics, brainItems, brainStatus, unut, showMemory, onBrain, onMemory, onTopic, onExit }: {
  childName: string; theme: KTheme; topics: KidsTopic[]; brainItems: MemoryItem[]; brainStatus: string
  unut: UnutState; showMemory: boolean; onBrain: () => void; onMemory: () => void; onTopic: (id: string) => void; onExit: () => void
}) {
  const fresh = topics.filter(t => t.isNew && !t.locked).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
  const hero = fresh[0] ?? null
  return (
    <div className="kd" style={{ background: theme.bg }}>
      <KidsStyle />
      <div className="kd-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div aria-hidden="true" className="kd-h" style={{ width: 48, height: 48, borderRadius: '50%', background: theme.main, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, flexShrink: 0 }}>{childName[0]}</div>
            <div style={{ minWidth: 0 }}>
              <h1 className="kd-h" style={{ fontSize: 'clamp(21px, 6vw, 30px)' }}>Merhaba {childName}!</h1>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: '#5B5670', whiteSpace: 'nowrap' }}>Bugün ne öğrenelim?</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <InstallButton variant="round" bg="#FFFFFF" fg={theme.main} style={{ width: 40, height: 40 }} />
            <button onClick={onExit} className="kd-tap" style={{ minHeight: 44, padding: '0 12px', borderRadius: 14, border: `2px solid ${theme.soft2}`, background: '#FFFFFF', fontSize: 15, fontWeight: 800, color: '#3B3650' }}>Çıkış</button>
          </div>
        </div>

        <BrainCard theme={theme} items={brainItems} status={brainStatus} onOpen={onBrain} />
        {showMemory && <MemoryCard theme={theme} unut={unut} onOpen={onMemory} />}

        {hero && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
              <h2 className="kd-h" style={{ fontSize: 24 }}>Yeni</h2>
            </div>
            <button className="kd-tap kd-pop" onClick={() => onTopic(hero.id)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '20px 18px', borderRadius: 26, background: theme.main, color: '#FFFFFF', overflow: 'hidden', boxShadow: `0 10px 24px ${theme.shadow}`, width: '100%' }}>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <span style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 999, background: '#FFFFFF', color: theme.dark, fontSize: 13, fontWeight: 800, letterSpacing: '.04em' }}>YENİ KONU</span>
                <span className="kd-h" style={{ fontSize: 34, lineHeight: 1 }}>{hero.title}</span>
                {hero.subtitle && <span style={{ fontSize: 16, fontWeight: 700 }}>{hero.subtitle}</span>}
                <span className="kd-h" style={{ alignSelf: 'flex-start', marginTop: 4, padding: '10px 18px', borderRadius: 16, background: '#FFFFFF', color: theme.dark, fontSize: 18 }}>Başla</span>
              </span>
              <span aria-hidden="true" style={{ width: 112, height: 112, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="kd-wig" style={{ fontSize: 66, lineHeight: 1 }}>{hero.icon}</span>
              </span>
            </button>
          </>
        )}

        <h2 className="kd-h" style={{ fontSize: 24, marginTop: 6 }}>Konularım</h2>
        {topics.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 22, background: '#FFFFFF', border: `2px dashed ${theme.soft2}` }}>
            <span aria-hidden="true" className="kd-bob" style={{ fontSize: 40 }}>✨</span>
            <span>
              <span className="kd-h" style={{ display: 'block', fontSize: 22 }}>Yakında yeni konular geliyor!</span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#5B5670' }}>Öğretmenin hazırlıyor.</span>
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topics.map(t => t.locked ? (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, background: '#F4F2F8', border: '2px dashed #CFCADB' }}>
                <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 18, background: '#ECE9F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LockIcon /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="kd-h" style={{ display: 'block', fontSize: 23, color: '#4B4660' }}>{t.title}</span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#5B5670' }}>Yakında açılacak</span>
                </span>
              </div>
            ) : (
              <button key={t.id} className="kd-tap" onClick={() => onTopic(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, background: '#FFFFFF', border: `2px solid ${t.color.line}`, width: '100%' }}>
                <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 18, background: t.color.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, flexShrink: 0 }}>{t.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="kd-h" style={{ display: 'block', fontSize: 23, lineHeight: 1.1 }}>{t.title}</span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#5B5670' }}>{[t.subtitle, `${cardCount(t)} kart`].filter(Boolean).join(' · ')}</span>
                </span>
                {t.isNew
                  ? <span style={{ padding: '4px 10px', borderRadius: 999, background: t.color.soft, color: t.color.ink, fontSize: 12, fontWeight: 800 }}>YENİ</span>
                  : <Chevron color="#5B5670" size={24} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Konunun içi
// ═══════════════════════════════════════════════════════════════════════════
function TopicPage({ topic, words, onBack, onCard, onStory }: { topic: KidsTopic; words: string[]; onBack: () => void; onCard: (k: KCard) => void; onStory: () => void }) {
  const c = topic.color
  const cards: KCard[] = ['grammar', 'listen', 'dictation', 'drill', 'shadowing']
  return (
    <div className="kd" style={{ background: c.bg }}>
      <KidsStyle />
      <div className="kd-in" style={{ gap: 16 }}>
        <BackButton label="Panele dön" line={c.line} onClick={onBack} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20, borderRadius: 28, background: c.main, color: '#FFFFFF' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em', opacity: .9 }}>KONU {topic.index + 1}</div>
            <h1 className="kd-h" style={{ fontSize: 40, lineHeight: 1, marginTop: 2 }}>{topic.title}</h1>
            {topic.subtitle && <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700 }}>{topic.subtitle}</p>}
          </div>
          <span aria-hidden="true" className="kd-bob" style={{ fontSize: 76, lineHeight: 1 }}>{topic.icon}</span>
        </div>

        {topic.bookCode && (
          <button className="kd-tap" onClick={onStory} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 26, background: '#6D28D9', color: '#FFFFFF', boxShadow: '0 10px 22px rgba(109,40,217,.28)', width: '100%' }}>
            <span aria-hidden="true" style={{ width: 66, height: 66, borderRadius: 20, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H3z" /><path d="M21 5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h7z" /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span className="kd-h" style={{ display: 'block', fontSize: 27, lineHeight: 1 }}>Hikâye</span>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 700, marginTop: 4 }}>Oku, dinle, balonlara dokun</span>
            </span>
            <Chevron />
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {cards.map(k => {
            const st = topic[k].state
            const m = CARD_META[k]
            if (st === 'ok') {
              return (
                <button key={k} className="kd-tap" onClick={() => onCard(k)} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, minHeight: 140, borderRadius: 24, background: m.bg, color: '#FFFFFF', width: '100%' }}>
                  <CardIcon k={k} />
                  <span className="kd-h" style={{ fontSize: 24, lineHeight: 1 }}>{m.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, opacity: .92 }}>{m.sub}</span>
                </button>
              )
            }
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, minHeight: 140, borderRadius: 24, background: '#F1EEF6', border: '2px dashed #CFCADB', color: '#4B4660' }}>
                {st === 'loading' ? <span aria-hidden="true" style={{ fontSize: 30 }}>⏳</span> : <LockIcon size={36} />}
                <span className="kd-h" style={{ fontSize: 24, lineHeight: 1 }}>{m.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{st === 'loading' ? 'Hazırlanıyor…' : 'Yakında'}</span>
              </div>
            )
          })}
          {words.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: 16, minHeight: 140, borderRadius: 24, background: '#FFFFFF', border: `2px solid ${c.line}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: c.ink, letterSpacing: '.05em' }}>BU KONUDA</div>
              <div className="kd-h" style={{ fontSize: 22, lineHeight: 1.15 }}>{words.join(', ')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Kart ekranlarının ortak çerçevesi

function Frame({ topic, card, onBack, right, sub, children }: { topic: KidsTopic; card: KCard; onBack: () => void; right?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  const m = CARD_META[card]
  return (
    <div className="kd" style={{ background: topic.color.bg }}>
      <KidsStyle />
      <div className="kd-in" style={{ gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <BackButton label={topic.title} line={topic.color.line} onClick={onBack} />
          {right}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="kd-h" style={{ fontSize: 32, color: m.bg }}>{m.label}</h1>
          {sub}
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Grammar: kurallar büyük kartlarda, tek tek ───────────────────────────────
function KidsGrammar({ topic, deps, onBack }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void }) {
  const slots = topic.grammar.slots
  const [si, setSi] = useState(0)
  const [bi, setBi] = useState(0)
  const [burst, setBurst] = useState(0)
  const slot = slots[Math.min(si, slots.length - 1)]
  const blocks = slot?.blocks ?? []
  const block = blocks[Math.min(bi, blocks.length - 1)]
  const last = bi >= blocks.length - 1
  const color = CARD_META.grammar.bg
  useEffect(() => { window.scrollTo(0, 0) }, [si, bi])
  const renderLines = (text: string, size: number) => text.split('\n---\n').map((sec, i) => (
    <div key={i} style={{ borderTop: i > 0 ? '2px dashed #E4E0EE' : 'none', paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
      {sec.split('\n').map((line, li) => {
        if (!line.trim()) return <div key={li} style={{ height: 8 }} />
        const img = line.trim().match(/^\(\(([^\s()]+)\)\)$/)
        if (img) return <img key={li} src={img[1]} alt="" style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 18, display: 'block', margin: '8px 0' }} />
        return <p key={li} style={{ margin: '0 0 6px', fontSize: size, lineHeight: 1.55, fontWeight: 700 }}>{deps.renderInline(line)}</p>
      })}
    </div>
  ))
  return (
    <Frame topic={topic} card="grammar" onBack={onBack} sub={blocks.length > 1 ? <Dots total={blocks.length} current={bi} done={false} color={color} /> : undefined}>
      {slots.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {slots.map((s, i) => (
            <button key={s.slot} className="kd-tap" onClick={() => { setSi(i); setBi(0) }} style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, fontWeight: 800, fontSize: 16, background: i === si ? color : '#FFFFFF', color: i === si ? '#FFFFFF' : '#3B3650', border: `2px solid ${color}44` }}>{s.label}</button>
          ))}
        </div>
      )}
      {block && (
        <div key={`${si}-${bi}`} className="kd-pop" style={
          block.type === 'HEADER' ? { padding: '22px 20px', borderRadius: 26, background: '#EEF2FF', border: `3px solid ${color}`, color: '#1E1B4B' }
          : block.type === 'NOTE' ? { padding: '18px 20px', borderRadius: 24, background: '#FEF9C3', border: '2px solid #FDE047', color: '#713F12' }
          : { padding: '20px', borderRadius: 26, background: '#FFFFFF', border: `3px solid ${color}22` }}>
          {block.type === 'HEADER'
            ? <div className="kd-h" style={{ fontSize: 28, lineHeight: 1.2 }}>{block.content.split('\n').map((l, i) => <div key={i}>{deps.renderInline(l)}</div>)}</div>
            : renderLines(block.content, block.type === 'NOTE' ? 17 : 20)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="kd-soft kd-tap" disabled={bi === 0} onClick={() => setBi(b => Math.max(0, b - 1))} style={{ border: `2px solid ${color}44`, color: '#3B3650', opacity: bi === 0 ? .45 : 1, flex: '0 0 auto' }}>← Geri</button>
        {last
          ? <button className="kd-big kd-tap" style={{ background: '#16A34A', flex: 1 }} onClick={() => { setBurst(Date.now()); window.setTimeout(onBack, 900) }}>Bitti!</button>
          : <button className="kd-big kd-tap" style={{ background: color, flex: 1 }} onClick={() => setBi(b => b + 1)}>İleri →</button>}
      </div>
      <Confetti burst={burst} />
    </Frame>
  )
}

// ── Dinle: video ya da ses, altında büyük altyazı ───────────────────────────
function KidsListen({ topic, onBack }: { topic: KidsTopic; onBack: () => void }) {
  const { url, segments } = topic.listen
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const counted = useRef(false)
  const color = CARD_META.listen.bg
  const cur = segments.find(s => t >= s.start && t < s.end + 0.15)
  const common = {
    ref: mediaRef, src: url, preload: 'metadata' as const,
    onTimeUpdate: () => setT(mediaRef.current?.currentTime ?? 0),
    onLoadedMetadata: () => setDur(mediaRef.current?.duration ?? 0),
    onPlay: () => { setPlaying(true); if (!counted.current) { counted.current = true; activityStat('audio', st => bump(st, 'plays')) } },
    onPause: () => setPlaying(false), onEnded: () => setPlaying(false),
  }
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  return (
    <Frame topic={topic} card="listen" onBack={onBack}>
      {isVideo ? (
        <video {...common} controls playsInline style={{ width: '100%', borderRadius: 24, background: '#000', display: 'block', border: `4px solid ${color}` }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '26px 20px', borderRadius: 28, background: '#FFFFFF', border: `3px solid ${color}33` }}>
          <audio {...common} />
          <PlayButton big playing={playing} color={color} label="Dinle" onClick={() => { const a = mediaRef.current; if (!a) return; if (a.paused) void a.play().catch(() => undefined); else a.pause() }} />
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#5B5670', minWidth: 40 }}>{fmt(t)}</span>
            <input type="range" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} aria-label="Konum"
              onChange={e => { const a = mediaRef.current; if (a) { a.currentTime = Number(e.target.value); setT(a.currentTime) } }}
              style={{ flex: 1, accentColor: color, height: 28 }} />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#5B5670', minWidth: 40, textAlign: 'right' }}>{fmt(dur)}</span>
          </div>
        </div>
      )}
      {segments.length > 0 && (
        <div style={{ minHeight: 96, padding: '18px 20px', borderRadius: 24, background: '#FFFFFF', border: `3px solid ${cur ? color : '#E4E0EE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <span className="kd-h" style={{ fontSize: 26, lineHeight: 1.25, color: cur ? '#1E1B2E' : '#9A94AE' }}>{cur ? cur.text : '♪'}</span>
        </div>
      )}
    </Frame>
  )
}

// ── Dictation: cümleyi dinle, yaz; yanlışta ipucu, kırmızı yok ─────────────
function KidsDictation({ topic, deps, onBack }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void }) {
  const segs = topic.dictation.segments
  const url = topic.dictation.url
  const audio = useKidsAudio()
  const color = CARD_META.dictation.bg
  const fresh = () => ({ i: 0, typed: '', status: 'idle' as 'idle' | 'ok' | 'wrong', tried: false, wrongFirst: false, revealed: false, stars: 0, firstOk: 0, done: false, shake: 0 })
  const [st, setSt] = useState(fresh)
  const [slow, setSlow] = useState(false)
  const [burst, setBurst] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const seg = segs[Math.min(st.i, segs.length - 1)]
  const playCur = (idx = st.i) => { const s = segs[idx]; if (s) void audio.play(url, s.start, s.end, slow ? 0.75 : 1) }
  const ok = st.status === 'ok'
  const hint = st.status === 'wrong' && seg ? deps.answerHint(seg.text, st.typed) : null

  function check() {
    if (!seg || ok || !st.typed.trim()) return
    const r = deps.answerHint(seg.text, st.typed)
    if (!st.tried) {
      activityStat('dictation', s => { bump(s, 'written'); if (r.allOk) bump(s, 'first') })
      if (!r.allOk) activityMiss('dictation', seg.text, st.typed)
    } else if (r.allOk && st.wrongFirst) {
      activityStat('dictation', s => bump(s, 'hinted'))
    }
    if (r.allOk && !st.tried) setBurst(Date.now())
    setSt(p => ({ ...p, status: r.allOk ? 'ok' : 'wrong', tried: true, wrongFirst: p.wrongFirst || (!p.tried && !r.allOk), firstOk: p.firstOk + (r.allOk && !p.tried ? 1 : 0), stars: p.stars + (r.allOk && !p.tried ? 1 : 0), shake: r.allOk ? p.shake : p.shake + 1 }))
  }
  function next() {
    audio.stop()
    if (st.i + 1 >= segs.length) { setSt(p => ({ ...p, done: true, status: 'idle' })); return }
    const ni = st.i + 1
    setSt(p => ({ ...p, i: ni, typed: '', status: 'idle', tried: false, wrongFirst: false, revealed: false }))
    playCur(ni)
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }
  const canCheck = ok || !!st.typed.trim()
  return (
    <Frame topic={topic} card="dictation" onBack={() => { audio.stop(); onBack() }} right={<StarCounter n={st.stars} />}
      sub={!st.done ? <Dots total={segs.length} current={st.i} done={ok} color={color} /> : undefined}>
      {st.done ? (
        <DoneBox title="Süpersin!" line={`İlk denemede ${st.firstOk} / ${segs.length} doğru`} color={color} onAgain={() => { setSt(fresh()); }} onBack={onBack} backLabel="Konuya dön" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 18, borderRadius: 26, background: '#FFFFFF', border: `3px solid ${color}33` }}>
            <PlayButton big playing={audio.playing} color={color} label="Cümleyi dinle" onClick={() => (audio.playing ? audio.stop() : playCur())} />
            <div style={{ flex: 1 }}>
              <div className="kd-h" style={{ fontSize: 24 }}>Dinle ve yaz</div>
              <button className="kd-tap" onClick={() => setSlow(s => !s)} aria-pressed={slow} style={{ marginTop: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, background: slow ? color : '#FFFFFF', color: slow ? '#FFFFFF' : '#3B3650', border: `2px solid ${color}55`, fontWeight: 800, fontSize: 15 }}>🐢 Yavaş</button>
            </div>
          </div>
          <label htmlFor="kd-dict" style={{ fontSize: 16, fontWeight: 800, color: '#3B3650', marginBottom: -8 }}>Cevabın</label>
          <input id="kd-dict" ref={inputRef} key={`${st.i}-${st.shake}`} className={'kd-input' + (st.status === 'wrong' ? ' kd-shake' : '')} value={st.typed} readOnly={ok} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Buraya yaz…"
            onChange={e => { const v = e.target.value; setSt(p => ({ ...p, typed: v, status: p.status === 'ok' ? 'ok' : 'idle' })) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ok) next(); else check() } }}
            style={{ border: ok ? '3px solid #22C55E' : st.status === 'wrong' ? '3px solid #FB923C' : `3px solid ${color}44`, background: ok ? '#F0FDF4' : '#FFFFFF' }} />
          {ok && <OkBox wrongFirst={st.wrongFirst} />}
          {hint && (
            <div style={{ padding: '14px 16px', borderRadius: 20, background: '#FFF7ED', border: '2px solid #FDBA74' }}>
              <div className="kd-h" style={{ fontSize: 22, color: '#9A3412' }}>Neredeyse! Bir daha dene</div>
              {hint.extra ? <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: '#9A3412' }}>Cümlenin sonunda fazladan kelime var.</div> : <HintRow parts={hint.parts} />}
            </div>
          )}
          {st.revealed && !ok && seg && (
            <div style={{ padding: '12px 16px', borderRadius: 18, background: '#FEF9C3', border: '2px solid #FDE047', fontSize: 18, fontWeight: 800, color: '#713F12' }}>Cevap: {seg.text} <span style={{ fontWeight: 700 }}>— şimdi sen yaz</span></div>
          )}
          <button className="kd-big kd-tap" disabled={!canCheck} style={{ background: ok ? '#16A34A' : color }} onClick={() => (ok ? next() : check())}>{ok ? (st.i + 1 >= segs.length ? 'Bitir' : 'Sonraki') : 'Kontrol et'}</button>
          {!ok && st.wrongFirst && !st.revealed && (
            <button className="kd-soft kd-tap" style={{ border: '2px solid #E9D5FF', color: '#6B21A8' }} onClick={() => setSt(p => ({ ...p, revealed: true }))}>Cevabı göster</button>
          )}
        </>
      )}
      <Confetti burst={burst} />
    </Frame>
  )
}

function OkBox({ wrongFirst }: { wrongFirst: boolean }) {
  return (
    <div className="kd-pop" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 20, background: '#DCFCE7', border: '2px solid #86EFAC' }}>
      <StarIcon size={44} className="kd-star" />
      <div>
        <div className="kd-h" style={{ fontSize: 26, color: '#166534' }}>{wrongFirst ? 'Düzelttin!' : 'Harika!'}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>{wrongFirst ? 'Doğru cümle bu.' : 'İlk denemede doğru, bir yıldız!'}</div>
      </div>
    </div>
  )
}

// ── Drill: Drill tablosundaki cevabı belli maddeler, oyun gibi ──────────────
// Tekrar takvimi (A1/A2'deki aralıklı tekrar) burada yok: her girişte bir tur.
function KidsDrill({ topic, deps, onBack }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void }) {
  const items = topic.drill.items
  const color = CARD_META.drill.bg
  const fresh = () => ({ i: 0, typed: '', status: 'idle' as 'idle' | 'ok' | 'wrong', tried: false, wrongFirst: false, revealed: false, stars: 0, firstOk: 0, done: false, shake: 0 })
  const [st, setSt] = useState(fresh)
  const [burst, setBurst] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const q = items[Math.min(st.i, items.length - 1)]
  const ok = st.status === 'ok'
  const hint = st.status === 'wrong' && q ? deps.answerHint(q.expected, st.typed) : null

  function check() {
    if (!q || ok || !st.typed.trim()) return
    const r = deps.answerHint(q.expected, st.typed)
    if (!st.tried) {
      activityStat('drill', s => {
        const ids: string[] = Array.isArray(s.topics) ? s.topics : (s.topics = [])
        if (q.topicId && !ids.includes(q.topicId) && ids.length < 200) ids.push(q.topicId)
        bump(s, r.allOk ? 'ok' : 'hard')
        if (!r.allOk && q.topicId) {
          const h = s.hard_topics && typeof s.hard_topics === 'object' ? s.hard_topics : (s.hard_topics = {})
          const e = h[q.topicId] || (h[q.topicId] = { label: q.topicLabel || q.topicId, n: 0 })
          e.n = (Number(e.n) || 0) + 1
        }
      })
      if (r.allOk) setBurst(Date.now())
    }
    setSt(p => ({ ...p, status: r.allOk ? 'ok' : 'wrong', tried: true, wrongFirst: p.wrongFirst || (!p.tried && !r.allOk), firstOk: p.firstOk + (r.allOk && !p.tried ? 1 : 0), stars: p.stars + (r.allOk && !p.tried ? 1 : 0), shake: r.allOk ? p.shake : p.shake + 1 }))
  }
  function next() {
    if (st.i + 1 >= items.length) { setSt(p => ({ ...p, done: true, status: 'idle' })); return }
    setSt(p => ({ ...p, i: p.i + 1, typed: '', status: 'idle', tried: false, wrongFirst: false, revealed: false }))
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }
  const canCheck = ok || !!st.typed.trim()
  return (
    <Frame topic={topic} card="drill" onBack={onBack} right={<StarCounter n={st.stars} />}
      sub={!st.done ? <Dots total={items.length} current={st.i} done={ok} color={color} /> : undefined}>
      {st.done ? (
        <DoneBox title="Süpersin!" line={`İlk denemede ${st.firstOk} / ${items.length} doğru`} color={color} onAgain={() => setSt(fresh())} onBack={onBack} backLabel="Konuya dön" />
      ) : q && (
        <>
          <div style={{ padding: 20, borderRadius: 26, background: '#FFFFFF', border: '3px solid #FBCFE8' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#9D174D', letterSpacing: '.03em' }}>{q.instruction}</div>
            {q.model && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 14, background: '#FDF2F8', fontSize: 17, fontWeight: 700, color: '#5B5670' }}>Örnek: <b style={{ color: '#1E1B2E' }}>{deps.renderInline(q.model)}</b></div>}
            <div className="kd-h" style={{ marginTop: 8, fontSize: 30, lineHeight: 1.15 }}>{q.cue}</div>
          </div>
          <label htmlFor="kd-drill" style={{ fontSize: 16, fontWeight: 800, color: '#3B3650', marginBottom: -8 }}>Cevabın</label>
          <input id="kd-drill" ref={inputRef} key={`${st.i}-${st.shake}`} className={'kd-input' + (st.status === 'wrong' ? ' kd-shake' : '')} value={st.typed} readOnly={ok} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Buraya yaz…"
            onChange={e => { const v = e.target.value; setSt(p => ({ ...p, typed: v, status: p.status === 'ok' ? 'ok' : 'idle' })) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ok) next(); else check() } }}
            style={{ border: ok ? '3px solid #22C55E' : st.status === 'wrong' ? '3px solid #FB923C' : '3px solid #FBCFE8', background: ok ? '#F0FDF4' : '#FFFFFF' }} />
          {ok && <OkBox wrongFirst={st.wrongFirst} />}
          {hint && (
            <div style={{ padding: '14px 16px', borderRadius: 20, background: '#FFF7ED', border: '2px solid #FDBA74' }}>
              <div className="kd-h" style={{ fontSize: 22, color: '#9A3412' }}>Neredeyse! Bir daha dene</div>
              {hint.extra ? <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: '#9A3412' }}>Cümlenin sonunda fazladan kelime var.</div> : <HintRow parts={hint.parts} />}
            </div>
          )}
          {st.revealed && !ok && (
            <div style={{ padding: '12px 16px', borderRadius: 18, background: '#FEF9C3', border: '2px solid #FDE047', fontSize: 18, fontWeight: 800, color: '#713F12' }}>Cevap: {deps.showExpected(q.expected)} <span style={{ fontWeight: 700 }}>— şimdi sen yaz</span></div>
          )}
          <button className="kd-big kd-tap" disabled={!canCheck} style={{ background: ok ? '#16A34A' : color }} onClick={() => (ok ? next() : check())}>{ok ? (st.i + 1 >= items.length ? 'Bitir' : 'Sonraki') : 'Kontrol et'}</button>
          {!ok && st.wrongFirst && !st.revealed && (
            <button className="kd-soft kd-tap" style={{ border: '2px solid #E9D5FF', color: '#6B21A8' }} onClick={() => setSt(p => ({ ...p, revealed: true }))}>Cevabı göster</button>
          )}
        </>
      )}
      <Confetti burst={burst} />
    </Frame>
  )
}

// ── Shadowing: büyük cümle kartı, dinle ve tekrar et (ses kaydı yok) ────────
function KidsShadowing({ topic, onBack }: { topic: KidsTopic; onBack: () => void }) {
  const { url, segments, clips } = topic.shadowing
  const audio = useKidsAudio()
  const color = CARD_META.shadowing.bg
  const sentences = clips.length > 0 ? segments.map((s, i) => ({ text: s.text, clip: clips[i] ?? '' })) : segments.map(s => ({ text: s.text, clip: '' }))
  const [i, setI] = useState(0)
  const [slow, setSlow] = useState(false)
  const rate = slow ? 0.75 : 1
  function track(idx: number) {
    activityStat('shadowing', s => {
      const seen: number[] = Array.isArray(s.s) ? s.s : (s.s = [])
      if (seen.includes(idx)) bump(s, 'replays'); else if (seen.length < 500) seen.push(idx)
      const sp = s.speeds && typeof s.speeds === 'object' ? s.speeds : (s.speeds = {})
      const k = String(rate)
      sp[k] = (Number(sp[k]) || 0) + 1
    })
  }
  function playAt(idx: number) {
    const sen = sentences[idx]
    if (!sen) return
    track(idx)
    if (sen.clip) void audio.play(sen.clip, 0, undefined, rate)
    else { const s = segments[idx]; void audio.play(url, s.start, s.end, rate) }
  }
  function go(d: number) {
    const ni = Math.max(0, Math.min(sentences.length - 1, i + d))
    if (ni === i) return
    setI(ni)
    playAt(ni)
  }
  const cur = sentences[i]
  return (
    <Frame topic={topic} card="shadowing" onBack={() => { audio.stop(); onBack() }} sub={<Dots total={sentences.length} current={i} done={false} color={color} />}>
      <div key={i} className="kd-pop" style={{ minHeight: 150, padding: '24px 20px', borderRadius: 28, background: '#FFFFFF', border: `4px solid ${audio.playing ? color : `${color}33`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', transition: 'border-color .2s' }}>
        <span className="kd-h" style={{ fontSize: 30, lineHeight: 1.25 }}>{cur?.text}</span>
      </div>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#5B5670' }}>Dinle, sonra sesli tekrar et!</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <button className="kd-soft kd-tap" disabled={i === 0} onClick={() => go(-1)} aria-label="Önceki cümle" style={{ border: `2px solid ${color}44`, color: '#3B3650', opacity: i === 0 ? .45 : 1, width: 64, padding: 0, fontSize: 24 }}>⏮</button>
        <PlayButton big playing={audio.playing} color={color} label="Cümleyi dinle" onClick={() => (audio.playing ? audio.stop() : playAt(i))} />
        <button className="kd-soft kd-tap" disabled={i >= sentences.length - 1} onClick={() => go(1)} aria-label="Sonraki cümle" style={{ border: `2px solid ${color}44`, color: '#3B3650', opacity: i >= sentences.length - 1 ? .45 : 1, width: 64, padding: 0, fontSize: 24 }}>⏭</button>
      </div>
      <button className="kd-tap" onClick={() => setSlow(s => !s)} aria-pressed={slow} style={{ alignSelf: 'center', minHeight: 44, padding: '0 18px', borderRadius: 999, background: slow ? color : '#FFFFFF', color: slow ? '#FFFFFF' : '#3B3650', border: `2px solid ${color}55`, fontWeight: 800, fontSize: 16 }}>🐢 Yavaş</button>
    </Frame>
  )
}

// ── Hikâye: Kitaplık okuyucusu o kitapla açılır ─────────────────────────────
function KidsStory({ topic, account, childName, onBack }: { topic: KidsTopic; account: Account; childName: string; onBack: () => void }) {
  return <ChildReaderApp account={account} childName={childName} group="cocuk" initialBook={topic.bookCode} onExit={onBack} />
}

// ═══════════════════════════════════════════════════════════════════════════
// Panelin tamamı: ana ekran → konu → kart. Telefonun geri tuşu bir üst ekrana
// döner; geri dönünce ekran kaldığı kaydırma yerinden açılır.
// ═══════════════════════════════════════════════════════════════════════════
type Nav = { topic: string | null; card: KCard | 'story' | null }
const depthOf = (n: Nav) => (n.card ? 2 : n.topic ? 1 : 0)

export function KidsArea({ childName, childArea, account, topics, deps, brainItems, brainStatus, unut, showMemory, onBrain, onMemory, onExit, homeScroll }: {
  childName: string
  childArea: 'child_omur' | 'child_oztug'
  account: Account
  topics: KidsTopic[]
  deps: KidsDeps
  brainItems: MemoryItem[]
  brainStatus: string
  unut: UnutState
  showMemory: boolean
  onBrain: () => void
  onMemory: () => void
  onExit: () => void
  homeScroll: { current: number }
}) {
  const theme = KIDS_THEMES[childArea]
  const [nav, setNav] = useState<Nav>({ topic: null, card: null })
  const navRef = useRef(nav)
  navRef.current = nav
  const pushed = useRef(0)
  const scrolls = useRef<number[]>([])
  const prevDepth = useRef(0)

  useLayoutEffect(() => {
    const d = depthOf(nav)
    if (d < prevDepth.current) {
      const y = d === 0 ? homeScroll.current : (scrolls.current[d] ?? 0)
      window.scrollTo(0, y)
      requestAnimationFrame(() => window.scrollTo(0, y))
    } else if (d > prevDepth.current) {
      window.scrollTo(0, 0)
    }
    prevDepth.current = d
  }, [nav, homeScroll])

  function open(next: Nav) {
    const d = depthOf(navRef.current)
    if (d === 0) homeScroll.current = window.scrollY
    else scrolls.current[d] = window.scrollY
    if (next.card !== 'story') {
      try { window.history.pushState({ ncKids: depthOf(next) }, ''); pushed.current++ } catch { /* yoksa yalnızca ekran değişir */ }
    }
    setNav(next)
  }
  const up = (n: Nav): Nav => (n.card ? { topic: n.topic, card: null } : { topic: null, card: null })
  function back() {
    if (pushed.current > 0) { try { window.history.back(); return } catch { /* aşağıda */ } }
    setNav(up(navRef.current))
  }
  useEffect(() => {
    const onPop = () => {
      const n = navRef.current
      if (n.card === 'story' || depthOf(n) === 0) return  // okuyucu kendi geri adımını yönetir
      pushed.current = Math.max(0, pushed.current - 1)
      setNav(up(n))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const topic = nav.topic ? topics.find(t => t.id === nav.topic) ?? null : null
  // Konu tablodan kalktıysa ya da kilitlendiyse ana ekrana dön
  useEffect(() => { if (nav.topic && (!topic || topic.locked)) setNav({ topic: null, card: null }) }, [nav.topic, topic])

  // Öğrenci etkinliği: konu sayfası ve kartlar (Hikâye'de okuyucu kendisi yazar)
  useActivityPlace(topic && nav.card !== 'story'
    ? (nav.card ? { card: ACT_CARD[nav.card], level: 'Çocuk', unit: topic.id, depth: 3 } : { card: 'unit', level: 'Çocuk', unit: topic.id, depth: 2 })
    : null)

  const words = useMemo(() => {
    if (!topic?.bookCode) return []
    const c = loadCachedContent()
    if (!c) return []
    const code = topic.bookCode.toUpperCase()
    return c.vocab.filter(v => v.book.toUpperCase() === code).map(v => v.word).filter(Boolean).slice(0, 6)
  }, [topic?.bookCode])

  if (topic && nav.card === 'story') return <KidsStory topic={topic} account={account} childName={childName} onBack={() => setNav({ topic: topic.id, card: null })} />
  if (topic && nav.card === 'grammar') return <KidsGrammar topic={topic} deps={deps} onBack={back} />
  if (topic && nav.card === 'listen') return <KidsListen topic={topic} onBack={back} />
  if (topic && nav.card === 'dictation') return <KidsDictation topic={topic} deps={deps} onBack={back} />
  if (topic && nav.card === 'drill') return <KidsDrill topic={topic} deps={deps} onBack={back} />
  if (topic && nav.card === 'shadowing') return <KidsShadowing topic={topic} onBack={back} />
  if (topic) {
    return <TopicPage topic={topic} words={words} onBack={back}
      onCard={k => open({ topic: topic.id, card: k })}
      onStory={() => open({ topic: topic.id, card: 'story' })} />
  }
  return <KidsHome childName={childName} theme={theme} topics={topics} brainItems={brainItems} brainStatus={brainStatus} unut={unut}
    showMemory={showMemory} onBrain={onBrain} onMemory={onMemory} onExit={onExit}
    onTopic={id => open({ topic: id, card: null })} />
}

