// ─── Öğrenci etkinliği: kayıt parçası (öğrencinin cihazında çalışır) ──────────
// Öğrenci siteye girince bir oturum başlar. Site gerçekten çalışılan süreyi
// sayar: ekran arka plandayken geçen süre SAYILMAZ. Dokunulmadan geçen süre
// (okuma, düşünme) bekletilir: öğrenci 5 dakika içinde yeniden dokunursa
// sayılır; 5 dakikayı aşarsa o aranın tamamı sayılmaz. Ses/video çalarken
// geçen süre dokunma olmasa da sayılır. 30 dakika hiç çalışılmazsa sonraki
// hareket yeni bir oturum başlatır.
// Tıklama tıklama satır yazılmaz: site bilgileri cihazda toplar ve özet
// gönderir (her oturum bir satır, oturumdaki her ünite+kart bir satır).
// Gönderim dakikada bir, ekran arka plana geçince ve sayfa kapanırken yapılır;
// internet yoksa özet cihazda bekler, bir sonraki açılışta gönderilir.
// Kayıt veritabanındaki activity_save işleviyle yapılır; öğrenci yalnızca
// kendi kaydını gönderebilir, hiçbir kaydı okuyamaz. Öğretmen hesabı kaydedilmez.

import { useEffect } from 'react'
import { rest } from './memoryStore'

export interface ActivityPlace {
  card: string      // grammar, dictation, drill, library, kids, entry …
  unit?: string     // A1-U03, K001 … (yoksa boş)
  level?: string    // A1, A2, P, Çocuk, Kitaplık …
  depth?: number    // iç içe ekranlarda en derin olan geçerli (varsayılan 1)
}

interface Item { level: string; unit: string; card: string; ms: number; stats: Record<string, any> }
interface Miss { id: string; kind: string; unit: string; expected: string; typed: string }
interface Sess {
  id: string
  started_at: number
  ended_at: number
  ms: number
  device_kind: string
  device_info: string
  items: Record<string, Item>
  misses: Miss[]
  dirty?: boolean
}

const IDLE_MS = 5 * 60_000
const NEW_SESSION_GAP_MS = 30 * 60_000
const TICK_MS = 5_000
const FLUSH_MS = 60_000

let uid: string | null = null
let cur: Sess | null = null
let lastInteraction = 0
let lastTick = 0
let lastFlush = 0
let timer: number | null = null
let sending = false
let placeSeq = 0
// Dokunulmadan geçen, henüz sayılmamış süre (ekran anahtarı → ms)
let idleBuf = new Map<string, number>()
let idleTotal = 0
const places = new Map<number, ActivityPlace & { seq: number }>()

const curKey = (u: string) => `nc_act_cur_${u}`
const pendKey = (u: string) => `nc_act_pending_${u}`

function lsGet<T>(k: string, fb: T): T {
  try { const r = localStorage.getItem(k); return r == null ? fb : (JSON.parse(r) as T) ?? fb } catch { return fb }
}
function lsSet(k: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { /* sessiz */ }
}

function uuid(): string {
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID() } catch { /* yedek */ }
  const b = new Uint8Array(16)
  try { crypto.getRandomValues(b) } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256) }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Cihaz bilgisi ────────────────────────────────────────────────────────────
// Bilgisayarda "Windows · Chrome" gibi. Android'de Chrome model ve sürümü
// ayrıca verebiliyor (Samsung'lar kod olarak verir, ör. SM-A546E); iPhone/iPad
// model vermez. Kod → ad eşleştirmesi öğretmen ekranında yapılır.
export function deviceBasics(): { kind: string; os: string; browser: string; app: boolean } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const uad = (navigator as any)?.userAgentData
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
  const iPhone = /iPhone|iPod/.test(ua)
  const android = /Android/i.test(ua)
  const mobile = typeof uad?.mobile === 'boolean' ? uad.mobile : /Mobi/i.test(ua) || iPhone
  const tablet = iPad || (android && !/Mobile/i.test(ua))
  const kind = tablet ? 'tablet' : (mobile || iPhone || android) ? 'phone' : 'desktop'
  const os = iPad ? 'iPad' : iPhone ? 'iPhone' : android ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung İnternet'
    : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : ''
  let app = false
  try { app = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true } catch { /* yok */ }
  return { kind, os, browser, app }
}

async function deviceInfo(): Promise<string> {
  const b = deviceBasics()
  let os = b.os
  try {
    const uad = (navigator as any).userAgentData
    if (b.os === 'Android' && uad?.getHighEntropyValues) {
      const v = await uad.getHighEntropyValues(['model', 'platformVersion'])
      const ver = String(v?.platformVersion || '').split('.')[0]
      const model = String(v?.model || '').trim()
      os = [model, 'Android' + (ver ? ' ' + ver : '')].filter(Boolean).join(' · ')
    }
  } catch { /* model verilmezse yalnızca işletim sistemi */ }
  return [os, b.browser, b.app ? 'uygulama' : ''].filter(Boolean).join(' · ')
}

// ── Nerede? ──────────────────────────────────────────────────────────────────
function currentPlace(): ActivityPlace {
  let best: (ActivityPlace & { seq: number }) | null = null
  for (const p of places.values()) {
    if (!best || (p.depth ?? 1) > (best.depth ?? 1) || ((p.depth ?? 1) === (best.depth ?? 1) && p.seq > best.seq)) best = p
  }
  return best ?? { card: 'other' }
}

// Bir ekran görünür olduğu sürece orada geçen süre o ekrana yazılır.
export function useActivityPlace(place: ActivityPlace | null) {
  const key = place ? `${place.level ?? ''}|${place.unit ?? ''}|${place.card}|${place.depth ?? 1}` : ''
  useEffect(() => {
    if (!place) return undefined
    const id = ++placeSeq
    places.set(id, { ...place, seq: id })
    return () => { places.delete(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

// ── Oturum ───────────────────────────────────────────────────────────────────
function saveLocal() {
  if (!uid) return
  lsSet(curKey(uid), cur)
}
function readPending(): Sess[] {
  if (!uid) return []
  const v = lsGet<Sess[]>(pendKey(uid), [])
  return Array.isArray(v) ? v : []
}
function finishCurrent() {
  if (!uid || !cur) return
  const p = readPending()
  if (cur.ms > 0 || Object.keys(cur.items).length) p.push(cur)
  lsSet(pendKey(uid), p.slice(-40))
  cur = null
  lsSet(curKey(uid), null)
}
function ensureSession(now: number): Sess | null {
  if (!uid) return null
  if (cur && now - cur.ended_at > NEW_SESSION_GAP_MS) finishCurrent()
  if (!cur) {
    const b = deviceBasics()
    cur = { id: uuid(), started_at: now, ended_at: now, ms: 0, device_kind: b.kind, device_info: '', items: {}, misses: [], dirty: true }
    const mine = cur
    deviceInfo().then(info => { if (cur === mine) { mine.device_info = info; mine.dirty = true; saveLocal() } }).catch(() => { /* yok */ })
    saveLocal()
  }
  return cur
}
function itemFor(s: Sess, card?: string): Item {
  const p = currentPlace()
  const c = card || p.card
  const unit = p.unit ?? ''
  const k = `${unit}|${c}`
  if (!s.items[k]) s.items[k] = { level: p.level ?? '', unit, card: c, ms: 0, stats: {} }
  return s.items[k]
}

function mediaPlaying(): boolean {
  try {
    const els = document.querySelectorAll('audio,video')
    for (const el of Array.from(els) as HTMLMediaElement[]) if (!el.paused && !el.ended) return true
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return true
  } catch { /* yok */ }
  return false
}

function addTime(s: Sess, key: string | null, ms: number, now: number) {
  s.ended_at = now
  s.ms += ms
  const it = key && s.items[key] ? s.items[key] : itemFor(s)
  it.ms += ms
  s.dirty = true
}
// Bekletilen süre: öğrenci 5 dakika içinde döndüyse sayılır.
function commitIdle(now: number) {
  if (!idleTotal) return
  const s = ensureSession(now)
  if (s) for (const [k, ms] of idleBuf) addTime(s, k, ms, now)
  idleBuf = new Map(); idleTotal = 0
}
function dropIdle() { idleBuf = new Map(); idleTotal = 0 }

function tick() {
  if (!uid) return
  const now = Date.now()
  const dt = Math.min(Math.max(0, now - lastTick), TICK_MS * 3)
  lastTick = now
  if (document.visibilityState !== 'visible') return
  if (mediaPlaying()) {
    commitIdle(now)
    const s = ensureSession(now)
    if (s) addTime(s, null, dt, now)
  } else if (now - lastInteraction < 1500) {
    const s = ensureSession(now)
    if (s) addTime(s, null, dt, now)
  } else if (now - lastInteraction < IDLE_MS) {
    // dokunulmadan geçiyor: beklet
    const s = ensureSession(now)
    if (s) { const it = itemFor(s); const k = `${it.unit}|${it.card}`; idleBuf.set(k, (idleBuf.get(k) || 0) + dt); idleTotal += dt }
  } else {
    dropIdle()
    return
  }
  saveLocal()
  if (now - lastFlush > FLUSH_MS) void flushActivity()
}

function onInteract() {
  const now = Date.now()
  if (now - lastInteraction >= IDLE_MS) { dropIdle(); lastTick = now } // uzun ara sayılmaz
  else commitIdle(now)
  lastInteraction = now
}
function onVisibility() {
  if (document.visibilityState === 'visible') {
    lastTick = Date.now()
    lastInteraction = Date.now()
  } else {
    tick()
    // Ekrandan çıkarken: son dokunuştan beri 5 dakika olmadıysa bekletilen süre sayılır
    if (Date.now() - lastInteraction < IDLE_MS) commitIdle(Date.now()); else dropIdle()
    saveLocal()
    void flushActivity(true)
  }
}
function onPageHide() {
  tick()
  if (Date.now() - lastInteraction < IDLE_MS) commitIdle(Date.now()); else dropIdle()
  saveLocal()
  void flushActivity(true)
}
function onOnline() { void flushActivity() }

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

function startTracking(id: string) {
  if (uid === id) return
  stopTracking()
  uid = id
  cur = lsGet<Sess | null>(curKey(id), null)
  if (cur && (typeof cur.id !== 'string' || typeof cur.items !== 'object')) cur = null
  if (cur && Date.now() - cur.ended_at > NEW_SESSION_GAP_MS) finishCurrent()
  dropIdle()
  lastInteraction = Date.now()
  lastTick = Date.now()
  lastFlush = 0
  for (const e of EVENTS) window.addEventListener(e, onInteract, { capture: true, passive: true })
  window.addEventListener('scroll', onInteract, { capture: true, passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('online', onOnline)
  timer = window.setInterval(tick, TICK_MS)
  void flushActivity()
}

function stopTracking() {
  if (!uid) return
  tick()
  if (Date.now() - lastInteraction < IDLE_MS) commitIdle(Date.now())
  dropIdle()
  saveLocal()
  void flushActivity(true)
  for (const e of EVENTS) window.removeEventListener(e, onInteract, { capture: true } as any)
  window.removeEventListener('scroll', onInteract, { capture: true } as any)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('online', onOnline)
  if (timer != null) window.clearInterval(timer)
  timer = null
  uid = null
  cur = null
}

// Öğrenci hesabıyla girildiğinde App bunu çağırır; öğretmen için null.
export function useActivityTracker(studentId: string | null) {
  useEffect(() => {
    if (!studentId) return undefined
    startTracking(studentId)
    return () => stopTracking()
  }, [studentId])
}

// ── Gönderim ─────────────────────────────────────────────────────────────────
function toPayload(s: Sess) {
  return {
    id: s.id,
    started_at: s.started_at,
    ended_at: s.ended_at,
    active_seconds: Math.round(s.ms / 1000),
    device_kind: s.device_kind,
    device_info: s.device_info,
    items: Object.values(s.items).slice(0, 300).map(it => ({ level: it.level, unit: it.unit, card: it.card, seconds: Math.round(it.ms / 1000), stats: it.stats })),
    misses: s.misses.slice(0, 100),
  }
}

export async function flushActivity(keepalive = false) {
  if (!uid || sending) return
  const who = uid
  const pend = readPending()
  const live = cur && cur.dirty ? cur : null
  if (!pend.length && !live) return
  const batch = pend.slice(0, live ? 19 : 20)
  const sentMissIds = live ? live.misses.map(m => m.id) : []
  const payload = [...batch.map(toPayload), ...(live ? [toPayload(live)] : [])]
  sending = true
  lastFlush = Date.now()
  if (live) live.dirty = false
  try {
    await rest('rpc/activity_save', { method: 'POST', body: JSON.stringify({ p_sessions: payload }), keepalive })
    if (uid !== who) return
    const sentIds = new Set(batch.map(s => s.id))
    lsSet(pendKey(who), readPending().filter(s => !sentIds.has(s.id)))
    if (cur && live === cur) {
      cur.misses = cur.misses.filter(m => !sentMissIds.includes(m.id))
      saveLocal()
    }
  } catch {
    if (live) live.dirty = true
  } finally {
    sending = false
  }
}

// ── Kartlardan gelen sayılar ─────────────────────────────────────────────────
// Örn. activityStat('dictation', s => { s.written = (s.written || 0) + 1 })
export function activityStat(card: string, fn: (s: Record<string, any>) => void) {
  if (!uid) return
  const now = Date.now()
  onInteract()
  const s = ensureSession(now)
  if (!s) return
  try { fn(itemFor(s, card).stats) } catch { /* sayı kaydı siteyi bozmasın */ }
  s.dirty = true
  saveLocal()
}

// İlk denemede yanlış yazılan dikte cümlesi: öğrencinin ilk yazdığı ve doğrusu.
export function activityMiss(kind: string, expected: string, typed: string) {
  if (!uid) return
  const s = ensureSession(Date.now())
  if (!s || s.misses.length >= 100) return
  s.misses.push({ id: uuid(), kind, unit: currentPlace().unit ?? '', expected: expected.slice(0, 500), typed: typed.slice(0, 500) })
  s.dirty = true
  saveLocal()
}

export function bump(s: Record<string, any>, k: string, n = 1) { s[k] = (Number(s[k]) || 0) + n }
