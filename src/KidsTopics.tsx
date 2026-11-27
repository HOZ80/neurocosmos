// ─── Çocuk paneli: oyun haritası, maskot, sürpriz kutusu, yuva ───────────────
// Ömür ve Öztuğ'un paneli. İçerik A1/A2 ile AYNI tablolardan gelir:
//   Units tablosunda seviyesi "Çocuk" olan satırlar (kimlik C-U01, C-U02 …),
//   Grammar ve Drill tablolarında aynı kimlikle satırlar, kart kilitleri
//   aynı *_locked sütunlarından. Çocuğa özel sütunlar (Units):
//     cocuk      – kime görünür: omur / oztug / ikisi (boşsa ikisi)
//     tarih      – bu tarihten itibaren 14 gün "Yeni" sayılır
//     simge      – konunun simgesi (tek emoji)
//     onay       – öğretmen onayı: "tamam" (konu anlaşıldı) / "devam" (bir tur daha)
//     kitap_kodu – şimdilik haritada kullanılmıyor (kitap görev değil)
// Konu listesini App.tsx hazırlar (buildKidsTopics); bu dosya gösterir,
// öğrenci etkinliğine sayı yazar ve durakları kids_progress tablosuna kaydeder
// (kidsStore.ts). Kırmızı hiçbir yerde kullanılmaz; ceza yok, yalnızca ödül.
//
// İşleyiş (Hatice, 27 Kasım):
//   • Ünite = oyun haritası. Duraklar: Grammar → Dinle → Dictation → Shadowing
//     → Drill (içeriği olanlar). Bitirilenler ve SIRADAKİ durak görünür;
//     sonrakiler ve yolları hiç görünmez, ilerledikçe açılır.
//   • Her durağın ilk bitişinde sürpriz kutusu → maskota ödül.
//   • Bütün duraklar bitince "Öğretmenin bakıyor". Units'te onay = "tamam"
//     yazılınca büyük kutlama + kupa, maskot büyür. "devam" = Drill bir tur daha.
//   • Ana ekrandaki konu haritasında da yalnızca geçilen konular + sıradaki
//     konu görünür. Durakları biten (öğretmen bakıyor) konu bir sonrakini açar.
//   • Görseller: Microsoft Fluent Emoji 3D (MIT), public/kids/ klasöründe.
//     Orka görseli Fluent balinasından boyandı – kendi maskotumuz gelince değişecek.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import type { Account } from './auth'
import type { UnutState } from './UnutmamaView'
import type { MemoryItem } from './memoryShared'
import InstallButton from './InstallButton'
import { useActivityPlace, activityStat, activityMiss, activitySpeech, bump } from './activityStore'
import { speechSupported, useShadowSpeech, ShadowWords, shadowCountText } from './speechInput'
import { checkDictation, buildNameSet, namesInSentence, dictNoteText } from './dictationCheck'
import { readKidsLocal, loadKidsProgress, saveKidsStep, stepKey } from './kidsStore'

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
  approval: 'tamam' | 'devam' | ''   // Units'teki "onay" sütunu
  grammar: { state: KState; slots: KGrammarSlot[] }
  listen: { state: KState; url: string; segments: KSeg[] }
  dictation: { state: KState; url: string; segments: KSeg[]; namesShow?: string[]; namesAsk?: string[] }   // names*: Units'teki dictation_goster / dictation_sor
  shadowing: { state: KState; url: string; segments: KSeg[]; clips: string[]; speech?: boolean }   // speech: Units'teki shadowing_konusma (boş = açık)
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

const IMG = (n: string) => `/kids/${n}.webp`

// ── Çocuğa göre tema ─────────────────────────────────────────────────────────
type ChildArea = 'child_omur' | 'child_oztug'
interface KTheme {
  top: string; unitTop: string; page: string; ink: string; sub: string
  accent: string; accentSoft: string; ring: string; road: string
  mapBg: string; hill1: string; hill2: string; deco: [string, string, string]
  surprise: string; finale: string; nestBg: string; shadow: string; conf: string[]
}
const THEMES: Record<ChildArea, KTheme> = {
  // Ömür: pastel şeker pembesi + lavanta (önizleme v2)
  child_omur: {
    top: 'linear-gradient(155deg,#FFC2E2 0%,#FFD9EC 45%,#E2D4FF 100%)',
    unitTop: 'linear-gradient(150deg,#FFD9C2 0%,#FFC6E3 55%,#E3D2FF 100%)',
    page: '#FFF8FC', ink: '#3A1450', sub: '#5E4A6E', accent: '#B8236F', accentSoft: '#FFE3F1', ring: '#FF6FB5', road: '#FFB3D6',
    mapBg: 'linear-gradient(180deg,#E9E2FF 0%,#FFE6F2 46%,#FFF1E6 100%)', hill1: '#DDF6EC', hill2: '#C8F0DE',
    deco: ['blossom', 'tree', 'house'],
    surprise: 'linear-gradient(165deg,#FF9ACB 0%,#FFB8DA 40%,#C9A8FF 100%)',
    finale: 'linear-gradient(165deg,#FFC2E2 0%,#E2C8FF 55%,#B9DCFF 100%)',
    nestBg: 'linear-gradient(180deg,#FFE3F1 0%,#FFF1E6 58%,#E2FAF3 100%)',
    shadow: 'rgba(110,40,130,.35)', conf: ['#FF9FCF', '#B9A4FF', '#8CCBFF', '#FFD66B', '#7FE0C2', '#FFB98F', '#FFFFFF'],
  },
  // Öztuğ: mavi ağırlıklı, deniz
  child_oztug: {
    top: 'linear-gradient(155deg,#9FD8FF 0%,#C7E9FF 45%,#C9D4FF 100%)',
    unitTop: 'linear-gradient(150deg,#B5F0E6 0%,#A9DCFF 55%,#C6CCFF 100%)',
    page: '#F4FAFF', ink: '#0F2A4A', sub: '#3E5A78', accent: '#1F6AA8', accentSoft: '#E1F1FF', ring: '#3FA3F0', road: '#8FD0FF',
    mapBg: 'linear-gradient(180deg,#E3F4FF 0%,#C9EBFF 50%,#A7DDF7 100%)', hill1: '#8FD0F2', hill2: '#6EC0EA',
    deco: ['tropical', 'coral', 'island'],
    surprise: 'linear-gradient(165deg,#5FC0FF 0%,#9FD8FF 40%,#A9B4FF 100%)',
    finale: 'linear-gradient(165deg,#B5F0E6 0%,#A9DCFF 55%,#C6CCFF 100%)',
    nestBg: 'linear-gradient(180deg,#CDEEFF 0%,#86CBF2 55%,#4FA6DB 100%)',
    shadow: 'rgba(20,70,130,.35)', conf: ['#8CCBFF', '#7FE0C2', '#FFD66B', '#B9A4FF', '#FFFFFF', '#5FB8F5', '#FFB98F'],
  },
}

// ── Duraklar ─────────────────────────────────────────────────────────────────
const ORDER = ['grammar', 'listen', 'dictation', 'shadowing', 'drill'] as const
type KCard = typeof ORDER[number]
const STOP: Record<KCard, { label: string; sub: string; img: string; ring: string; tint: string; deep: string; desc: string }> = {
  grammar: { label: 'Grammar', sub: 'Kuralı öğren', img: 'books', ring: '#B9A4FF', tint: '#F0EAFF', deep: '#5B3FC4', desc: 'Kısa bir kural, bol örnek. Cümlelerin yanındaki düğmeye dokun, dinleyerek öğren.' },
  listen: { label: 'Dinle', sub: 'Dinle ve izle', img: 'headphone', ring: '#8CCBFF', tint: '#E6F4FF', deep: '#1F6AA8', desc: 'Ünitenin cümlelerini dinle, yazıyı takip et. Sonuna kadar dinleyince durak biter.' },
  dictation: { label: 'Dictation', sub: 'Dinle ve yaz', img: 'pencil', ring: '#FFD66B', tint: '#FFF6D6', deep: '#8A5A0B', desc: 'Duyduğun cümleyi yaz. Takılırsan ipucu gelir.' },
  shadowing: { label: 'Shadowing', sub: 'Dinle ve tekrar et', img: 'mic', ring: '#7FE0C2', tint: '#E2FAF3', deep: '#137259', desc: 'Cümleyi dinle, aynı melodiyle sen de yüksek sesle söyle.' },
  drill: { label: 'Drill', sub: 'Oyna ve pekiştir', img: 'target', ring: '#FF9FCF', tint: '#FFE3F1', deep: '#B8236F', desc: 'Cümleleri sen kur. Her doğru cevapta yıldız kazanırsın.' },
}
// Kart ekranlarının renkleri (eski CARD_META ile aynı adlar)
const CARD_META: Record<KCard, { label: string; sub: string; bg: string }> = {
  grammar: { label: 'Grammar', sub: 'Kuralı öğren', bg: STOP.grammar.deep },
  listen: { label: 'Dinle', sub: 'Video ve ses', bg: STOP.listen.deep },
  dictation: { label: 'Dictation', sub: 'Dinle ve yaz', bg: STOP.dictation.deep },
  drill: { label: 'Drill', sub: 'Oyna ve pekiştir', bg: STOP.drill.deep },
  shadowing: { label: 'Shadowing', sub: 'Dinle ve tekrar et', bg: STOP.shadowing.deep },
}
// Öğrenci etkinliğindeki kart adları (StudentActivity.tsx ile aynı)
const ACT_CARD: Record<KCard, string> = { grammar: 'grammar', listen: 'audio', dictation: 'dictation', drill: 'drill', shadowing: 'shadowing' }

// ── Maskotlar ────────────────────────────────────────────────────────────────
interface Reward { img: string; name: string }
interface Mascot {
  base: string; happy: string; play: string; heartImg: string; toy: string; sound: string; label: string
  my: string; to: string; of: string; give: string   // Kedin / Kedine / Kedinin / Kediye ver
  stages: [string, string, string]
  rewards: Record<KCard, Reward>
  guests: Reward[]
}
const MASCOTS: Record<ChildArea, Mascot> = {
  child_omur: {
    base: 'cat', happy: 'cat-heart', play: 'cat-grin', heartImg: 'heart-pink', toy: 'yarn', sound: 'Miyav!', label: 'Kedi',
    my: 'Kedin', to: 'Kedine', of: 'Kedinin', give: 'Kediye ver',
    stages: ['Yeni doğmuş yavru kedi', 'Yavru kedi', 'Genç kedi'],
    rewards: {
      grammar: { img: 'fish', name: 'Balık' }, listen: { img: 'milk', name: 'Süt' }, dictation: { img: 'yarn', name: 'Yün yumağı' },
      shadowing: { img: 'bell', name: 'Zil' }, drill: { img: 'ribbon', name: 'Kurdele' },
    },
    guests: [{ img: 'dog', name: 'Yavru köpek' }, { img: 'rabbit', name: 'Tavşan' }, { img: 'hatch', name: 'Civciv' }],
  },
  child_oztug: {
    base: 'orca', happy: 'orca', play: 'orca', heartImg: 'heart-blue', toy: 'bubbles', sound: 'Fışşş!', label: 'Orka',
    my: "Orka'n", to: "Orka'na", of: "Orka'nın", give: "Orka'ya ver",
    stages: ['Yeni doğmuş orka', 'Yavru orka', 'Genç orka'],
    rewards: {
      grammar: { img: 'fish', name: 'Balık' }, listen: { img: 'squid', name: 'Kalamar' }, dictation: { img: 'shell', name: 'Deniz kabuğu' },
      shadowing: { img: 'coral', name: 'Mercan' }, drill: { img: 'bubbles', name: 'Baloncuk' },
    },
    guests: [{ img: 'dolphin', name: 'Yunus' }, { img: 'seal', name: 'Fok' }, { img: 'tropical', name: 'Renkli balık' }],
  },
}

// ── Ünite durumu ─────────────────────────────────────────────────────────────
type UStatus = 'empty' | 'progress' | 'waiting' | 'again' | 'complete'
interface UInfo { stops: KCard[]; done: KCard[]; next: KCard | null; focus: KCard | null; status: UStatus; celebrated: boolean }
function unitInfo(t: KidsTopic, done: Set<string>): UInfo {
  const stops = ORDER.filter(k => t[k].state === 'ok' || t[k].state === 'loading')
  const dn = stops.filter(k => done.has(stepKey(t.id, k)))
  const next = stops.find(k => !done.has(stepKey(t.id, k))) ?? null
  let status: UStatus
  if (stops.length === 0) status = 'empty'
  else if (next) status = 'progress'
  else status = t.approval === 'tamam' ? 'complete' : t.approval === 'devam' ? 'again' : 'waiting'
  const focus = next ?? (status === 'again' ? (stops.includes('drill') ? 'drill' : stops[stops.length - 1]) : null)
  return { stops, done: dn, next, focus, status, celebrated: done.has(stepKey(t.id, 'kutlama')) }
}
// Konu haritasında görünenler: geçilen konular + sıradaki konu (sonrası gizli)
function visibleTopics(topics: KidsTopic[], done: Set<string>): { t: KidsTopic; inf: UInfo }[] {
  const out: { t: KidsTopic; inf: UInfo }[] = []
  for (const t of topics) {
    if (t.locked) continue
    const inf = unitInfo(t, done)
    out.push({ t, inf })
    if (inf.status === 'progress' || inf.status === 'empty') break
  }
  return out
}
interface Counts { per: Record<KCard, number>; total: number; trophies: number }
function countRewards(topics: KidsTopic[], done: Set<string>): Counts {
  const per: Record<KCard, number> = { grammar: 0, listen: 0, dictation: 0, shadowing: 0, drill: 0 }
  for (const k of done) {
    const step = k.slice(k.lastIndexOf('|') + 1) as KCard
    if (step in per) per[step]++
  }
  const trophies = topics.filter(t => !t.locked && unitInfo(t, done).status === 'complete').length
  const total = per.grammar + per.listen + per.dictation + per.shadowing + per.drill
  return { per, total, trophies }
}
const stageOf = (trophies: number) => (trophies >= 3 ? 2 : trophies >= 1 ? 1 : 0)
const STAGE_SCALE = [0.72, 0.86, 1]

// ── Harita geometrisi (dikey zikzak yol) ─────────────────────────────────────
interface Pt { x: number; y: number }
interface Geo { vw: number; vh: number; pts: Pt[]; top: Pt; start: Pt }
function geo(n: number, step = 122, topRoom = 175): Geo {
  const vw = 360
  const vh = 110 + Math.max(0, n - 1) * step + topRoom
  const pts = Array.from({ length: n }, (_, i) => ({ x: i % 2 === 0 ? 96 : 264, y: vh - 110 - i * step }))
  return { vw, vh, pts, top: { x: n % 2 === 0 ? 96 : 264, y: 82 }, start: { x: 34, y: vh - 6 } }
}
const curve = (a: Pt, b: Pt) => `M${a.x} ${a.y} C ${a.x} ${a.y - 72}, ${b.x} ${b.y + 72}, ${b.x} ${b.y}`
const pct = (v: number, of: number) => `${(v / of) * 100}%`

// Geniş ekran (tablet yatay / bilgisayar)
function useWide(): boolean {
  const q = '(min-width: 900px)'
  const [wide, setWide] = useState(() => { try { return window.matchMedia(q).matches } catch { return false } })
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = window.matchMedia(q) } catch { return undefined }
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

// ── Stil ─────────────────────────────────────────────────────────────────────
const KIDS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&display=swap');
.kd{min-height:100vh;box-sizing:border-box;font-family:'Nunito',system-ui,sans-serif;-webkit-tap-highlight-color:transparent;overflow-x:hidden}
.kd *{box-sizing:border-box}
.kd button{font-family:inherit}
.kd-in{max-width:560px;margin:0 auto;padding:22px 18px 40px;display:flex;flex-direction:column;gap:18px}
.kd-h,.kd-f{font-family:'Fredoka','Nunito',sans-serif;font-weight:600;margin:0;line-height:1.05;letter-spacing:-.01em}
.kd-wrap{max-width:1180px;margin:0 auto}
.kd-hbody{display:flex;flex-direction:column;gap:18px;padding:0 18px 36px;margin-top:-92px;position:relative}
.kd-ubody{display:flex;flex-direction:column;gap:18px;padding:0 18px 36px;margin-top:-26px;position:relative}
.kd-col{display:flex;flex-direction:column;gap:18px;min-width:0}
@media (min-width:900px){
 .kd-hbody{display:grid;grid-template-columns:420px minmax(0,1fr);column-gap:28px;align-items:start;padding:0 32px 40px;margin-top:-96px}
 .kd-ubody{display:grid;grid-template-columns:minmax(0,480px) minmax(0,1fr);column-gap:28px;align-items:start;padding:0 32px 40px}
}
.kd-tap{transition:transform .15s ease,box-shadow .15s ease;cursor:pointer;border:none;text-align:left;color:inherit;font:inherit}
@media (hover:hover){.kd-tap:hover{transform:translateY(-2px)}}
.kd-tap:active{transform:scale(.97)}
.kd-tap:disabled{cursor:default;transform:none}
.kd-lift{transition:transform .28s cubic-bezier(.2,.9,.3,1.2),box-shadow .28s ease}
@media (hover:hover){.kd-lift:hover{transform:translateY(-4px);box-shadow:0 22px 40px -16px rgba(80,40,120,.38)}}
.kd-lift:active{transform:translateY(0) scale(.98)}
.kd-btn{position:relative;overflow:hidden;cursor:pointer;border:none;transition:transform .2s ease,filter .2s ease}
.kd-btn::after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));transform:skewX(-20deg);transition:left .7s ease}
@media (hover:hover){.kd-btn:hover::after{left:140%}.kd-btn:hover{filter:brightness(1.06)}}
.kd-btn:active{transform:scale(.96)}
.kd-btn:disabled{cursor:not-allowed;filter:grayscale(.4);opacity:.7}
.kd-ndw{position:absolute;z-index:3;transform:translate(-50%,-50%)}
.kd-nd{transition:transform .3s cubic-bezier(.3,1.7,.5,1),box-shadow .3s}
@media (hover:hover){.kd-nd:hover{transform:scale(1.1) rotate(-4deg)}}
.kd-nd:active{transform:scale(.95)}
.kd-tip{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translate(-50%,6px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;white-space:nowrap;padding:6px 12px;border-radius:12px;background:#2A1838;color:#FFFFFF;font-size:13px;font-weight:800;z-index:9}
@media (hover:hover){.kd-ndw:hover .kd-tip{opacity:1;transform:translate(-50%,0)}}
.kd-back{display:flex;align-items:center;gap:6px;min-height:46px;padding:0 16px;border-radius:14px;background:#FFFFFF;font-size:16px;font-weight:800;color:#3B3650;cursor:pointer;align-self:flex-start}
.kd-big{text-align:center;min-height:60px;border-radius:18px;border:none;font-family:'Fredoka',sans-serif;font-size:23px;font-weight:600;cursor:pointer;color:#FFFFFF;padding:0 24px}
.kd-big:disabled{background:#E9E4EC !important;color:#6B6580 !important;cursor:not-allowed}
.kd-soft{text-align:center;min-height:50px;border-radius:16px;background:#FFFFFF;font-size:16px;font-weight:800;cursor:pointer;padding:0 18px}
.kd-input{width:100%;min-height:62px;padding:10px 18px;border-radius:18px;outline:none;font-family:'Fredoka',sans-serif;font-size:24px;font-weight:500;color:#1E1B2E;background:#FFFFFF}
.kd-chip{padding:4px 10px;border-radius:10px;font-family:'Fredoka',sans-serif;font-size:20px;font-weight:600}
@keyframes kdwig{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes kdpop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
@keyframes kdbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes kdshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes kdstar{0%{transform:scale(.2) rotate(-30deg);opacity:0}60%{transform:scale(1.25) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}
@keyframes kdfall{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(620deg);opacity:.9}}
@keyframes kdpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes kdfloaty{0%,100%{transform:translate(0,0)}50%{transform:translate(10px,-6px)}}
@keyframes kddrift{0%{transform:translateX(-30px)}100%{transform:translateX(30px)}}
@keyframes kdtwinkle{0%,100%{transform:scale(.85) rotate(0);opacity:.7}50%{transform:scale(1.1) rotate(12deg);opacity:1}}
@keyframes kdring{0%,100%{box-shadow:0 0 0 0 var(--kd-ring,rgba(255,111,181,.55)),0 12px 24px -8px rgba(80,40,120,.4)}50%{box-shadow:0 0 0 12px rgba(255,255,255,0),0 12px 24px -8px rgba(80,40,120,.4)}}
@keyframes kdhop{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-30px) rotate(-8deg)}60%{transform:translateY(0) rotate(4deg)}80%{transform:translateY(-8px)}}
@keyframes kdbreathe{0%,100%{transform:scale(1,1) rotate(-6deg)}50%{transform:scale(1.03,1.06) rotate(-6deg)}}
@keyframes kdzz{0%{transform:translate(0,6px) scale(.7);opacity:0}30%{opacity:1}100%{transform:translate(14px,-22px) scale(1.05);opacity:0}}
@keyframes kdheartup{0%{transform:translateY(0) scale(.4);opacity:0}25%{opacity:1;transform:translateY(-10px) scale(1)}100%{transform:translateY(-60px) scale(.8);opacity:0}}
@keyframes kdbubble{0%{transform:scale(.3);opacity:0}20%{transform:scale(1.12);opacity:1}80%{transform:scale(1);opacity:1}100%{transform:scale(.9);opacity:0}}
@keyframes kdroll{0%{left:-18%;transform:rotate(0)}100%{left:110%;transform:rotate(1000deg)}}
@keyframes kdrise{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translateY(-420px) scale(1.1);opacity:0}}
@keyframes kdpeek{0%{transform:translateX(120%) rotate(-14deg)}20%{transform:translateX(18%) rotate(-14deg)}35%{transform:translateX(22%) rotate(-6deg)}80%{transform:translateX(18%) rotate(-14deg)}100%{transform:translateX(120%) rotate(-14deg)}}
@keyframes kdscr{0%,10%{stroke-dashoffset:120;opacity:0}30%{stroke-dashoffset:0;opacity:.9}80%{opacity:.75}100%{stroke-dashoffset:0;opacity:0}}
@keyframes kdslide{0%{transform:translateX(-120%)}40%,60%{transform:translateX(0)}100%{transform:translateX(130%)}}
@keyframes kdfade{0%{opacity:0}100%{opacity:1}}
@keyframes kdsheet{0%{transform:translateY(100%)}100%{transform:translateY(0)}}
@keyframes kdgift{0%,100%{transform:rotate(0) scale(1)}10%{transform:rotate(-9deg) scale(1.04)}20%{transform:rotate(9deg) scale(1.04)}30%{transform:rotate(-6deg)}40%{transform:rotate(6deg)}50%{transform:rotate(0)}}
@keyframes kdpopin{0%{transform:scale(.2) rotate(-20deg);opacity:0}65%{transform:scale(1.15) rotate(5deg);opacity:1}100%{transform:scale(1) rotate(0)}}
@keyframes kdspin{0%{transform:translate(-50%,-50%) rotate(0)}100%{transform:translate(-50%,-50%) rotate(360deg)}}
.kd-wig{animation:kdwig 2.4s ease-in-out infinite;transform-origin:50% 80%;display:inline-block}
.kd-pop{animation:kdpop .5s ease-out both}
.kd-bob{animation:kdbob 3s ease-in-out infinite;display:inline-block}
.kd-shake{animation:kdshake .35s ease-in-out}
.kd-star{animation:kdstar .6s ease-out both}
.kd-pulse{animation:kdpulse 1.2s ease-in-out infinite}
.kd-floaty{animation:kdfloaty 7s ease-in-out infinite}
.kd-drift{animation:kddrift 9s ease-in-out infinite alternate}
.kd-twinkle{animation:kdtwinkle 2.6s ease-in-out infinite}
.kd-ring{animation:kdring 1.8s ease-in-out infinite}
.kd-hop{animation:kdhop .9s ease-out;display:block}
.kd-idle{animation:kdbob 3.2s ease-in-out infinite;display:block}
.kd-sleep{animation:kdbreathe 2.8s ease-in-out infinite;transform-origin:50% 100%;display:block;filter:saturate(.8) brightness(.97)}
.kd-zz{animation:kdzz 2.2s ease-out infinite}
.kd-heartup{animation:kdheartup 1.5s ease-out both}
.kd-bubble{animation:kdbubble 1.6s ease-out both;transform-origin:0% 100%}
.kd-roll{animation:kdroll 4s cubic-bezier(.4,.1,.6,.9) both}
.kd-rise{animation:kdrise 3.6s ease-out both}
.kd-peek{animation:kdpeek 4.2s ease-in-out both}
.kd-scr{stroke-dasharray:120;animation:kdscr 4s ease-out both}
.kd-slide{animation:kdslide 4.2s ease-in-out both}
.kd-fade{animation:kdfade .35s ease-out both}
.kd-sheet{animation:kdsheet .45s cubic-bezier(.2,1,.3,1) both}
.kd-gift{animation:kdgift 1.4s ease-in-out infinite}
.kd-popin{animation:kdpopin .7s cubic-bezier(.3,1.5,.5,1) both}
.kd-rays{position:absolute;left:50%;top:44%;width:1100px;height:1100px;border-radius:50%;background:repeating-conic-gradient(rgba(255,255,255,.22) 0 10deg,rgba(255,255,255,0) 10deg 24deg);animation:kdspin 26s linear infinite;pointer-events:none;-webkit-mask-image:radial-gradient(circle,#000 0,transparent 62%);mask-image:radial-gradient(circle,#000 0,transparent 62%)}
.kd-cf{position:fixed;top:-30px;width:10px;height:14px;border-radius:3px;animation:kdfall 2.4s cubic-bezier(.3,.2,.6,1) both;pointer-events:none;z-index:120}
.kd-overlay{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;overflow:hidden}
@media (prefers-reduced-motion: reduce){.kd-wig,.kd-pop,.kd-bob,.kd-shake,.kd-star,.kd-pulse,.kd-floaty,.kd-drift,.kd-twinkle,.kd-ring,.kd-hop,.kd-idle,.kd-sleep,.kd-zz,.kd-gift,.kd-rays,.kd-roll,.kd-rise,.kd-peek,.kd-slide{animation:none}.kd-cf{display:none}.kd-tap,.kd-lift,.kd-nd{transition:none}}
`

function KidsStyle() { return <style>{KIDS_CSS}</style> }

// ── Küçük parçalar ───────────────────────────────────────────────────────────
function Chevron({ color = '#FFFFFF', size = 26 }: { color?: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
}
function StarIcon({ size = 24, className }: { size?: number; className?: string }) {
  return <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="#F59E0B" stroke="#B45309" strokeWidth="1.3" strokeLinejoin="round"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" /></svg>
}
function CheckBadge({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ position: 'absolute', top: -4, right: -4, width: size, height: size, borderRadius: '50%', background: color, border: '3px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
    </span>
  )
}
function RoundBack({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="kd-btn" onClick={onClick} aria-label={label} style={{ width: 48, height: 48, borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -8px rgba(40,20,60,.5)', flexShrink: 0 }}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2A1838" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
  )
}
function BackButton({ label, line, onClick }: { label: string; line: string; onClick: () => void }) {
  return (
    <button className="kd-back kd-tap" onClick={onClick} style={{ border: `2px solid ${line}` }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B3650" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      {label}
    </button>
  )
}

const CF_COLORS = ['#FF9FCF', '#B9A4FF', '#8CCBFF', '#FFD66B', '#7FE0C2', '#FFB98F']
// Konfeti (hareket azaltma açıkken görünmez)
function Confetti({ burst, colors = CF_COLORS, n = 34 }: { burst: number; colors?: string[]; n?: number }) {
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (!burst) return undefined
    setOn(burst)
    const t = window.setTimeout(() => setOn(0), 3200)
    return () => window.clearTimeout(t)
  }, [burst])
  if (!on) return null
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={`${on}-${i}`} className="kd-cf" style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.09}s`, width: `${8 + (i % 3) * 4}px`, height: `${10 + (i % 4) * 3}px`, borderRadius: i % 3 === 0 ? '50%' : '3px' }} />
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

// Kart ekranlarının ortak çerçevesi (durak rengiyle)
function Frame({ topic, card, onBack, right, sub, children }: { topic: KidsTopic; card: KCard; onBack: () => void; right?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  const s = STOP[card]
  return (
    <div className="kd" style={{ background: `linear-gradient(180deg, ${s.tint} 0%, #FFFFFF 70%)`, color: '#1E1B2E' }}>
      <KidsStyle />
      <div className="kd-in" style={{ gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <BackButton label={topic.title} line={s.ring} onClick={onBack} />
          {right}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <img src={IMG(s.img)} alt="" style={{ width: 44, height: 44 }} />
          <h1 className="kd-h" style={{ fontSize: 32, color: s.deep }}>{s.label}</h1>
          {sub}
        </div>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Maskot: kendi kendine hareket eder (zıplar, ses çıkarır, oyuncağıyla oynar,
// köşeden bakar); 15 saniye dokunulmazsa uyur; dokununca uyanıp sevinir.
// ═══════════════════════════════════════════════════════════════════════════
type Act = 'hop' | 'sound' | 'toy' | 'peek' | 'scratch' | null
interface Life { sleep: boolean; heart: boolean; act: Act; sound: boolean; tick: number; poke: () => void; tap: () => void }
function useMascotLife(actsKey: string, paused: boolean): Life {
  const [sleep, setSleep] = useState(false)
  const [heart, setHeart] = useState(false)
  const [act, setAct] = useState<Act>(null)
  const [sound, setSound] = useState(false)
  const [tick, setTick] = useState(0)
  const last = useRef(Date.now())
  const nextAt = useRef(Date.now() + 5000)
  const endAt = useRef(0)
  const ai = useRef(0)
  const st = useRef({ sleep, act, paused })
  st.current = { sleep, act, paused }
  const timers = useRef<number[]>([])
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }, [])
  useEffect(() => {
    const acts = actsKey ? (actsKey.split(',') as Exclude<Act, null>[]) : []
    const iv = window.setInterval(() => {
      const now = Date.now()
      const s = st.current
      if (s.sleep) return
      if (!s.act && !s.paused && now - last.current > 15000) { setSleep(true); return }
      if (s.act && now > endAt.current) { setAct(null); nextAt.current = now + 7000 + Math.random() * 4000; return }
      if (!s.act && !s.paused && now > nextAt.current && acts.length > 0) {
        const a = acts[ai.current % acts.length]
        ai.current++
        endAt.current = now + (a === 'sound' || a === 'hop' ? 1600 : 4300)
        setAct(a)
        setTick(t => t + 1)
        if (a === 'sound') { setSound(true); later(() => setSound(false), 1600) }
      }
    }, 400)
    return () => window.clearInterval(iv)
  }, [actsKey, later])
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)) }, [])
  const poke = useCallback(() => { last.current = Date.now() }, [])
  const tap = useCallback(() => {
    last.current = Date.now()
    setSleep(false); setHeart(true); setSound(true); setAct(null); setTick(t => t + 1)
    later(() => { setHeart(false); setSound(false) }, 1700)
  }, [later])
  return { sleep, heart, act, sound, tick, poke, tap }
}

function MascotBtn({ m, life, style, big }: { m: Mascot; life: Life; style?: CSSProperties; big?: boolean }) {
  const cls = life.sleep ? 'kd-sleep' : (life.act === 'hop' || life.heart ? 'kd-hop' : 'kd-idle')
  const src = life.heart ? m.happy : life.act === 'toy' ? m.play : m.base
  return (
    <button type="button" onClick={e => { e.stopPropagation(); life.tap() }} aria-label={`${m.label}. Dokun, sevinsin.`}
      style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...style }}>
      <span key={`${cls}-${life.tick}`} className={cls}>
        <img src={IMG(src)} alt="" draggable={false} style={{ width: '100%', display: 'block', filter: 'drop-shadow(0 6px 6px rgba(60,30,90,.25))' }} />
      </span>
      {life.sleep && <img className="kd-zz" src={IMG('zzz')} alt="" style={{ position: 'absolute', right: '-22%', top: '-26%', width: '46%' }} />}
      {life.heart && <img className="kd-heartup" src={IMG(m.heartImg)} alt="" style={{ position: 'absolute', left: '30%', top: '-12%', width: '32%' }} />}
      {life.sound && (
        <span className="kd-bubble kd-f" style={{ position: 'absolute', left: '72%', top: big ? '-18%' : '-38%', padding: '6px 12px', borderRadius: '16px 16px 16px 4px', background: '#FFFFFF', color: '#2A1838', fontSize: big ? 22 : 17, whiteSpace: 'nowrap', boxShadow: '0 8px 16px -8px rgba(60,30,90,.5)', zIndex: 2 }}>{m.sound}</span>
      )}
    </button>
  )
}

// Haritada maskotun ara sıra yaptıkları (oyuncak geçer, köşeden bakar, tırnak/dalga)
function MapActs({ m, life, orca }: { m: Mascot; life: Life; orca: boolean }) {
  if (!life.act || life.act === 'hop' || life.act === 'sound') return null
  const k = life.tick
  if (life.act === 'toy') {
    return orca ? (
      <div aria-hidden="true" key={k} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
        {[18, 46, 74].map((l, i) => <img key={i} className="kd-rise" src={IMG('bubbles')} alt="" style={{ position: 'absolute', left: `${l}%`, bottom: 10, width: 46 - i * 6, animationDelay: `${i * 0.5}s` }} />)}
      </div>
    ) : (
      <img aria-hidden="true" key={k} className="kd-roll" src={IMG(m.toy)} alt="" style={{ position: 'absolute', bottom: 18, width: 54, zIndex: 4, pointerEvents: 'none' }} />
    )
  }
  if (life.act === 'peek') {
    return <img aria-hidden="true" key={k} className="kd-peek" src={IMG(m.base)} alt="" style={{ position: 'absolute', right: 0, top: '42%', width: 96, zIndex: 6, pointerEvents: 'none' }} />
  }
  // scratch: kedi ekrana tırnak atar; orka dalga sıçratır
  return orca ? (
    <img aria-hidden="true" key={k} className="kd-slide" src={IMG('wave')} alt="" style={{ position: 'absolute', left: 0, bottom: '30%', width: 140, zIndex: 6, pointerEvents: 'none' }} />
  ) : (
    <div aria-hidden="true" key={k} style={{ position: 'absolute', left: '22%', top: '18%', zIndex: 6, pointerEvents: 'none' }}>
      <svg width="200" height="150" viewBox="0 0 200 150">
        <path className="kd-scr" d="M30 10 Q70 70 90 140" stroke="#E86AA6" strokeWidth="7" strokeLinecap="round" fill="none" />
        <path className="kd-scr" d="M70 6 Q110 66 130 136" stroke="#E86AA6" strokeWidth="7" strokeLinecap="round" fill="none" style={{ animationDelay: '.12s' }} />
        <path className="kd-scr" d="M110 10 Q150 70 170 140" stroke="#E86AA6" strokeWidth="7" strokeLinecap="round" fill="none" style={{ animationDelay: '.24s' }} />
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Ana ekran
// ═══════════════════════════════════════════════════════════════════════════
function Hearts({ n, img }: { n: number; img: string }) {
  return (
    <span style={{ display: 'flex', gap: 3 }} aria-label={`Mutluluk ${n} / 5`}>
      {[0, 1, 2, 3, 4].map(i => <img key={i} src={IMG(img)} alt="" style={{ width: 22, height: 22, filter: i < n ? 'none' : 'grayscale(1)', opacity: i < n ? 1 : 0.3 }} />)}
    </span>
  )
}
const happyText = (n: number) => (n >= 5 ? 'Çok çok mutlu!' : n >= 3 ? 'Çok mutlu' : n >= 1 ? 'Mutlu' : 'Seni bekliyor')
// Mutluluk yalnızca artar (ceza yok): her iki ödülde bir kalp, en çok 5
function happinessOf(total: number): number {
  return total <= 0 ? 0 : Math.min(5, 1 + Math.floor(total / 2))
}

function BrainCard({ theme, items, status, onOpen }: { theme: KTheme; items: MemoryItem[]; status: string; onOpen: () => void }) {
  const known = items.filter(i => i.status === 'known').length
  const words = items.filter(i => i.type === 'word').length
  const sub = status === 'loading' && items.length === 0 ? 'Yükleniyor…'
    : items.length === 0 ? 'Öğrendiğin kelimeler burada parlıyor'
    : `${words} kelime${items.length - words > 0 ? ` · ${items.length - words} yapı` : ''} · ${known} biliyorum`
  return (
    <button className="kd-lift kd-tap" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, background: '#F0EAFF', width: '100%', color: theme.ink }}>
      <img src={IMG('brain')} alt="" style={{ width: 58, height: 58 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="kd-f" style={{ display: 'block', fontSize: 22 }}>My Brain</span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: theme.sub, marginTop: 3 }}>{sub}</span>
      </span>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Chevron color="#5B3FC4" size={18} /></span>
    </button>
  )
}

function MemoryCard({ theme, unut, onOpen }: { theme: KTheme; unut: UnutState; onOpen: () => void }) {
  const sub = unut.status !== 'ok' ? 'Yükleniyor…' : unut.dueCount > 0 ? `${unut.dueCount} kart seni bekliyor` : 'Bugünlük tamam!'
  return (
    <button className="kd-lift kd-tap" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, background: '#FFFFFF', width: '100%', color: theme.ink, boxShadow: `0 14px 30px -22px ${theme.shadow}` }}>
      <img src={IMG('sparkles')} alt="" style={{ width: 52, height: 52 }} />
      <span style={{ flex: 1 }}>
        <span className="kd-f" style={{ display: 'block', fontSize: 21 }}>Memory</span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: theme.sub }}>{sub}</span>
      </span>
      {unut.dueCount > 0 && <span style={{ minWidth: 30, height: 30, borderRadius: 999, background: theme.accent, color: '#FFFFFF', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>{unut.dueCount}</span>}
      <Chevron color={theme.sub} size={22} />
    </button>
  )
}

function TopicMap({ theme, vis, current, onTopic }: { theme: KTheme; vis: { t: KidsTopic; inf: UInfo }[]; current: string | null; onTopic: (id: string) => void }) {
  const g = geo(vis.length, 118, 100)
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${g.vw} / ${g.vh}`, borderRadius: 24, overflow: 'hidden', background: theme.mapBg }}>
      <svg aria-hidden="true" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 120 }}><path d="M0 64 Q100 18 200 56 T400 44 V120 H0Z" fill={theme.hill1} /><path d="M0 92 Q120 58 240 88 T400 76 V120 H0Z" fill={theme.hill2} /></svg>
      <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', left: '52%', top: 14, width: 70, opacity: 0.9 }} />
      <img src={IMG(theme.deco[1])} alt="" style={{ position: 'absolute', left: 4, bottom: '28%', width: 54 }} />
      <img className="kd-twinkle" src={IMG(theme.deco[0])} alt="" style={{ position: 'absolute', right: '8%', bottom: 24, width: 30 }} />
      <svg aria-hidden="true" viewBox={`0 0 ${g.vw} ${g.vh}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {g.pts.map((p, i) => {
          const a = i === 0 ? g.start : g.pts[i - 1]
          const d = curve(a, p)
          const passed = vis[i].inf.status !== 'progress' && vis[i].inf.status !== 'empty'
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#FFFFFF" strokeWidth="24" strokeLinecap="round" />
              <path d={d} fill="none" stroke={passed ? theme.road : theme.ring} strokeWidth={passed ? 8 : 4} strokeLinecap="round" strokeDasharray={passed ? undefined : '2 12'} />
            </g>
          )
        })}
      </svg>
      {vis.map(({ t, inf }, i) => {
        const p = g.pts[i]
        const isCur = t.id === current
        const frac = inf.stops.length ? inf.done.length / inf.stops.length : 0
        const size = isCur ? 96 : 80
        const tip = inf.status === 'complete' ? 'Bitti! Kupanı kazandın' : inf.status === 'waiting' ? 'Öğretmenin bakıyor' : inf.status === 'again' ? 'Bir tur daha!' : inf.status === 'empty' ? 'Hazırlanıyor' : `Devam et · ${inf.done.length}/${inf.stops.length}`
        return (
          <div key={t.id} className="kd-ndw" style={{ left: pct(p.x, g.vw), top: pct(p.y, g.vh), width: size }}>
            <button className={'kd-nd' + (isCur ? ' kd-ring' : '')} onClick={() => onTopic(t.id)} aria-label={`${t.title}: ${tip}`}
              style={{ position: 'relative', width: size, height: size, borderRadius: '50%', border: 'none', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: `0 12px 22px -10px ${theme.shadow}` }}>
              <svg aria-hidden="true" viewBox="0 0 120 120" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="54" fill="none" stroke={theme.accentSoft} strokeWidth="9" />
                <circle cx="60" cy="60" r="54" fill="none" stroke={theme.ring} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${Math.round(339 * (inf.status === 'progress' ? frac : 1))} 340`} />
              </svg>
              <span style={{ position: 'relative', fontSize: size * 0.48, lineHeight: 1 }}>{t.icon}</span>
              {inf.status === 'complete' && <img src={IMG('trophy')} alt="" style={{ position: 'absolute', right: -8, bottom: -6, width: 34 }} />}
              {(inf.status === 'waiting' || inf.status === 'again') && <img src={IMG('hourglass')} alt="" style={{ position: 'absolute', right: -8, bottom: -6, width: 30 }} />}
            </button>
            <span className="kd-f" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', padding: '4px 12px', borderRadius: 999, background: isCur ? theme.accent : 'rgba(255,255,255,.92)', color: isCur ? '#FFFFFF' : theme.ink, fontSize: 15 }}>{t.title}</span>
            <span className="kd-tip">{tip}</span>
          </div>
        )
      })}
    </div>
  )
}

function KidsHome({ childName, theme, m, life, vis, current, counts, preview, brainItems, brainStatus, unut, showMemory, onBrain, onMemory, onTopic, onNest, onExit }: {
  childName: string; theme: KTheme; m: Mascot; life: Life; vis: { t: KidsTopic; inf: UInfo }[]; current: { t: KidsTopic; inf: UInfo } | null
  counts: Counts; preview: boolean; brainItems: MemoryItem[]; brainStatus: string; unut: UnutState; showMemory: boolean
  onBrain: () => void; onMemory: () => void; onTopic: (id: string) => void; onNest: () => void; onExit: () => void
}) {
  const inf = current?.inf ?? null
  const t = current?.t ?? null
  const happy = happinessOf(counts.total)
  const tag = !inf ? '' : inf.status === 'complete' ? 'TAMAMLANDI' : inf.status === 'waiting' ? 'ÖĞRETMENİN BAKIYOR' : inf.status === 'again' ? 'BİR TUR DAHA' : inf.done.length === 0 ? (t?.isNew ? 'YENİ KONU' : 'SIRADAKİ KONU') : 'KALDIĞIN YERDEN'
  const btn = !inf ? '' : inf.status === 'empty' ? 'Hazırlanıyor' : inf.status === 'complete' ? 'Tekrar gez' : inf.status === 'waiting' ? 'Haritaya bak' : inf.status === 'again' ? 'Bir tur daha' : inf.done.length === 0 ? 'Başla' : 'Devam et'
  return (
    <div className="kd" style={{ background: theme.page, color: theme.ink }}>
      <KidsStyle />
      <div style={{ position: 'relative', padding: '22px 22px 124px', background: theme.top, borderRadius: '0 0 40px 40px', overflow: 'hidden' }}>
        <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', right: -6, top: 58, width: 110, opacity: 0.95 }} />
        <img className="kd-floaty" src={IMG('cloud')} alt="" style={{ position: 'absolute', left: '46%', top: 118, width: 64, opacity: 0.8 }} />
        <img className="kd-twinkle" src={IMG('sparkles')} alt="" style={{ position: 'absolute', right: 140, top: 24, width: 34 }} />
        <img className="kd-floaty" src={IMG(theme.deco[0])} alt="" style={{ position: 'absolute', left: 16, bottom: 94, width: 30, opacity: 0.9 }} />
        <div className="kd-wrap" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div aria-hidden="true" className="kd-f" style={{ width: 52, height: 52, borderRadius: '50%', background: '#FFFFFF', color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, boxShadow: `0 6px 14px -6px ${theme.shadow}` }}>{childName[0]}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 8px', borderRadius: 999, background: 'rgba(255,255,255,.75)', fontWeight: 800, fontSize: 16 }} aria-label={`${counts.total} ödül`}>
                <img src={IMG('paws')} alt="" style={{ width: 26, height: 26 }} />{counts.total}<span style={{ fontSize: 13, color: theme.sub, fontWeight: 700 }}>ödül</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <InstallButton variant="round" bg="rgba(255,255,255,.75)" fg={theme.accent} style={{ width: 46, height: 46 }} />
              <button onClick={onExit} aria-label="Çıkış" className="kd-btn" style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
              </button>
            </div>
          </div>
          <h1 className="kd-f" style={{ position: 'relative', fontSize: 'clamp(30px, 8vw, 40px)', marginTop: 22, fontWeight: 700 }}>Merhaba {childName}!</h1>
          <p style={{ position: 'relative', margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: theme.sub }}>{m.my} seni bekliyor, hadi başlayalım.</p>
          {preview && <span style={{ position: 'relative', display: 'inline-block', marginTop: 8, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: 800, color: theme.sub }}>Öğretmen önizlemesi · ilerleme kaydedilmez</span>}
        </div>
      </div>

      <div className="kd-wrap">
        <div className="kd-hbody">
          <div className="kd-col">
            {t && inf ? (
              <div className="kd-lift" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 30, background: '#FFFFFF', boxShadow: `0 18px 36px -18px ${theme.shadow}` }}>
                <div style={{ position: 'relative', width: 118, height: 118, flexShrink: 0, borderRadius: 34, background: `radial-gradient(circle at 50% 60%, ${theme.accentSoft} 0%, ${theme.road}55 75%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MascotBtn m={m} life={life} style={{ width: 92 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: theme.accent }}>{tag}</span>
                  <span className="kd-f" style={{ fontSize: 30 }}>{t.title}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: theme.sub }}>{[t.subtitle, t.id].filter(Boolean).join(' · ')}</span>
                  {inf.stops.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <div style={{ flex: 1, height: 12, borderRadius: 999, background: theme.accentSoft, overflow: 'hidden' }}><div style={{ width: `${Math.round((inf.done.length / inf.stops.length) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${theme.road}, ${theme.ring})`, transition: 'width .6s ease' }} /></div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: theme.sub }}>{inf.done.length}/{inf.stops.length}</span>
                    </div>
                  )}
                  <button className="kd-btn kd-f" disabled={inf.status === 'empty'} onClick={() => onTopic(t.id)} style={{ alignSelf: 'flex-start', marginTop: 4, padding: '11px 20px', borderRadius: 16, background: theme.accent, color: '#FFFFFF', fontSize: 18, boxShadow: `0 10px 18px -8px ${theme.accent}` }}>{btn} →</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, borderRadius: 30, background: '#FFFFFF', boxShadow: `0 18px 36px -18px ${theme.shadow}` }}>
                <MascotBtn m={m} life={life} style={{ width: 92, flexShrink: 0 }} />
                <span>
                  <span className="kd-f" style={{ display: 'block', fontSize: 24 }}>Yakında yeni konular geliyor!</span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: theme.sub, marginTop: 4 }}>Öğretmenin hazırlıyor.</span>
                </span>
              </div>
            )}

            <button className="kd-lift kd-tap" onClick={onNest} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, background: theme.accentSoft, width: '100%', color: theme.ink }}>
              <span style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
                <img src={IMG(theme.deco[2])} alt="" style={{ width: 58, height: 58 }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="kd-f" style={{ display: 'block', fontSize: 22 }}>{m.of} yuvası</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                  <Hearts n={happy} img={m.heartImg} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: theme.sub }}>{happyText(happy)}</span>
                </span>
              </span>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Chevron color={theme.accent} size={18} /></span>
            </button>

            <BrainCard theme={theme} items={brainItems} status={brainStatus} onOpen={onBrain} />
            {showMemory && <MemoryCard theme={theme} unut={unut} onOpen={onMemory} />}
          </div>

          <div className="kd-col">
            {vis.length > 0 && (
              <div style={{ padding: 18, borderRadius: 30, background: '#FFFFFF', boxShadow: `0 18px 36px -20px ${theme.shadow}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 className="kd-f" style={{ fontSize: 24 }}>Konu haritam</h2>
                  {counts.trophies > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontSize: 13, fontWeight: 800 }}>
                      <img src={IMG('trophy')} alt="" style={{ width: 18, height: 18 }} />{counts.trophies} kupa
                    </span>
                  )}
                </div>
                <div style={{ maxWidth: 460, margin: '0 auto' }}>
                  <TopicMap theme={theme} vis={vis} current={t?.id ?? null} onTopic={onTopic} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Ünite: oyun haritası
// ═══════════════════════════════════════════════════════════════════════════
function UnitMap({ inf, theme, m, life, sel, wide, replayed, onSelect }: {
  inf: UInfo; theme: KTheme; m: Mascot; life: Life; sel: KCard | null; wide: boolean; replayed: boolean; onSelect: (k: KCard) => void
}) {
  const allDone = inf.status !== 'progress' && inf.status !== 'empty'
  const againOn = inf.status === 'again' && !replayed   // öğretmen "devam" dedi, tur henüz oynanmadı
  const orca = m.base === 'orca'
  // Yalnızca bitenler + sıradaki durak; yol çocuk ilerledikçe uzar
  const shown = inf.stops.filter(k => inf.done.includes(k) || k === inf.focus)
  const g = geo(Math.max(shown.length, 1), 122, allDone ? 175 : 120)
  const at = inf.focus && (inf.status === 'progress' || againOn) ? g.pts[shown.indexOf(inf.focus)] : allDone ? g.top : g.pts[0]
  const ms = wide ? 84 : 66
  const nearRight = at.x > g.vw / 2
  const mx = nearRight ? at.x - 82 : at.x + 82
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${g.vw} / ${g.vh}`, borderRadius: 32, overflow: 'hidden', background: theme.mapBg, boxShadow: `0 20px 40px -22px ${theme.shadow}` }}>
      <svg aria-hidden="true" viewBox="0 0 400 140" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 150 }}><path d="M0 70 Q100 18 210 60 T400 46 V140 H0Z" fill={theme.hill1} /><path d="M0 104 Q130 64 250 98 T400 86 V140 H0Z" fill={theme.hill2} /></svg>
      <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', left: '4%', top: 16, width: 74, opacity: 0.95 }} />
      <img className="kd-floaty" src={IMG('cloud')} alt="" style={{ position: 'absolute', right: '6%', top: '34%', width: 58, opacity: 0.8 }} />
      <img src={IMG(theme.deco[2])} alt="" style={{ position: 'absolute', right: '4%', bottom: 18, width: 76 }} />
      <img src={IMG(theme.deco[1])} alt="" style={{ position: 'absolute', left: 4, top: '44%', width: 60 }} />
      <img className="kd-twinkle" src={IMG(theme.deco[0])} alt="" style={{ position: 'absolute', left: '48%', top: '60%', width: 28 }} />
      <img className="kd-twinkle" src={IMG('sparkles')} alt="" style={{ position: 'absolute', left: '12%', top: '20%', width: 26, animationDelay: '1.4s' }} />

      <svg aria-hidden="true" viewBox={`0 0 ${g.vw} ${g.vh}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {shown.map((k, i) => {
          const d = curve(i === 0 ? g.start : g.pts[i - 1], g.pts[i])
          const passed = inf.done.includes(k)
          return (
            <g key={k}>
              <path d={d} fill="none" stroke="#FFFFFF" strokeWidth="30" strokeLinecap="round" />
              {passed
                ? <path d={d} fill="none" stroke={theme.road} strokeWidth="10" strokeLinecap="round" />
                : <path d={d} fill="none" stroke={theme.ring} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" />}
            </g>
          )
        })}
        {allDone && shown.length > 0 && (
          <g>
            <path d={curve(g.pts[g.pts.length - 1], g.top)} fill="none" stroke="#FFFFFF" strokeWidth="30" strokeLinecap="round" />
            <path d={curve(g.pts[g.pts.length - 1], g.top)} fill="none" stroke={inf.status === 'complete' ? theme.road : theme.ring} strokeWidth={inf.status === 'complete' ? 10 : 4} strokeLinecap="round" strokeDasharray={inf.status === 'complete' ? undefined : '2 12'} />
          </g>
        )}
      </svg>

      {allDone && (
        <div className="kd-ndw" style={{ left: pct(g.top.x, g.vw), top: pct(g.top.y, g.vh), width: 76 }}>
          <div className={'kd-nd' + (inf.status === 'complete' ? ' kd-popin' : '')} style={{ width: 76, height: 76, borderRadius: '50%', background: 'radial-gradient(circle,#FFF6D6 0%,#FFE7A3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 24px -10px rgba(183,121,31,.6)' }}>
            <img src={IMG(inf.status === 'complete' ? 'trophy' : 'hourglass')} alt="" style={{ width: '62%', filter: inf.status === 'complete' ? 'none' : 'saturate(.9)' }} />
          </div>
          <span className="kd-tip">{inf.status === 'complete' ? 'Kupan burada!' : 'Öğretmenin bakıyor'}</span>
        </div>
      )}

      {shown.map((k, i) => {
        const s = STOP[k]
        const p = g.pts[i]
        const done = inf.done.includes(k)
        const isFocus = k === inf.focus && (inf.status === 'progress' || againOn)
        const size = isFocus ? (wide ? 96 : 86) : (wide ? 80 : 72)
        const picked = sel === k
        const tip = isFocus && againOn ? 'Bir tur daha!' : isFocus && !done ? 'Sıradaki durak, hadi!' : 'Bitti! Tekrar oynayabilirsin'
        return (
          <div key={k} className="kd-ndw" style={{ left: pct(p.x, g.vw), top: pct(p.y, g.vh), width: size }}>
            <button className={'kd-nd' + (isFocus ? ' kd-ring' : '')} onClick={e => { e.stopPropagation(); onSelect(k) }} aria-label={`${inf.stops.indexOf(k) + 1}. durak: ${s.label}${done ? ', bitti' : ', sıradaki'}`}
              style={{ width: size, height: size, borderRadius: '50%', border: `5px solid ${s.ring}`, outline: picked && wide ? `4px solid ${s.deep}55` : 'none', outlineOffset: 3, background: done ? s.tint : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 12px 22px -10px rgba(60,30,90,.45)' }}>
              <img src={IMG(s.img)} alt="" style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }} />
            </button>
            {done && !(isFocus && againOn) && <CheckBadge color={theme.ring} />}
            <span className="kd-f" style={{ position: 'absolute', top: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', padding: '3px 11px', borderRadius: 999, background: isFocus ? s.deep : 'rgba(255,255,255,.92)', color: isFocus ? '#FFFFFF' : s.deep, fontSize: 14 }}>{s.label}</span>
            <span className="kd-tip">{tip}</span>
          </div>
        )
      })}

      <MapActs m={m} life={life} orca={orca} />

      <div style={{ position: 'absolute', left: pct(mx, g.vw), top: pct(at.y, g.vh), width: ms, transform: 'translate(-50%,-78%)', transition: 'left 1s cubic-bezier(.5,1.3,.5,1), top 1s cubic-bezier(.5,1.3,.5,1)', zIndex: 5 }}>
        <MascotBtn m={m} life={life} style={{ width: ms }} />
      </div>
      {inf.status === 'empty' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <span className="kd-f" style={{ padding: '12px 18px', borderRadius: 18, background: 'rgba(255,255,255,.92)', fontSize: 20, color: theme.ink }}>Bu konu hazırlanıyor</span>
        </div>
      )}
    </div>
  )
}

function StopPanel({ k, inf, replayed, loading, onStart, onClose, sheet }: { k: KCard; inf: UInfo; replayed: boolean; loading: boolean; onStart: (k: KCard) => void; onClose?: () => void; sheet?: boolean }) {
  const s = STOP[k]
  const done = inf.done.includes(k)
  const again = inf.status === 'again' && k === inf.focus && !replayed
  const state = again ? 'BİR TUR DAHA' : done ? 'BİTTİ' : 'SIRADAKİ'
  const btn = loading ? 'Hazırlanıyor…' : again ? 'Bir tur daha' : done ? 'Tekrar oyna' : 'Başla'
  const desc = again ? 'Öğretmenin bu konuda bir tur daha Drill istiyor. Hadi, sen yaparsın!' : s.desc
  return (
    <div className={sheet ? 'kd-sheet' : undefined} style={sheet
      ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 91, borderRadius: '32px 32px 0 0', background: '#FFFFFF', overflow: 'hidden', boxShadow: '0 -20px 40px -20px rgba(40,20,60,.5)' }
      : { display: 'flex', flexDirection: 'column', borderRadius: 30, background: '#FFFFFF', overflow: 'hidden', boxShadow: '0 18px 36px -20px rgba(60,30,90,.35)' }}
      onClick={e => e.stopPropagation()}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: sheet ? '24px 20px 18px' : 20, background: s.tint }}>
        {sheet && <span aria-hidden="true" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 44, height: 5, borderRadius: 99, background: 'rgba(40,20,60,.2)' }} />}
        <div key={k} className="kd-popin" style={{ width: 88, height: 88, flexShrink: 0, borderRadius: 28, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px -12px rgba(60,30,90,.5)' }}>
          <img src={IMG(s.img)} alt="" style={{ width: 62, height: 62 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#FFFFFF', color: s.deep, fontSize: 12, fontWeight: 800, letterSpacing: '.05em' }}>ADIM {inf.stops.indexOf(k) + 1} / {inf.stops.length} · {state}</span>
          <h2 className="kd-f" style={{ fontSize: 28, marginTop: 8, color: s.deep }}>{s.label}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: '#2A1838' }}>{s.sub}</p>
        </div>
      </div>
      <div style={{ padding: sheet ? '18px 20px 26px' : '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.45, color: '#4E4060' }}>{desc}</p>
        <button className="kd-btn kd-f" disabled={loading} onClick={() => onStart(k)} style={{ minHeight: 58, borderRadius: 18, background: s.deep, color: '#FFFFFF', fontSize: 21, boxShadow: '0 12px 20px -10px rgba(40,20,60,.6)' }}>{btn}</button>
        {onClose && <button onClick={onClose} style={{ minHeight: 46, border: 'none', borderRadius: 14, background: 'transparent', fontSize: 16, fontWeight: 800, color: '#5E4A6E', cursor: 'pointer' }}>Haritaya dön</button>}
      </div>
    </div>
  )
}

function UnitPage({ topic, inf, theme, m, life, wide, sel, replayed, onSelect, onStart, onBack }: {
  topic: KidsTopic; inf: UInfo; theme: KTheme; m: Mascot; life: Life; wide: boolean; sel: KCard | null; replayed: boolean
  onSelect: (k: KCard | null) => void; onStart: (k: KCard) => void; onBack: () => void
}) {
  const panelK = sel ?? inf.focus ?? inf.done[inf.done.length - 1] ?? null
  const banner = inf.status === 'waiting' || (inf.status === 'again' && replayed)
    ? { img: 'hourglass', text: inf.status === 'again' ? 'Süpersin! Öğretmenin yeniden bakacak.' : 'Harika! Bütün durakları bitirdin. Öğretmenin bakıyor, kupan yolda!' }
    : inf.status === 'again' ? { img: 'target', text: 'Öğretmenin bir tur daha Drill istiyor. Hadi!' }
    : inf.status === 'complete' ? { img: 'trophy', text: 'Bu konu tamam! Kupanı kazandın.' }
    : null
  return (
    <div className="kd" style={{ background: theme.page, color: theme.ink }} onClick={() => { if (!wide && sel) onSelect(null) }}>
      <KidsStyle />
      <div style={{ position: 'relative', padding: '18px 20px 48px', background: theme.unitTop, overflow: 'hidden' }}>
        <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', right: '30%', top: 8, width: 80, opacity: 0.85 }} />
        <img className="kd-twinkle" src={IMG('sparkles')} alt="" style={{ position: 'absolute', right: 22, bottom: 30, width: 30 }} />
        <div className="kd-wrap" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RoundBack onClick={onBack} label="Panele dön" />
              <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800, color: theme.sub, letterSpacing: '.05em' }}>{topic.id}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px 6px 8px', borderRadius: 999, background: '#FFFFFF', fontWeight: 800, fontSize: 16, boxShadow: '0 6px 14px -8px rgba(40,20,60,.4)' }} aria-label={`${inf.done.length} / ${inf.stops.length} durak`}>
              <img src={IMG('paws')} alt="" style={{ width: 28, height: 28 }} />{inf.done.length} / {inf.stops.length}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <span className="kd-bob" style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">{topic.icon}</span>
            <div style={{ minWidth: 0 }}>
              <h1 className="kd-f" style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 700 }}>{topic.title}</h1>
              <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, color: theme.sub }}>{topic.subtitle ? `${topic.subtitle} · ` : ''}{m.label === 'Kedi' ? 'kediyi' : 'orkayı'} takip et, durakları bitir</p>
            </div>
          </div>
        </div>
      </div>

      <div className="kd-wrap">
        <div className="kd-ubody">
          <div className="kd-col">
            {banner && (
              <div className="kd-pop" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 22, background: '#FFFFFF', boxShadow: `0 14px 30px -20px ${theme.shadow}` }}>
                <img src={IMG(banner.img)} alt="" style={{ width: 40, height: 40 }} />
                <span className="kd-f" style={{ fontSize: 19, lineHeight: 1.25 }}>{banner.text}</span>
              </div>
            )}
            <UnitMap inf={inf} theme={theme} m={m} life={life} sel={sel} wide={wide} replayed={replayed} onSelect={k => onSelect(k)} />
          </div>
          {wide && (
            <div className="kd-col">
              {panelK && <StopPanel k={panelK} inf={inf} replayed={replayed} loading={topic[panelK].state !== 'ok'} onStart={onStart} />}
              <UnitRewards inf={inf} m={m} theme={theme} />
            </div>
          )}
        </div>
      </div>

      {!wide && sel && (
        <>
          <div className="kd-fade" onClick={() => onSelect(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(40,20,60,.38)' }} />
          <StopPanel k={sel} inf={inf} replayed={replayed} loading={topic[sel].state !== 'ok'} onStart={onStart} onClose={() => onSelect(null)} sheet />
        </>
      )}
    </div>
  )
}

function UnitRewards({ inf, m, theme }: { inf: UInfo; m: Mascot; theme: KTheme }) {
  return (
    <div style={{ padding: 18, borderRadius: 30, background: '#FFFFFF', boxShadow: `0 18px 36px -20px ${theme.shadow}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={IMG('gift')} alt="" style={{ width: 34, height: 34 }} />
        <h2 className="kd-f" style={{ fontSize: 22, flex: 1 }}>Bu konuda kazandıkların</h2>
        <span style={{ padding: '3px 10px', borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontSize: 13, fontWeight: 800 }}>{inf.done.length}/{inf.stops.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(inf.stops.length, 1)}, minmax(0, 1fr))`, gap: 8 }}>
        {inf.stops.map(k => {
          const got = inf.done.includes(k)
          const r = m.rewards[k]
          return (
            <div key={k} className="kd-lift" title={got ? r.name : '?'} style={{ aspectRatio: '1', borderRadius: 18, background: theme.page, border: `2px solid ${theme.accentSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {got
                ? <img src={IMG(r.img)} alt={r.name} style={{ width: '64%' }} />
                : <span aria-label="Henüz kazanılmadı" className="kd-f" style={{ fontSize: 26, color: '#B9AEC6' }}>?</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Yuva: maskotun kazandıkları, mutluluk, büyüme, sürpriz misafir
// ═══════════════════════════════════════════════════════════════════════════
function NestPage({ theme, m, life, counts, happy, onBack }: { theme: KTheme; m: Mascot; life: Life; counts: Counts; happy: number; onBack: () => void }) {
  const stage = stageOf(counts.trophies)
  const [guest] = useState(() => (Math.random() < 0.4 ? m.guests[Math.floor(Math.random() * m.guests.length)] : null))
  const [wiggle, setWiggle] = useState<string | null>(null)
  const orca = m.base === 'orca'
  const size = Math.round(190 * STAGE_SCALE[stage])
  return (
    <div className="kd" style={{ background: theme.nestBg, color: theme.ink }}>
      <KidsStyle />
      <div className="kd-wrap" style={{ padding: '18px 18px 40px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RoundBack onClick={onBack} label="Panele dön" />
          <h1 className="kd-f" style={{ fontSize: 30, fontWeight: 700 }}>{m.of} yuvası</h1>
        </div>

        <div style={{ position: 'relative', minHeight: 330, borderRadius: 34, overflow: 'hidden', background: orca ? 'linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,0))' : 'linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,.25))', boxShadow: `inset 0 0 0 3px rgba(255,255,255,.6)` }}>
          <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', left: '38%', top: 14, width: 84, opacity: 0.9 }} />
          <img src={IMG(theme.deco[2])} alt="" style={{ position: 'absolute', right: '5%', top: 24, width: 96 }} />
          <img src={IMG(theme.deco[1])} alt="" style={{ position: 'absolute', left: '4%', bottom: 26, width: 76 }} />
          <img className="kd-twinkle" src={IMG(theme.deco[0])} alt="" style={{ position: 'absolute', right: '18%', bottom: 40, width: 40 }} />
          {counts.trophies > 0 && (
            <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 2 }}>
              {Array.from({ length: Math.min(counts.trophies, 6) }, (_, i) => <img key={i} src={IMG('trophy')} alt="" style={{ width: 34 }} />)}
            </div>
          )}
          <div style={{ position: 'absolute', left: '50%', bottom: 40, transform: 'translateX(-50%)', width: size }}>
            <MascotBtn m={m} life={life} style={{ width: size }} big />
          </div>
          {guest && (
            <div className="kd-fade" style={{ position: 'absolute', right: '8%', bottom: 46, width: 74, animationDelay: '1.2s' }}>
              <img className="kd-bob" src={IMG(guest.img)} alt={guest.name} style={{ width: 74 }} />
              <span className="kd-bubble kd-f" style={{ position: 'absolute', right: '70%', top: -30, padding: '5px 10px', borderRadius: '14px 14px 4px 14px', background: '#FFFFFF', fontSize: 15, whiteSpace: 'nowrap', animationDelay: '1.6s', animationDuration: '3.2s' }}>Merhaba!</span>
            </div>
          )}
          <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 999, background: 'rgba(255,255,255,.9)', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{m.stages[stage]}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 22, background: 'rgba(255,255,255,.85)' }}>
          <span className="kd-f" style={{ fontSize: 18 }}>Mutluluk</span>
          <Hearts n={happy} img={m.heartImg} />
          <span style={{ fontSize: 14, fontWeight: 800, color: theme.sub }}>{happyText(happy)}</span>
        </div>

        <div style={{ padding: 18, borderRadius: 30, background: '#FFFFFF', boxShadow: `0 18px 36px -20px ${theme.shadow}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="kd-f" style={{ fontSize: 22 }}>Topladıkların</h2>
          {counts.total === 0 && <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.sub }}>Durakları bitir, {m.to.toLocaleLowerCase('tr')} hediyeler topla!</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
            {ORDER.map(k => {
              const r = m.rewards[k]
              const n = counts.per[k]
              return (
                <button key={k} className="kd-lift kd-tap" disabled={n === 0} aria-label={`${r.name}: ${n}`}
                  onClick={() => { setWiggle(k); life.tap(); window.setTimeout(() => setWiggle(w => (w === k ? null : w)), 900) }}
                  style={{ position: 'relative', aspectRatio: '1', borderRadius: 20, background: theme.page, border: `2px solid ${theme.accentSoft}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 }}>
                  <img className={wiggle === k ? 'kd-hop' : undefined} src={IMG(r.img)} alt="" style={{ width: '56%', filter: n ? 'none' : 'grayscale(1)', opacity: n ? 1 : 0.3 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: theme.sub, textAlign: 'center', lineHeight: 1.1 }}>{r.name}</span>
                  {n > 0 && <span style={{ position: 'absolute', top: 6, right: 8, padding: '1px 7px', borderRadius: 999, background: theme.accent, color: '#FFFFFF', fontSize: 12, fontWeight: 800 }}>×{n}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Sürpriz kutusu ve ünite kutlaması (tam renkli ekranlar)
// ═══════════════════════════════════════════════════════════════════════════
function SurpriseScreen({ theme, m, step, onDone }: { theme: KTheme; m: Mascot; step: KCard; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [burst, setBurst] = useState(() => Date.now())
  const r = m.rewards[step]
  return (
    <div className="kd kd-overlay kd-fade" role="dialog" aria-modal="true" aria-label="Sürpriz kutusu" style={{ background: theme.surprise, color: theme.ink }}>
      <KidsStyle />
      <div className="kd-rays" />
      <img className="kd-floaty" src={IMG('cloud')} alt="" style={{ position: 'absolute', left: -20, top: 60, width: 130, opacity: 0.9 }} />
      <img className="kd-drift" src={IMG('cloud')} alt="" style={{ position: 'absolute', right: -10, bottom: 120, width: 110, opacity: 0.85 }} />
      {!open ? (
        <>
          <button className="kd-gift" onClick={() => { setOpen(true); setBurst(Date.now()) }} aria-label="Sürpriz kutusunu aç" style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <img src={IMG('gift')} alt="" style={{ width: 190, height: 190, filter: 'drop-shadow(0 20px 24px rgba(60,20,80,.35))' }} />
          </button>
          <h2 className="kd-f" style={{ position: 'relative', fontSize: 38, fontWeight: 700 }}>Bir sürprizin var!</h2>
          <p style={{ position: 'relative', margin: 0, fontSize: 18, fontWeight: 800 }}>{STOP[step].label} bitti. Kutuya dokun ve aç.</p>
        </>
      ) : (
        <>
          <div style={{ position: 'relative', width: 210, height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img className="kd-twinkle" src={IMG('sparkles')} alt="" style={{ position: 'absolute', left: -6, top: 4, width: 60 }} />
            <img className="kd-twinkle" src={IMG('sparkles')} alt="" style={{ position: 'absolute', right: -4, bottom: 16, width: 48, animationDelay: '.7s' }} />
            <img className="kd-popin" src={IMG(r.img)} alt={r.name} style={{ width: 180, height: 180 }} />
          </div>
          <h2 className="kd-f" style={{ position: 'relative', fontSize: 34, fontWeight: 700 }}>{m.to} {r.name.toLocaleLowerCase('tr')} kazandın!</h2>
          <p style={{ position: 'relative', margin: 0, fontSize: 17, fontWeight: 800 }}>{m.of} yuvasına eklendi.</p>
          <button className="kd-btn kd-f" onClick={onDone} style={{ position: 'relative', marginTop: 8, minHeight: 58, padding: '0 34px', borderRadius: 20, background: '#FFFFFF', color: theme.accent, fontSize: 21, boxShadow: '0 14px 24px -12px rgba(40,20,60,.6)' }}>{m.give}</button>
        </>
      )}
      <Confetti burst={burst} colors={theme.conf} n={open ? 46 : 28} />
    </div>
  )
}

function FinaleScreen({ theme, m, topic, grewTo, onNest, onClose }: { theme: KTheme; m: Mascot; topic: KidsTopic; grewTo: string | null; onNest: () => void; onClose: () => void }) {
  const [burst] = useState(() => Date.now())
  return (
    <div className="kd kd-overlay kd-fade" role="dialog" aria-modal="true" aria-label="Ünite tamam" style={{ background: theme.finale, color: theme.ink }}>
      <KidsStyle />
      <div className="kd-rays" />
      <img className="kd-twinkle" src={IMG('party')} alt="" style={{ position: 'absolute', left: '8%', top: '12%', width: 84 }} />
      <img className="kd-twinkle" src={IMG('party')} alt="" style={{ position: 'absolute', right: '8%', top: '16%', width: 76, transform: 'scaleX(-1)', animationDelay: '.6s' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <img className="kd-popin" src={IMG(m.happy)} alt="" style={{ width: 96, height: 96, animationDelay: '.25s' }} />
        <img className="kd-popin" src={IMG('trophy')} alt="" style={{ width: 170, height: 170, filter: 'drop-shadow(0 20px 24px rgba(90,40,10,.3))' }} />
      </div>
      <h2 className="kd-f" style={{ position: 'relative', fontSize: 40, fontWeight: 700 }}>Konu tamam!</h2>
      <p style={{ position: 'relative', margin: 0, fontSize: 18, fontWeight: 800 }}>{topic.title} bitti. Kupan {m.of.toLocaleLowerCase('tr')} yuvasına kondu.</p>
      {grewTo && <p className="kd-pop" style={{ position: 'relative', margin: 0, padding: '8px 16px', borderRadius: 16, background: 'rgba(255,255,255,.85)', fontSize: 18, fontWeight: 800 }}>{m.my} büyüdü: {grewTo}!</p>}
      <div style={{ position: 'relative', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
        <button className="kd-btn kd-f" onClick={onNest} style={{ minHeight: 58, padding: '0 30px', borderRadius: 20, background: theme.accent, color: '#FFFFFF', fontSize: 21, boxShadow: '0 14px 24px -12px rgba(40,20,60,.6)' }}>Yuvaya git</button>
        <button className="kd-btn kd-f" onClick={onClose} style={{ minHeight: 58, padding: '0 26px', borderRadius: 20, background: '#FFFFFF', color: theme.accent, fontSize: 20 }}>Haritaya dön</button>
      </div>
      <Confetti burst={burst} colors={theme.conf} n={70} />
    </div>
  )
}

// ═══ Kart ekranları ═══════════════════════════════════════════════════════
// ── Grammar: kurallar büyük kartlarda, tek tek ───────────────────────────────
function KidsGrammar({ topic, deps, onBack, onDone }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void; onDone: () => void }) {
  const slots = topic.grammar.slots
  const [si, setSi] = useState(0)
  const [bi, setBi] = useState(0)
  const [burst, setBurst] = useState(0)
  const slot = slots[Math.min(si, slots.length - 1)]
  const blocks = slot?.blocks ?? []
  const block = blocks[Math.min(bi, blocks.length - 1)]
  const last = bi >= blocks.length - 1
  const lastSlot = si >= slots.length - 1
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
        {last && lastSlot
          ? <button className="kd-big kd-tap" style={{ background: '#16A34A', flex: 1 }} onClick={() => { setBurst(Date.now()); onDone(); window.setTimeout(onBack, 900) }}>Bitti!</button>
          : last
            ? <button className="kd-big kd-tap" style={{ background: color, flex: 1 }} onClick={() => { setSi(i => i + 1); setBi(0) }}>Sonraki bölüm →</button>
            : <button className="kd-big kd-tap" style={{ background: color, flex: 1 }} onClick={() => setBi(b => b + 1)}>İleri →</button>}
      </div>
      <Confetti burst={burst} />
    </Frame>
  )
}

// ── Dinle: video ya da ses, altında büyük altyazı ───────────────────────────
function KidsListen({ topic, onBack, onDone }: { topic: KidsTopic; onBack: () => void; onDone: () => void }) {
  const { url, segments } = topic.listen
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const counted = useRef(false)
  const [ended, setEnded] = useState(false)
  const [burst, setBurst] = useState(0)
  const color = CARD_META.listen.bg
  const cur = segments.find(s => t >= s.start && t < s.end + 0.15)
  const common = {
    ref: mediaRef, src: url, preload: 'metadata' as const,
    onTimeUpdate: () => setT(mediaRef.current?.currentTime ?? 0),
    onLoadedMetadata: () => setDur(mediaRef.current?.duration ?? 0),
    onPlay: () => { setPlaying(true); if (!counted.current) { counted.current = true; activityStat('audio', st => bump(st, 'plays')) } },
    onPause: () => setPlaying(false),
    onEnded: () => { setPlaying(false); if (!ended) { setEnded(true); setBurst(Date.now()); onDone() } },
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
      {ended && (
        <div className="kd-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px', borderRadius: 26, background: '#FFFFFF', textAlign: 'center' }}>
          <StarIcon size={64} className="kd-star" />
          <div className="kd-h" style={{ fontSize: 28, color }}>Sonuna kadar dinledin!</div>
          <button className="kd-big kd-tap" style={{ background: color }} onClick={onBack}>Haritaya dön</button>
        </div>
      )}
      <Confetti burst={burst} />
    </Frame>
  )
}

// ── Dictation: cümleyi dinle, yaz; yanlışta ipucu, kırmızı yok ─────────────
function KidsDictation({ topic, deps, onBack, onDone }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void; onDone: () => void }) {
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
  // Dictation kontrolü (dictationCheck): hizalama, kısaltma notu, sayılar, isimler beklenmez
  const nameSet = useMemo(() => buildNameSet(segs.map(s => s.text), { show: topic.dictation.namesShow, ask: topic.dictation.namesAsk }), [segs, topic.dictation.namesShow, topic.dictation.namesAsk])
  const names = seg ? namesInSentence(seg.text, nameSet) : []
  const res = useMemo(() => (st.status !== 'idle' && seg ? checkDictation(seg.text, st.typed, nameSet) : null), [st.status, seg, st.typed, nameSet])
  const hint = st.status === 'wrong' && res ? res : null

  function check() {
    if (!seg || ok || !st.typed.trim()) return
    const r = checkDictation(seg.text, st.typed, nameSet)
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
    if (st.i + 1 >= segs.length) { setSt(p => ({ ...p, done: true, status: 'idle' })); setBurst(Date.now()); onDone(); return }
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
        <DoneBox title="Süpersin!" line={`İlk denemede ${st.firstOk} / ${segs.length} doğru`} color={color} onAgain={() => { setSt(fresh()); }} onBack={onBack} backLabel="Haritaya dön" />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 18, borderRadius: 26, background: '#FFFFFF', border: `3px solid ${color}33` }}>
            <PlayButton big playing={audio.playing} color={color} label="Cümleyi dinle" onClick={() => (audio.playing ? audio.stop() : playCur())} />
            <div style={{ flex: 1 }}>
              <div className="kd-h" style={{ fontSize: 24 }}>Dinle ve yaz</div>
              <button className="kd-tap" onClick={() => setSlow(s => !s)} aria-pressed={slow} style={{ marginTop: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, background: slow ? color : '#FFFFFF', color: slow ? '#FFFFFF' : '#3B3650', border: `2px solid ${color}55`, fontWeight: 800, fontSize: 15 }}>🐢 Yavaş</button>
            </div>
          </div>
          {names.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 800, color: '#3B3650' }}>
              İsimler:
              {names.map(n => <span key={n} className="kd-chip" style={{ background: '#FFFFFF', color: '#3B3650', border: `2px dashed ${color}55` }}>{n}</span>)}
              <span style={{ fontSize: 14, fontWeight: 700, color: '#6B6680' }}>(bunları yazmasan da olur)</span>
            </div>
          )}
          <label htmlFor="kd-dict" style={{ fontSize: 16, fontWeight: 800, color: '#3B3650', marginBottom: -8 }}>Cevabın</label>
          <input id="kd-dict" ref={inputRef} key={`${st.i}-${st.shake}`} className={'kd-input' + (st.status === 'wrong' ? ' kd-shake' : '')} value={st.typed} readOnly={ok} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Buraya yaz…"
            onChange={e => { const v = e.target.value; setSt(p => ({ ...p, typed: v, status: p.status === 'ok' ? 'ok' : 'idle' })) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (ok) next(); else check() } }}
            style={{ border: ok ? '3px solid #22C55E' : st.status === 'wrong' ? '3px solid #FB923C' : `3px solid ${color}44`, background: ok ? '#F0FDF4' : '#FFFFFF' }} />
          {ok && <OkBox wrongFirst={st.wrongFirst} />}
          {ok && res && res.notes.map((nt, k) => (
            <div key={k} style={{ padding: '10px 14px', borderRadius: 16, background: '#F5F3FF', border: '2px solid #DDD6FE', fontSize: 16, fontWeight: 800, color: '#5B21B6' }}>💡 {dictNoteText(nt)}</div>
          ))}
          {hint && (
            <div style={{ padding: '14px 16px', borderRadius: 20, background: '#FFF7ED', border: '2px solid #FDBA74' }}>
              <div className="kd-h" style={{ fontSize: 22, color: '#9A3412' }}>Neredeyse! Bir daha dene</div>
              {hint.hintParts.some(p => p.kind === 'hint') && <HintRow parts={hint.hintParts} />}
              {hint.extras.length > 0 && <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: '#9A3412' }}>Fazladan kelime var: {hint.extras.join(', ')}</div>}
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
function KidsDrill({ topic, deps, onBack, onDone }: { topic: KidsTopic; deps: KidsDeps; onBack: () => void; onDone: () => void }) {
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
    if (st.i + 1 >= items.length) { setSt(p => ({ ...p, done: true, status: 'idle' })); setBurst(Date.now()); onDone(); return }
    setSt(p => ({ ...p, i: p.i + 1, typed: '', status: 'idle', tried: false, wrongFirst: false, revealed: false }))
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }
  const canCheck = ok || !!st.typed.trim()
  return (
    <Frame topic={topic} card="drill" onBack={onBack} right={<StarCounter n={st.stars} />}
      sub={!st.done ? <Dots total={items.length} current={st.i} done={ok} color={color} /> : undefined}>
      {st.done ? (
        <DoneBox title="Süpersin!" line={`İlk denemede ${st.firstOk} / ${items.length} doğru`} color={color} onAgain={() => setSt(fresh())} onBack={onBack} backLabel="Haritaya dön" />
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

// ── Shadowing: büyük cümle kartı, dinle ve tekrar et ────────────────────────
// Konuşma açıksa (Units'te shadowing_konusma boş) büyük mikrofon: çocuk cümleyi
// söyler, söylediği kelimeler yeşil olur; hepsini söyleyince konfeti. Ses
// saklanmaz; tanıyıcının yazdığı cümle çocuğun Konuşma cevaplarına yazılır
// (öğretmen önizlemesi kaydedilmez).
function KidsShadowing({ topic, onBack, onDone }: { topic: KidsTopic; onBack: () => void; onDone: () => void }) {
  const { url, segments, clips } = topic.shadowing
  const audio = useKidsAudio()
  const color = CARD_META.shadowing.bg
  const sentences = clips.length > 0 ? segments.map((s, i) => ({ text: s.text, clip: clips[i] ?? '' })) : segments.map(s => ({ text: s.text, clip: '' }))
  const [i, setI] = useState(0)
  const [slow, setSlow] = useState(false)
  const [burst, setBurst] = useState(0)
  const [canSpeak] = useState(() => speechSupported())
  const [heardLast, setHeardLast] = useState(false)
  const [finished, setFinished] = useState(false)
  const speechOn = canSpeak && topic.shadowing.speech !== false
  const rate = slow ? 0.75 : 1
  const cur = sentences[i]
  const sp = useShadowSpeech(cur?.text ?? '', (heard, r) => {
    activitySpeech({
      question_id: `${topic.id}|shadowing|${i + 1}`,
      question_text: `Shadowing: ${(cur?.text ?? '').trim()}`,
      question_type: 'fixed',
      raw_text: heard,
      confirmed_text: heard,
      input_mode: 'voice',
      result: r.complete ? 'correct' : 'wrong',
    })
    if (r.complete) setBurst(Date.now())
  })
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
    if (sp.rec.listening) sp.rec.abort()
    track(idx)
    if (idx === sentences.length - 1) setHeardLast(true)
    if (sen.clip) void audio.play(sen.clip, 0, undefined, rate)
    else { const s = segments[idx]; void audio.play(url, s.start, s.end, rate) }
  }
  function go(d: number) {
    const ni = Math.max(0, Math.min(sentences.length - 1, i + d))
    if (ni === i) return
    setI(ni)
    playAt(ni)
  }
  function listen() {
    if (sp.rec.listening) { sp.rec.stop(); return }
    audio.stop()
    sp.start()
  }
  const listening = sp.rec.listening
  const result = !listening ? sp.result : null
  return (
    <Frame topic={topic} card="shadowing" onBack={() => { audio.stop(); sp.rec.abort(); onBack() }} sub={<Dots total={sentences.length} current={i} done={false} color={color} />}>
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
      {speechOn && cur && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '18px 16px', borderRadius: 26, background: '#FFFFFF', border: `3px solid ${color}33`, textAlign: 'center' }}>
          <button className={'kd-tap' + (listening ? ' kd-pulse' : '')} onClick={listen} aria-label={listening ? 'Dinlemeyi durdur' : 'Cümleyi söyle'}
            style={{ width: 84, height: 84, borderRadius: '50%', background: listening ? color : '#FFFFFF', border: `4px solid ${color}`, color: listening ? '#FFFFFF' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 20px ${color}40`, flexShrink: 0 }}>
            {listening
              ? <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" /></svg>
              : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>}
          </button>
          <div className="kd-h" style={{ fontSize: 22, color: result?.complete ? '#15803D' : '#3B3650' }}>
            {listening ? 'Dinliyorum… Şimdi söyle!' : result ? (result.complete ? 'Harika! Hepsini söyledin!' : 'Bir daha dene!') : 'Şimdi sen söyle!'}
          </div>
          {listening && sp.rec.interim && <div style={{ fontSize: 18, fontWeight: 700, color: '#5B5670' }}>{sp.rec.interim}</div>}
          {sp.rec.errorText && !listening && <div style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 16, padding: '10px 14px', fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>{sp.rec.errorText}</div>}
          {result && (
            <>
              <div><ShadowWords words={result.words} size={26} /></div>
              {!result.complete && <div style={{ fontSize: 15, fontWeight: 800, color: '#5B5670' }}>{shadowCountText(result)}</div>}
              <button className="kd-soft kd-tap" onClick={() => { audio.stop(); sp.start() }} style={{ border: `2px solid ${color}55`, color: '#3B3650' }}>🔁 Tekrar dene</button>
            </>
          )}
        </div>
      )}
      {heardLast && i === sentences.length - 1 && (
        finished ? (
          <div className="kd-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 20, borderRadius: 26, background: '#FFFFFF', textAlign: 'center' }}>
            <StarIcon size={64} className="kd-star" />
            <div className="kd-h" style={{ fontSize: 28, color }}>Bütün cümleleri söyledin!</div>
            <button className="kd-big kd-tap" style={{ background: color }} onClick={() => { audio.stop(); sp.rec.abort(); onBack() }}>Haritaya dön</button>
          </div>
        ) : (
          <button className="kd-big kd-tap kd-pop" style={{ background: '#16A34A' }} onClick={() => { audio.stop(); setFinished(true); setBurst(Date.now()); onDone() }}>Bitirdim!</button>
        )
      )}
      <Confetti burst={burst} />
    </Frame>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Panelin tamamı: ana ekran → konu haritası → kart; yuva. Telefonun geri tuşu
// bir üst ekrana döner; geri dönünce ekran kaldığı kaydırma yerinden açılır.
// ═══════════════════════════════════════════════════════════════════════════
type Nav = { topic: string | null; card: KCard | null; nest: boolean }
const depthOf = (n: Nav) => (n.card ? 2 : n.topic || n.nest ? 1 : 0)
const HOME: Nav = { topic: null, card: null, nest: false }

export function KidsArea({ childName, childArea, account, topics, deps, brainItems, brainStatus, unut, showMemory, persist, onBrain, onMemory, onExit, homeScroll }: {
  childName: string
  childArea: ChildArea
  account: Account
  topics: KidsTopic[]
  deps: KidsDeps
  brainItems: MemoryItem[]
  brainStatus: string
  unut: UnutState
  showMemory: boolean
  persist: boolean      // false: öğretmen önizliyor, hiçbir şey kaydedilmez
  onBrain: () => void
  onMemory: () => void
  onExit: () => void
  homeScroll: { current: number }
}) {
  const theme = THEMES[childArea]
  const m = MASCOTS[childArea]
  const uid = account.id
  const wide = useWide()
  const [nav, setNav] = useState<Nav>(HOME)
  const navRef = useRef(nav)
  navRef.current = nav
  const pushed = useRef(0)
  const scrolls = useRef<number[]>([])
  const prevDepth = useRef(0)

  // ── Durak kayıtları ──
  const [done, setDone] = useState<Set<string>>(() => new Set(persist ? readKidsLocal(uid).map(r => stepKey(r.unit_id, r.step)) : []))
  useEffect(() => {
    if (!persist) return undefined
    let alive = true
    loadKidsProgress(uid)
      .then(rows => { if (alive) setDone(prev => { const s = new Set(prev); rows.forEach(r => s.add(stepKey(r.unit_id, r.step))); return s }) })
      .catch(() => { /* çevrimdışı: cihazdaki kayıtlarla devam */ })
    return () => { alive = false }
  }, [uid, persist])
  const doneRef = useRef(done)
  doneRef.current = done
  const markDone = useCallback((unit: string, step: string): boolean => {
    const k = stepKey(unit, step)
    if (doneRef.current.has(k)) return false
    const s = new Set(doneRef.current); s.add(k)
    doneRef.current = s
    setDone(s)
    if (persist) void saveKidsStep(uid, unit, step)
    return true
  }, [persist, uid])

  const [surprise, setSurprise] = useState<{ topic: string; step: KCard } | null>(null)
  const [replayed, setReplayed] = useState<Set<string>>(() => new Set())
  const [sel, setSel] = useState<KCard | null>(null)

  const vis = useMemo(() => visibleTopics(topics, done), [topics, done])
  const counts = useMemo(() => countRewards(topics, done), [topics, done])
  const current = vis.find(v => v.inf.status === 'progress' || v.inf.status === 'empty' || v.inf.status === 'again') ?? vis[vis.length - 1] ?? null

  const topic = nav.topic ? topics.find(t => t.id === nav.topic) ?? null : null
  const tInf = topic ? unitInfo(topic, done) : null
  // Konu tablodan kalktıysa ya da kilitlendiyse ana ekrana dön
  useEffect(() => { if (nav.topic && (!topic || topic.locked)) setNav(HOME) }, [nav.topic, topic])
  useEffect(() => { setSel(null) }, [nav.topic, nav.card])

  // Kutlanmamış, öğretmenin "tamam" dediği konu (kart açık değilken gösterilir)
  const finaleTopic = !nav.card && !surprise && !nav.nest ? vis.find(v => v.inf.status === 'complete' && !v.inf.celebrated)?.t ?? null : null
  const grewTo = finaleTopic && stageOf(counts.trophies) > stageOf(counts.trophies - 1) ? m.stages[stageOf(counts.trophies)] : null

  const showSurprise = !!surprise && !nav.card
  const sheetOpen = !wide && !!sel
  const actsKey = nav.card ? '' : nav.topic ? (m.base === 'orca' ? 'toy,peek,sound,scratch' : 'toy,peek,scratch,sound') : 'hop,sound'
  const life = useMascotLife(actsKey, showSurprise || !!finaleTopic || sheetOpen || !!nav.card)

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
    try { window.history.pushState({ ncKids: depthOf(next) }, ''); pushed.current++ } catch { /* yoksa yalnızca ekran değişir */ }
    setNav(next)
  }
  const up = (n: Nav): Nav => (n.card ? { topic: n.topic, card: null, nest: false } : HOME)
  function back() {
    if (pushed.current > 0) { try { window.history.back(); return } catch { /* aşağıda */ } }
    setNav(up(navRef.current))
  }
  useEffect(() => {
    const onPop = () => {
      const n = navRef.current
      if (depthOf(n) === 0) return
      pushed.current = Math.max(0, pushed.current - 1)
      setNav(up(n))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Öğrenci etkinliği: konu sayfası, kartlar ve yuva
  useActivityPlace(topic
    ? (nav.card ? { card: ACT_CARD[nav.card], level: 'Çocuk', unit: topic.id, depth: 3 } : { card: 'unit', level: 'Çocuk', unit: topic.id, depth: 2 })
    : nav.nest ? { card: 'nest', level: 'Çocuk', depth: 2 } : null)

  // Bir kart ilk kez bitince: kaydet, haritaya dönünce sürpriz kutusu
  function cardDone(t: KidsTopic, k: KCard) {
    const inf = unitInfo(t, doneRef.current)
    if (markDone(t.id, k)) { setSurprise({ topic: t.id, step: k }); return }
    if (inf.status === 'again' && k === inf.focus) setReplayed(p => new Set(p).add(t.id))
  }

  const pokeRoot = (el: ReactNode) => <div onPointerDown={life.poke}>{el}</div>

  if (topic && nav.card) {
    const k = nav.card
    const onDone = () => cardDone(topic, k)
    if (k === 'grammar') return <KidsGrammar topic={topic} deps={deps} onBack={back} onDone={onDone} />
    if (k === 'listen') return <KidsListen topic={topic} onBack={back} onDone={onDone} />
    if (k === 'dictation') return <KidsDictation topic={topic} deps={deps} onBack={back} onDone={onDone} />
    if (k === 'drill') return <KidsDrill topic={topic} deps={deps} onBack={back} onDone={onDone} />
    return <KidsShadowing topic={topic} onBack={back} onDone={onDone} />
  }

  const overlays = (
    <>
      {showSurprise && surprise && <SurpriseScreen key={`${surprise.topic}-${surprise.step}`} theme={theme} m={m} step={surprise.step} onDone={() => { setSurprise(null); life.tap() }} />}
      {finaleTopic && (
        <FinaleScreen key={finaleTopic.id} theme={theme} m={m} topic={finaleTopic} grewTo={grewTo}
          onNest={() => { markDone(finaleTopic.id, 'kutlama'); open({ topic: null, card: null, nest: true }) }}
          onClose={() => { markDone(finaleTopic.id, 'kutlama'); life.tap() }} />
      )}
    </>
  )

  if (nav.nest) {
    return pokeRoot(<NestPage theme={theme} m={m} life={life} counts={counts} happy={happinessOf(counts.total)} onBack={back} />)
  }
  if (topic && tInf) {
    return pokeRoot(
      <>
        <UnitPage topic={topic} inf={tInf} theme={theme} m={m} life={life} wide={wide} sel={sel} replayed={replayed.has(topic.id)}
          onSelect={k => { life.poke(); setSel(k) }}
          onStart={k => { setSel(null); open({ topic: topic.id, card: k, nest: false }) }}
          onBack={back} />
        {overlays}
      </>
    )
  }
  return pokeRoot(
    <>
      <KidsHome childName={childName} theme={theme} m={m} life={life} vis={vis} current={current} counts={counts} preview={!persist}
        brainItems={brainItems} brainStatus={brainStatus} unut={unut} showMemory={showMemory}
        onBrain={onBrain} onMemory={onMemory} onExit={onExit}
        onTopic={id => open({ topic: id, card: null, nest: false })}
        onNest={() => open({ topic: null, card: null, nest: true })} />
      {overlays}
    </>
  )
}
