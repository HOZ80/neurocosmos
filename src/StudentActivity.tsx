// ─── Öğretmen: Öğrenci etkinliği ──────────────────────────────────────────────
// Öğrencileri yönet > "Öğrenci etkinliği": kim ne kadar çalıştı, son girişler,
// kim bir süredir girmedi (alfabetik; raporlar sıralama tablosu değildir).
// Öğrenme sayfası > "Etkinlik" sekmesi: tek öğrencinin süresi, günleri, kartları,
// üniteleri, dikte/Drill/Shadowing/Kitaplık sonuçları, konuşma cevapları (veri
// varsa) ve son oturumları (IP ve cihaz).
// Veriler activityStore.ts'in gönderdiği özetlerden gelir; yalnızca öğretmen okur.
// Görünüm onaylanan önizlemeden alındı (Neurocosmos · Öğrenci etkinliği önizlemesi).

import { useEffect, useMemo, useState } from 'react'
import { rest } from './memoryStore'

// ── Veri ─────────────────────────────────────────────────────────────────────
export interface ActItem { unit_key: string; card: string; level: string; seconds: number; stats: Record<string, any> }
export interface ActSession {
  id: string; student_id: string; started_at: string; ended_at: string; active_seconds: number
  device_kind: string; device_info: string; ip: string | null; activity_items: ActItem[]
}
interface Miss { id: string; unit_key: string; expected: string; typed: string; created_at: string }
interface Speech {
  id: string; unit_key: string; question_text: string; question_type: 'free' | 'fixed' | 'critical'
  raw_text: string; confirmed_text: string; input_mode: 'voice' | 'text'; result: 'correct' | 'wrong' | null; created_at: string
}
interface Monthly { month: string; active_seconds: number; sessions: number; days: number; by_card: Record<string, number>; by_unit: Record<string, number> }
interface Overview { db_bytes: number; last: { student_id: string; last_at: string }[]; monthly_last: { student_id: string; month: string }[] }

export interface ActStudent { id: string; name: string; areas: string[] }

async function getAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; off < 50000; off += 1000) {
    const res = await rest(`${path}&limit=1000&offset=${off}`)
    const rows = (await res.json()) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}
const enc = (d: Date) => encodeURIComponent(d.toISOString())
async function fetchSessions(from: Date, to: Date, studentId?: string): Promise<ActSession[]> {
  return getAll<ActSession>(`activity_sessions?select=id,student_id,started_at,ended_at,active_seconds,device_kind,device_info,ip,activity_items(unit_key,card,level,seconds,stats)` +
    `&started_at=gte.${enc(from)}&started_at=lt.${enc(to)}${studentId ? `&student_id=eq.${studentId}` : ''}&order=started_at.asc`)
}
async function fetchOverview(): Promise<Overview> {
  const res = await rest('rpc/activity_overview', { method: 'POST', body: '{}' })
  return (await res.json()) as Overview
}

// ── Kartlar (sitedeki renkler) ───────────────────────────────────────────────
// Adlar activityStore'a App.tsx'teki ACTIVITY_CARD ve bileşenlerden gelir.
export const ACTIVITY_CARDS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  grammar: { label: 'Grammar', icon: '📖', color: '#6366F1', bg: '#EEF2FF' },
  audio: { label: 'Audio/Video', icon: '🎧', color: '#0EA5E9', bg: '#E0F2FE' },
  dictation: { label: 'Dictation', icon: '✍️', color: '#F59E0B', bg: '#FEF3C7' },
  shadowing: { label: 'Shadowing', icon: '🎙️', color: '#10B981', bg: '#D1FAE5' },
  drill: { label: 'Drill', icon: '🎯', color: '#8B5CF6', bg: '#F5F3FF' },
  scene: { label: 'Scene', icon: '🏰', color: '#B45309', bg: '#FEF3C7' },
  dictationAll: { label: 'Dictation All', icon: '📝', color: '#D97706', bg: '#FFF7ED' },
  shadowingAll: { label: 'Shadowing All', icon: '🗣️', color: '#059669', bg: '#ECFDF5' },
  dialogue: { label: 'Daily Dialogues', icon: '💬', color: '#0891B2', bg: '#ECFEFF' },
  memory: { label: 'Memory', icon: '🃏', color: '#4B4775', bg: '#ECEAF7' },
  brain: { label: 'My Brain', icon: '🧠', color: '#3B2F8F', bg: '#EDE9FE' },
  library: { label: 'Kitaplık', icon: '📚', color: '#EA580C', bg: '#FFEDD5' },
  kids: { label: 'Çocuk paneli', icon: '⭐', color: '#DB2777', bg: '#FCE7F3' },
  unit: { label: 'Ünite sayfası', icon: '📂', color: '#475569', bg: '#F1F5F9' },
  home: { label: 'Ana sayfa', icon: '🏠', color: '#64748B', bg: '#F1F5F9' },
  entry: { label: 'Giriş ekranı', icon: '🚪', color: '#94A3B8', bg: '#F1F5F9' },
  live: { label: 'Canlı ders', icon: '📡', color: '#E11D48', bg: '#FFE4E6' },
}
function cardMeta(k: string) { return ACTIVITY_CARDS[k] ?? { label: k || 'Diğer', icon: '•', color: '#64748B', bg: '#F1F5F9' } }

// ── Cihaz adı ────────────────────────────────────────────────────────────────
// Android'de Chrome, modeli kod olarak verir. Yaygın Samsung kodları için ad;
// bilinmeyen kod olduğu gibi yazılır. iPhone/iPad model vermez.
const SAMSUNG: Record<string, string> = {
  'SM-A057': 'Galaxy A05s', 'SM-A055': 'Galaxy A05', 'SM-A145': 'Galaxy A14', 'SM-A146': 'Galaxy A14 5G', 'SM-A155': 'Galaxy A15', 'SM-A156': 'Galaxy A15 5G',
  'SM-A165': 'Galaxy A16', 'SM-A166': 'Galaxy A16 5G', 'SM-A245': 'Galaxy A24', 'SM-A256': 'Galaxy A25', 'SM-A266': 'Galaxy A26', 'SM-A346': 'Galaxy A34',
  'SM-A356': 'Galaxy A35', 'SM-A366': 'Galaxy A36', 'SM-A546': 'Galaxy A54', 'SM-A556': 'Galaxy A55', 'SM-A566': 'Galaxy A56', 'SM-A135': 'Galaxy A13',
  'SM-A136': 'Galaxy A13 5G', 'SM-A235': 'Galaxy A23', 'SM-A336': 'Galaxy A33', 'SM-A536': 'Galaxy A53', 'SM-A325': 'Galaxy A32', 'SM-A326': 'Galaxy A32 5G',
  'SM-A525': 'Galaxy A52', 'SM-A526': 'Galaxy A52 5G', 'SM-A528': 'Galaxy A52s', 'SM-A515': 'Galaxy A51', 'SM-A715': 'Galaxy A71', 'SM-A125': 'Galaxy A12',
  'SM-S901': 'Galaxy S22', 'SM-S906': 'Galaxy S22+', 'SM-S908': 'Galaxy S22 Ultra', 'SM-S911': 'Galaxy S23', 'SM-S916': 'Galaxy S23+', 'SM-S918': 'Galaxy S23 Ultra',
  'SM-S711': 'Galaxy S23 FE', 'SM-S921': 'Galaxy S24', 'SM-S926': 'Galaxy S24+', 'SM-S928': 'Galaxy S24 Ultra', 'SM-S721': 'Galaxy S24 FE',
  'SM-S931': 'Galaxy S25', 'SM-S936': 'Galaxy S25+', 'SM-S938': 'Galaxy S25 Ultra', 'SM-G991': 'Galaxy S21', 'SM-G996': 'Galaxy S21+', 'SM-G998': 'Galaxy S21 Ultra',
  'SM-G990': 'Galaxy S21 FE', 'SM-G980': 'Galaxy S20', 'SM-G780': 'Galaxy S20 FE', 'SM-M336': 'Galaxy M33', 'SM-M346': 'Galaxy M34',
  'SM-X110': 'Galaxy Tab A9', 'SM-X115': 'Galaxy Tab A9', 'SM-X210': 'Galaxy Tab A9+', 'SM-X216': 'Galaxy Tab A9+', 'SM-X200': 'Galaxy Tab A8', 'SM-X205': 'Galaxy Tab A8',
  'SM-T220': 'Galaxy Tab A7 Lite', 'SM-T225': 'Galaxy Tab A7 Lite', 'SM-T500': 'Galaxy Tab A7', 'SM-T505': 'Galaxy Tab A7', 'SM-X710': 'Galaxy Tab S9', 'SM-X510': 'Galaxy Tab S9 FE',
}
export function deviceLabel(info: string): string {
  if (!info) return ''
  return info.split(' · ').map(part => {
    const m = /^(SM-[A-Z]\d{3})/.exec(part)
    if (m && SAMSUNG[m[1]]) return `${SAMSUNG[m[1]]} (${part})`
    return part
  }).join(' · ')
}
const KIND_LABEL: Record<string, string> = { phone: '📱 telefon', tablet: '📱 tablet', desktop: '💻 bilgisayar' }

// ── Zaman ────────────────────────────────────────────────────────────────────
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const DOW = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
type Per = 'week' | 'month'
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function mondayOf(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
function periodDays(per: Per, off: number): Date[] {
  const today = startOfDay(new Date())
  if (per === 'week') { const mon = addDays(mondayOf(today), off * 7); return Array.from({ length: 7 }, (_, i) => addDays(mon, i)) }
  const first = new Date(today.getFullYear(), today.getMonth() + off, 1)
  const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))
}
function periodLabel(per: Per, off: number) {
  const d = periodDays(per, off)
  if (per === 'month') return `${MONTHS[d[0].getMonth()]} ${d[0].getFullYear()}`
  if (off === 0) return 'Bu hafta'
  const a = d[0], b = d[6]
  return `${a.getDate()}${a.getMonth() !== b.getMonth() ? ' ' + MONTHS[a.getMonth()] : ''}–${b.getDate()} ${MONTHS[b.getMonth()]}`
}
function fmtMin(sec: number) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} dk`
  const h = Math.floor(m / 60), r = m % 60
  return `${h} sa${r ? ' ' + r + ' dk' : ''}`
}
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function dayName(d: Date) {
  const t = startOfDay(new Date())
  if (sameDay(d, t)) return 'Bugün'
  if (sameDay(d, addDays(t, -1))) return 'Dün'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
function levelOf(areas: string[]) {
  if (areas.some(a => a.startsWith('child_'))) return 'Çocuk'
  const l = ['A2', 'A1'].filter(a => areas.includes(a))
  if (l.length) return l.join(' · ')
  if (areas.includes('library')) return 'Kitaplık'
  return 'Alan yok'
}
const isChild = (s: ActStudent) => s.areas.some(a => a.startsWith('child_')) || (s.areas.includes('library') && !s.areas.includes('A1') && !s.areas.includes('A2'))
const counted = (s: ActSession) => s.active_seconds > 0

// İki metin arasında kelime farkı (en uzun ortak dizi) – önizlemedekiyle aynı
function wordDiff(a: string, b: string) {
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:"]/g, '')
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean)
  const n = A.length, m = B.length
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = norm(A[i]) === norm(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const okA = new Array(n).fill(false), okB = new Array(m).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) { if (norm(A[i]) === norm(B[j])) { okA[i] = okB[j] = true; i++; j++ } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++ }
  return { A, B, okA, okB }
}

// ── Görünüm (önizlemenin stilleri) ───────────────────────────────────────────
const CSS = `
.nca{color:var(--foreground);font-family:var(--font-body,'Inter',system-ui,sans-serif)}
.nca button{font-family:inherit}
.nca .wrap{margin:0 auto;padding:20px 16px 48px}
.nca .w560{max-width:560px}
.nca .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.nca .top h1{margin:0;flex:1;min-width:0;text-align:center;font-family:var(--font-display);font-size:21px;font-weight:700}
.nca .top .ph{width:72px;flex-shrink:0}
.nca .quiet{background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:10px;padding:9px 14px;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap}
.nca .quiet:disabled{opacity:.6;cursor:default}
.nca .card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,0.04)}
.nca .muted{margin:0;font-size:14px;color:var(--muted-foreground);line-height:1.5}
.nca .h2{margin:0 0 10px;font-family:var(--font-display);font-size:17px;font-weight:700}
.nca .sec{padding:16px;margin-bottom:14px}
.nca .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
.nca .av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-family:var(--font-display);flex-shrink:0;font-size:16px}
.nca .gauge{padding:12px 14px;margin-bottom:14px}
.nca .gbar{height:8px;border-radius:99px;background:var(--secondary);overflow:hidden;margin:8px 0 6px}
.nca .gbar i{display:block;height:100%;border-radius:99px}
.nca .per{display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:nowrap}
.nca .seg{display:inline-grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;background:var(--secondary);border:1px solid var(--border);border-radius:10px}
.nca .seg button{border:none;background:transparent;border-radius:8px;padding:7px 12px;font-size:14px;font-weight:600;color:var(--muted-foreground);cursor:pointer}
.nca .seg button.on{background:var(--card);color:var(--foreground);font-weight:700;box-shadow:0 1px 3px rgba(15,23,42,0.12)}
.nca .arrow{width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--card);font-size:17px;cursor:pointer;color:var(--foreground);flex-shrink:0}
.nca .arrow:disabled{opacity:.35;cursor:default}
.nca .plabel{font-family:var(--font-display);font-weight:700;font-size:15px;min-width:92px;text-align:center;white-space:nowrap}
.nca .arow{width:100%;display:flex;align-items:center;gap:12px;padding:13px 14px;background:none;border:none;border-top:1px solid var(--border);cursor:pointer;text-align:left;color:inherit}
.nca .arow:first-child{border-top:none}
.nca .arow .mid{flex:1;min-width:0}
.nca .chev{color:var(--muted-foreground);font-size:18px}
.nca .mini{display:flex;align-items:flex-end;gap:3px;height:30px;flex-shrink:0}
.nca .mini i{display:block;width:7px;border-radius:2px;background:var(--primary)}
.nca .mini i.z{background:#E2E8F0;height:3px!important}
.nca .mini i.f{background:transparent;border:1px dashed #CBD5E1;height:3px!important}
.nca .warn{color:#9A3412;background:#FFEDD5}
.nca .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
@media (max-width:560px){.nca .tiles{grid-template-columns:repeat(2,1fr)}}
.nca .tile{padding:12px 14px}
.nca .tile .k{font-size:12.5px;color:var(--muted-foreground);font-weight:600}
.nca .tile .v{font-family:var(--font-display);font-size:22px;font-weight:800;margin-top:2px;line-height:1.15}
.nca .tile .n{font-size:12px;color:var(--muted-foreground);margin-top:2px}
.nca .days{display:flex;align-items:flex-end;gap:6px;height:130px;padding-top:16px}
.nca .days .d{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.nca .days .b{width:100%;max-width:34px;border-radius:6px 6px 3px 3px;background:var(--primary)}
.nca .days .b.z{background:#E2E8F0;height:3px}
.nca .days .b.f{background:transparent;border:1px dashed #CBD5E1;height:3px}
.nca .days .lab{font-size:11.5px;color:var(--muted-foreground);margin-top:6px;white-space:nowrap}
.nca .days .val{font-size:11px;font-weight:600;margin-bottom:3px;white-space:nowrap}
.nca .days.month{gap:2px}.nca .days.month .lab{font-size:10px}.nca .days.month .val{display:none}
.nca .hb{display:flex;align-items:center;gap:10px;margin:9px 0}
.nca .hb .l{width:118px;flex-shrink:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nca .hb .tr{flex:1;height:10px;background:var(--secondary);border-radius:99px;overflow:hidden}
.nca .hb .tr i{display:block;height:100%;border-radius:99px}
.nca .hb .m{width:78px;white-space:nowrap;text-align:right;font-size:13px;color:var(--muted-foreground);flex-shrink:0}
.nca .urow{padding:10px 0;border-top:1px solid var(--border)}
.nca .urow:first-of-type{border-top:none}
.nca .urow .top2{display:flex;justify-content:space-between;gap:10px;font-size:14.5px;font-weight:600}
.nca .cs{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.nca .trend{display:flex;align-items:flex-end;gap:10px;height:92px;margin:6px 0 4px}
.nca .trend .c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.nca .trend .b{width:100%;max-width:46px;border-radius:6px 6px 3px 3px;background:#F59E0B}
.nca .trend .b.cur{background:#D97706}
.nca .trend .v{font-size:12px;font-weight:700;margin-bottom:3px}
.nca .trend .lab{font-size:11px;color:var(--muted-foreground);margin-top:5px;white-space:nowrap}
.nca .sent{padding:11px 0;border-top:1px solid var(--border);font-size:14.5px;line-height:1.55}
.nca .sent .src{font-size:12px;color:var(--muted-foreground);margin-bottom:3px}
.nca .row2{display:flex;gap:8px}
.nca .row2 .k{width:84px;flex-shrink:0;font-size:12.5px;color:var(--muted-foreground);padding-top:2px}
.nca .miss{background:#FEF3C7;color:#92400E;border-radius:4px;padding:0 3px;font-weight:600}
.nca .bad{color:#B91C1C;text-decoration:line-through;text-decoration-color:rgba(185,28,28,0.6)}
.nca .chg{background:#E0E7FF;color:#3730A3;border-radius:4px;padding:0 3px;font-weight:600}
.nca .stats3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 10px}
.nca .stats3 div{background:var(--secondary);border-radius:10px;padding:9px 10px}
.nca .stats3 .v{font-family:var(--font-display);font-weight:800;font-size:19px}
.nca .stats3 .k{font-size:12px;color:var(--muted-foreground)}
.nca .ans{padding:12px 0;border-top:1px solid var(--border)}
.nca .ans:first-of-type{border-top:none}
.nca .ans .q{font-size:14.5px;font-weight:600;margin-bottom:6px}
.nca .ans .meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.nca .sess{display:flex;gap:12px;padding:11px 0;border-top:1px solid var(--border);font-size:14px}
.nca .sess:first-of-type{border-top:none}
.nca .sess .when{width:104px;flex-shrink:0}
.nca .sess .when b{display:block;font-size:14px}
.nca .sess .when span{display:block;font-size:12px;color:var(--muted-foreground)}
.nca .dev{font-size:12.5px;color:var(--muted-foreground);margin-top:4px;overflow-wrap:anywhere}
.nca .note{font-size:12.5px;color:var(--muted-foreground);margin:8px 0 0;line-height:1.45}
.nca .empty{padding:18px 16px;text-align:center}
.nca .err{padding:16px;color:#991B1B;font-size:14px}
`
function Styles() { return <style>{CSS}</style> }

const AV_COLORS: [string, string][] = [['#E0E7FF', '#3730A3'], ['#DCFCE7', '#166534'], ['#FEF3C7', '#92400E'], ['#FCE7F3', '#9D174D'], ['#E0F2FE', '#075985'], ['#EDE9FE', '#5B21B6'], ['#FFEDD5', '#9A3412']]
function avColor(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length] }

function PeriodBar({ per, off, setPer, setOff }: { per: Per; off: number; setPer: (p: Per) => void; setOff: (n: number) => void }) {
  return (
    <div className="per">
      <div className="seg">
        <button className={per === 'week' ? 'on' : ''} onClick={() => { setPer('week'); setOff(0) }}>Hafta</button>
        <button className={per === 'month' ? 'on' : ''} onClick={() => { setPer('month'); setOff(0) }}>Ay</button>
      </div>
      <span style={{ flex: 1 }} />
      <button className="arrow" aria-label="Önceki" onClick={() => setOff(off - 1)}>‹</button>
      <span className="plabel">{periodLabel(per, off)}</span>
      <button className="arrow" aria-label="Sonraki" disabled={off >= 0} onClick={() => { if (off < 0) setOff(off + 1) }}>›</button>
    </div>
  )
}

// Gün gün dakikalar (gelmemiş günler null)
function series(sessions: ActSession[], days: Date[]) {
  const today = startOfDay(new Date())
  const by = new Map<string, number>()
  for (const s of sessions) { const k = dayKey(new Date(s.started_at)); by.set(k, (by.get(k) || 0) + s.active_seconds) }
  return days.map(d => ({ d, sec: d > today ? null : (by.get(dayKey(d)) || 0) }))
}
function inPeriod(s: ActSession, days: Date[]) {
  const t = new Date(s.started_at)
  return t >= days[0] && t < addDays(days[days.length - 1], 1)
}
function topUnit(sessions: ActSession[], unitTitles: Record<string, string>) {
  const by = new Map<string, number>()
  for (const s of sessions) for (const it of s.activity_items || []) if (it.unit_key) by.set(it.unit_key, (by.get(it.unit_key) || 0) + it.seconds)
  let best = '', bs = 0
  for (const [k, v] of by) if (v > bs) { best = k; bs = v }
  if (!best) return ''
  const t = unitTitles[best]
  return `En çok: ${best}${t && t !== best ? ' · ' + t : ''}`
}

// ── Excel ────────────────────────────────────────────────────────────────────
async function downloadExcel(fileBase: string, students: ActStudent[], sessions: ActSession[], unitTitles: Record<string, string>, misses?: Miss[]) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const head = (cols: string[]) => cols.map(v => ({ value: v, fontWeight: 'bold' as const }))
  const nameOf = (id: string) => students.find(s => s.id === id)?.name || '?'
  const ordered = students.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const live = sessions.filter(counted)
  const s1: any[][] = [head(['Öğrenci', 'Seviye', 'Toplam süre (dk)', 'Girdiği gün', 'Oturum', 'En çok çalıştığı', 'Son giriş'])]
  for (const st of ordered) {
    const my = live.filter(s => s.student_id === st.id)
    const days = new Set(my.map(s => dayKey(new Date(s.started_at)))).size
    const last = my.length ? new Date(my[my.length - 1].started_at) : null
    s1.push([st.name, levelOf(st.areas), Math.round(my.reduce((a, s) => a + s.active_seconds, 0) / 60), days, my.length,
      topUnit(my, unitTitles).replace(/^En çok: /, '') || null, last ? `${dayName(last)} ${hhmm(last)}` : null])
  }
  const s2: any[][] = [head(['Öğrenci', 'Tarih', 'Dakika'])]
  const dayMap = new Map<string, { id: string; d: Date; sec: number }>()
  for (const s of live) {
    const d = startOfDay(new Date(s.started_at)); const k = s.student_id + '|' + dayKey(d)
    const e = dayMap.get(k) || { id: s.student_id, d, sec: 0 }; e.sec += s.active_seconds; dayMap.set(k, e)
  }
  for (const e of [...dayMap.values()].sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), 'tr') || a.d.getTime() - b.d.getTime())) {
    s2.push([nameOf(e.id), `${e.d.getDate()} ${MONTHS[e.d.getMonth()]} ${e.d.getFullYear()}`, Math.round(e.sec / 60)])
  }
  const s3: any[][] = [head(['Öğrenci', 'Başlangıç', 'Bitiş', 'Süre (dk)', 'Cihaz türü', 'Cihaz', 'IP', 'Kartlar'])]
  for (const s of live.slice().sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const a = new Date(s.started_at), b = new Date(s.ended_at)
    const cards = (s.activity_items || []).filter(i => i.seconds > 0).sort((x, y) => y.seconds - x.seconds)
      .map(i => `${cardMeta(i.card).label}${i.unit_key ? ' ' + i.unit_key : ''} (${Math.max(1, Math.round(i.seconds / 60))} dk)`).join(', ')
    s3.push([nameOf(s.student_id), `${a.toLocaleDateString('tr-TR')} ${hhmm(a)}`, `${b.toLocaleDateString('tr-TR')} ${hhmm(b)}`, Math.round(s.active_seconds / 60),
      (KIND_LABEL[s.device_kind] || s.device_kind || '').replace(/^\S+ /, ''), deviceLabel(s.device_info) || null, s.ip || null, cards || null])
  }
  const w = (n: number) => ({ width: n })
  const sheets: any[] = [
    { data: s1, sheet: 'Özet', stickyRowsCount: 1, columns: [w(18), w(10), w(14), w(11), w(9), w(34), w(16)] },
    { data: s2, sheet: 'Günler', stickyRowsCount: 1, columns: [w(18), w(18), w(9)] },
    { data: s3, sheet: 'Oturumlar', stickyRowsCount: 1, columns: [w(18), w(18), w(18), w(9), w(12), w(34), w(16), w(60)] },
  ]
  if (misses && misses.length) {
    const s4: any[][] = [head(['Tarih', 'Ünite', 'Doğrusu', 'İlk yazdığı'])]
    for (const m of misses) { const d = new Date(m.created_at); s4.push([`${d.toLocaleDateString('tr-TR')} ${hhmm(d)}`, m.unit_key || null, m.expected, m.typed]) }
    sheets.push({ data: s4, sheet: 'Dikte', stickyRowsCount: 1, columns: [w(18), w(10), w(50), w(50)] })
  }
  const blob: Blob = await (writeExcelFile as any)(sheets).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'Etkinlik'}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ═════════════════════════════════════════════════════════════════════════════
// Öğrenci etkinliği (liste)
// ═════════════════════════════════════════════════════════════════════════════
export default function StudentActivity({ students, unitTitles, onBack, onOpenStudent, hidden }: {
  students: ActStudent[]
  unitTitles: Record<string, string>
  onBack: () => void
  onOpenStudent: (id: string) => void
  hidden?: boolean
}) {
  const [per, setPer] = useState<Per>('week')
  const [off, setOff] = useState(0)
  const [ov, setOv] = useState<Overview | null>(null)
  const [data, setData] = useState<{ key: string; sessions: ActSession[] } | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const days = useMemo(() => periodDays(per, off), [per, off])
  const key = `${per}|${off}|${tick}`
  useEffect(() => {
    let alive = true
    setError(false)
    const today = startOfDay(new Date())
    const from = new Date(Math.min(days[0].getTime(), addDays(today, -6).getTime()))
    const to = addDays(days[days.length - 1], 1)
    Promise.all([fetchSessions(from, to), ov && tick === 0 ? Promise.resolve(ov) : fetchOverview()])
      .then(([sessions, o]) => { if (alive) { setData({ key, sessions }); setOv(o) } })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const list = useMemo(() => students.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')), [students])
  const sessions = data?.sessions.filter(counted) ?? []
  const periodSessions = sessions.filter(s => inPeriod(s, days))
  const total = periodSessions.reduce((a, s) => a + s.active_seconds, 0)
  const activeN = new Set(periodSessions.map(s => s.student_id)).size
  const today = startOfDay(new Date())
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const mb = ov ? ov.db_bytes / 1e6 : 0
  const over = mb >= 400

  return (
    <div className="nca" style={{ minHeight: '100vh', background: 'var(--background)', display: hidden ? 'none' : undefined }}>
      <Styles />
      <div className="wrap w560">
        <div className="top"><button className="quiet" onClick={onBack}>← Geri</button><h1>Öğrenci etkinliği</h1><span className="ph" /></div>

        <div className="card gauge">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><b>Veritabanı</b><span>{ov ? `${mb.toFixed(1)} MB / 500 MB` : '…'}</span></div>
          <div className="gbar"><i style={{ width: `${Math.max(1.2, Math.min(100, mb / 5))}%`, background: over ? '#F97316' : '#10B981' }} /></div>
          {over && <p className="note" style={{ margin: '0 0 4px', color: '#9A3412', fontWeight: 600 }}>Veritabanı 400 MB'ı geçti. Ücretsiz planın sınırına yaklaşıyor; Claude'a haber ver.</p>}
          <p className="note" style={{ margin: 0 }}>Ücretsiz planın sınırı 500 MB. 400 MB'ı geçerse çubuk turuncuya döner ve burada uyarı çıkar. 12 aydan eski ayrıntılar kendiliğinden aylık özete dönüşür.</p>
        </div>

        <PeriodBar per={per} off={off} setPer={setPer} setOff={setOff} />

        {error ? (
          <div className="card err"><p style={{ margin: '0 0 10px' }}>Etkinlik okunamadı. İnternetini kontrol et.</p><button className="quiet" onClick={() => setTick(t => t + 1)}>Tekrar dene</button></div>
        ) : !data || data.key !== key ? (
          <p className="muted">Etkinlik yükleniyor…</p>
        ) : (
          <>
            <p className="muted" style={{ margin: '0 2px 10px' }}>{activeN} öğrenci çalıştı · toplam {fmtMin(total)}</p>
            <div className="card" style={{ padding: '2px 0' }}>
              {list.map(st => {
                const mine = periodSessions.filter(s => s.student_id === st.id)
                const tot = mine.reduce((a, s) => a + s.active_seconds, 0)
                const bars = series(sessions.filter(s => s.student_id === st.id), per === 'week' ? days : last7)
                const mx = Math.max(40 * 60, ...bars.map(b => b.sec || 0))
                const lastIso = ov?.last.find(l => l.student_id === st.id)?.last_at
                const [bg, fg] = avColor(st.id)
                let lastLine
                if (!lastIso) lastLine = <span className="chip" style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>Hiç girmedi</span>
                else {
                  const ld = new Date(lastIso)
                  const n = Math.round((today.getTime() - startOfDay(ld).getTime()) / 86400000)
                  lastLine = n >= 5
                    ? <span className="chip warn">{n} gündür girmedi</span>
                    : <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Son giriş: {n === 0 ? 'bugün' : n === 1 ? 'dün' : `${n} gün önce`} {hhmm(ld)}</span>
                }
                return (
                  <button key={st.id} className="arow" onClick={() => onOpenStudent(st.id)}>
                    <span className="av" style={{ background: bg, color: fg }}>{(st.name[0] || '?').toLocaleUpperCase('tr')}</span>
                    <span className="mid">
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <b style={{ fontFamily: 'var(--font-display)', fontSize: '16px' }}>{st.name}</b>
                        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{levelOf(st.areas)}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: '14px', marginTop: '2px' }}>
                        <b>{tot ? fmtMin(tot) : '—'}</b> <span style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>{tot ? topUnit(mine, unitTitles) : ''}</span>
                      </span>
                      <span style={{ display: 'block', marginTop: '4px' }}>{lastLine}</span>
                    </span>
                    <span className="mini" title="Son 7 gün">
                      {bars.map((b, i) => b.sec == null ? <i key={i} className="f" /> : b.sec === 0 ? <i key={i} className="z" /> : <i key={i} style={{ height: `${Math.max(4, b.sec / mx * 30)}px` }} />)}
                    </span>
                    <span className="chev">›</span>
                  </button>
                )
              })}
            </div>
            <p className="note">Liste her zaman alfabetik. Sağdaki küçük çubuklar son 7 gün; kesikli olanlar henüz gelmemiş günler. Öğretmen hesabının önizlemeleri sayılmaz.</p>
            <button className="quiet" style={{ width: '100%', marginTop: '14px' }} disabled={busy} onClick={async () => {
              setBusy(true)
              try { await downloadExcel(`Etkinlik_${periodLabel(per, off)}`, list, periodSessions, unitTitles) } catch { /* sessiz */ }
              setBusy(false)
            }}>{busy ? 'Hazırlanıyor…' : "Excel'e indir"}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Öğrenme sayfası › Etkinlik sekmesi
// ═════════════════════════════════════════════════════════════════════════════
export function ActivityTab({ student, unitTitles }: { student: ActStudent; unitTitles: Record<string, string> }) {
  const [per, setPer] = useState<Per>('week')
  const [off, setOff] = useState(0)
  const [tick, setTick] = useState(0)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [moreSess, setMoreSess] = useState(false)
  const [moreMiss, setMoreMiss] = useState(false)
  const [d, setD] = useState<{ key: string; sessions: ActSession[]; misses: Miss[]; speech: Speech[]; monthly: Monthly[]; lastAt: string | null } | null>(null)

  const days = useMemo(() => periodDays(per, off), [per, off])
  const key = `${student.id}|${per}|${off}|${tick}`
  useEffect(() => {
    let alive = true
    setError(false); setMoreSess(false); setMoreMiss(false)
    const today = startOfDay(new Date())
    const fourWeeks = addDays(mondayOf(today), -21)
    const pStart = days[0], pEnd = addDays(days[days.length - 1], 1)
    const from = addDays(new Date(Math.min(pStart.getTime(), fourWeeks.getTime())), -30)
    const sid = student.id
    Promise.all([
      fetchSessions(from, pEnd, sid),
      getAll<Miss>(`activity_misses?select=id,unit_key,expected,typed,created_at&student_id=eq.${sid}&created_at=gte.${enc(pStart)}&created_at=lt.${enc(pEnd)}&order=created_at.desc`),
      getAll<Speech>(`speech_answers?select=id,unit_key,question_text,question_type,raw_text,confirmed_text,input_mode,result,created_at&student_id=eq.${sid}&created_at=gte.${enc(pStart)}&created_at=lt.${enc(pEnd)}&order=created_at.desc`),
      getAll<Monthly>(`activity_monthly?select=month,active_seconds,sessions,days,by_card,by_unit&student_id=eq.${sid}&order=month.asc`),
      fetchOverview(),
    ]).then(([sessions, misses, speech, monthly, ov]) => {
      if (!alive) return
      setD({ key, sessions, misses, speech, monthly, lastAt: ov.last.find(l => l.student_id === sid)?.last_at ?? (ov.monthly_last.some(m => m.student_id === sid) ? 'old' : null) })
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const bar = <PeriodBar per={per} off={off} setPer={setPer} setOff={setOff} />
  const child = isChild(student)
  const name = student.name

  let body: React.ReactNode
  if (error) {
    body = <div className="card err"><p style={{ margin: '0 0 10px' }}>Etkinlik okunamadı. İnternetini kontrol et.</p><button className="quiet" onClick={() => setTick(t => t + 1)}>Tekrar dene</button></div>
  } else if (!d || d.key !== key) {
    body = <p className="muted">Etkinlik yükleniyor…</p>
  } else if (!d.lastAt) {
    body = <div className="card empty"><p className="muted">{name} henüz siteye girmedi. İlk girişinden sonra etkinlik burada kendiliğinden görünür.</p></div>
  } else {
    const all = d.sessions.filter(counted)
    const ps = all.filter(s => inPeriod(s, days))
    const monthRow = per === 'month' ? d.monthly.find(m => { const x = new Date(m.month + 'T00:00:00'); return x.getFullYear() === days[0].getFullYear() && x.getMonth() === days[0].getMonth() }) : null
    if (!ps.length && monthRow) body = <MonthlySummary m={monthRow} />
    else if (!ps.length) body = <div className="card empty"><p className="muted">Bu dönemde {name} siteye girmedi.</p></div>
    else body = <ActivityBody student={student} unitTitles={unitTitles} days={days} per={per} all={all} ps={ps} misses={d.misses} speech={d.speech}
      moreSess={moreSess} setMoreSess={setMoreSess} moreMiss={moreMiss} setMoreMiss={setMoreMiss} child={child}
      onExcel={async () => {
        setBusy(true)
        try { await downloadExcel(`Etkinlik_${name}_${periodLabel(per, off)}`, [student], ps, unitTitles, d.misses) } catch { /* sessiz */ }
        setBusy(false)
      }} busy={busy} />
  }

  return (
    <div className="nca">
      <Styles />
      {bar}
      {body}
    </div>
  )
}

function MonthlySummary({ m }: { m: Monthly }) {
  const cards = Object.entries(m.by_card || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const mx = Math.max(1, ...cards.map(c => c[1]))
  return (
    <>
      <div className="tiles">
        <div className="card tile"><div className="k">Toplam süre</div><div className="v">{fmtMin(m.active_seconds)}</div><div className="n">gerçekten çalışılan</div></div>
        <div className="card tile"><div className="k">Girdiği gün</div><div className="v">{m.days}</div><div className="n">bu ay</div></div>
        <div className="card tile"><div className="k">Oturum</div><div className="v">{m.sessions}</div><div className="n">bu ay</div></div>
      </div>
      {cards.length > 0 && (
        <div className="card sec"><h2 className="h2">Kartlara göre</h2>
          {cards.map(([k, v]) => { const c = cardMeta(k); return <div key={k} className="hb"><span className="l">{c.icon} {c.label}</span><span className="tr"><i style={{ width: `${v / mx * 100}%`, background: c.color }} /></span><span className="m">{fmtMin(v)}</span></div> })}
        </div>
      )}
      <p className="note" style={{ margin: '0 2px 12px' }}>Bu ay 12 aydan eski olduğu için ayrıntıları aylık özete dönüştü; yalnızca toplamlar duruyor.</p>
    </>
  )
}

function ActivityBody({ student, unitTitles, days, per, all, ps, misses, speech, moreSess, setMoreSess, moreMiss, setMoreMiss, child, onExcel, busy }: {
  student: ActStudent; unitTitles: Record<string, string>; days: Date[]; per: Per
  all: ActSession[]; ps: ActSession[]; misses: Miss[]; speech: Speech[]
  moreSess: boolean; setMoreSess: (b: boolean) => void; moreMiss: boolean; setMoreMiss: (b: boolean) => void
  child: boolean; onExcel: () => void; busy: boolean
}) {
  const month = per === 'month'
  const tot = ps.reduce((a, s) => a + s.active_seconds, 0)
  const ser = series(ps, days)
  const daysIn = ser.filter(x => (x.sec || 0) > 0).length
  const past = ser.filter(x => x.sec != null).length
  const mobile = ps.filter(s => s.device_kind === 'phone' || s.device_kind === 'tablet').reduce((a, s) => a + s.active_seconds, 0)
  const mShare = tot ? mobile / tot : 0
  const mx = Math.max(30 * 60, ...ser.map(x => x.sec || 0))
  const items = ps.flatMap(s => s.activity_items || [])
  const itemsOf = (card: string) => items.filter(i => i.card === card)
  const sum = (arr: ActItem[], k: string) => arr.reduce((a, i) => a + (Number(i.stats?.[k]) || 0), 0)

  // Kartlara göre
  const byCard = new Map<string, number>()
  for (const it of items) byCard.set(it.card, (byCard.get(it.card) || 0) + it.seconds)
  const cards = [...byCard.entries()].filter(([, v]) => v >= 30).sort((a, b) => b[1] - a[1])
  const cmx = Math.max(1, ...cards.map(c => c[1]))

  // Ünitelere / kitaplara göre
  const byUnit = new Map<string, { sec: number; cards: Map<string, number>; its: ActItem[] }>()
  for (const it of items) {
    if (!it.unit_key) continue
    const e = byUnit.get(it.unit_key) || { sec: 0, cards: new Map<string, number>(), its: [] as ActItem[] }
    e.sec += it.seconds; e.cards.set(it.card, (e.cards.get(it.card) || 0) + it.seconds); e.its.push(it)
    byUnit.set(it.unit_key, e)
  }
  const units = [...byUnit.entries()].filter(([, e]) => e.sec >= 30 || e.its.some(i => Object.keys(i.stats || {}).length)).sort((a, b) => b[1].sec - a[1].sec)

  // Dikte
  const dic = itemsOf('dictation')
  const written = sum(dic, 'written'), first = sum(dic, 'first'), hinted = sum(dic, 'hinted')
  const today = startOfDay(new Date())
  const weeks = [3, 2, 1, 0].map(k => {
    const from = addDays(mondayOf(today), -7 * k), to = addDays(from, 7)
    const its = all.filter(s => { const t = new Date(s.started_at); return t >= from && t < to }).flatMap(s => (s.activity_items || []).filter(i => i.card === 'dictation'))
    const w = sum(its, 'written')
    return w ? Math.round(sum(its, 'first') / w * 100) : null
  })
  const wLabs = ['4 hafta önce', '3 hafta önce', 'Geçen hafta', 'Bu hafta']

  // Drill
  const dr = itemsOf('drill')
  const topicSet = new Set<string>()
  const hardMap = new Map<string, { label: string; n: number; unit: string }>()
  for (const it of dr) {
    for (const t of (Array.isArray(it.stats?.topics) ? it.stats.topics : [])) topicSet.add(it.unit_key + '|' + t)
    const h = it.stats?.hard_topics
    if (h && typeof h === 'object') for (const [id, v] of Object.entries<any>(h)) {
      const k = it.unit_key + '|' + id
      const e = hardMap.get(k) || { label: String(v?.label || id), n: 0, unit: it.unit_key }
      e.n += Number(v?.n) || 0; hardMap.set(k, e)
    }
  }
  const hard = [...hardMap.values()].sort((a, b) => b.n - a.n)

  // Shadowing
  const sh = itemsOf('shadowing')
  const shSent = sh.reduce((a, i) => a + (Array.isArray(i.stats?.s) ? i.stats.s.length : 0), 0)
  const shRep = sum(sh, 'replays')
  const speeds = new Map<string, number>()
  for (const i of sh) for (const [k, v] of Object.entries<any>(i.stats?.speeds || {})) speeds.set(k, (speeds.get(k) || 0) + (Number(v) || 0))
  const topSpeed = [...speeds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  // Kitaplık
  const lib = itemsOf('library').filter(i => i.unit_key)
  const libReads = sum(lib, 'reads'), libListens = sum(lib, 'listens')
  const libShadow = lib.some(i => i.stats?.shadowing)

  // Son oturumlar: yeni IP ya da cihaz (son 30 günde bu hesapta görülmemiş)
  const isNew = (s: ActSession) => {
    const t = new Date(s.started_at).getTime()
    const prev = all.filter(o => { const ot = new Date(o.started_at).getTime(); return ot < t && ot >= t - 30 * 86400000 })
    if (!prev.length) return false
    const ipNew = !!s.ip && !prev.some(o => o.ip === s.ip)
    const devNew = !!s.device_info && !prev.some(o => o.device_info === s.device_info)
    return ipNew || devNew
  }
  const recent = ps.slice().sort((a, b) => b.started_at.localeCompare(a.started_at))
  const shownSess = moreSess ? recent : recent.slice(0, 8)
  const shownMiss = moreMiss ? misses : misses.slice(0, 8)

  return (
    <>
      <div className="tiles">
        <div className="card tile"><div className="k">Toplam süre</div><div className="v">{fmtMin(tot)}</div><div className="n">gerçekten çalışılan</div></div>
        <div className="card tile"><div className="k">Girdiği gün</div><div className="v">{daysIn} / {past}</div><div className="n">{month ? 'bu ay şimdiye kadar' : 'bu hafta şimdiye kadar'}</div></div>
        <div className="card tile"><div className="k">Ortalama oturum</div><div className="v">{fmtMin(tot / ps.length)}</div><div className="n">{ps.length} oturum</div></div>
        <div className="card tile"><div className="k">Cihaz</div><div className="v">{mShare >= 0.5 ? `📱 %${Math.round(mShare * 100)}` : `💻 %${Math.round((1 - mShare) * 100)}`}</div><div className="n">{mShare >= 0.5 ? 'telefondan' : 'bilgisayardan'}</div></div>
      </div>

      <div className="card sec"><h2 className="h2">Gün gün</h2>
        <div className={'days' + (month ? ' month' : '')}>
          {ser.map((x, i) => {
            const lab = month ? ((x.d.getDate() % 5 === 1) ? String(x.d.getDate()) : '') : DOW[(x.d.getDay() + 6) % 7]
            if (x.sec == null) return <div key={i} className="d"><span className="b f" /><span className="lab">{lab}</span></div>
            if (x.sec === 0) return <div key={i} className="d"><span className="b z" /><span className="lab">{lab}</span></div>
            return <div key={i} className="d" title={`${x.d.getDate()} ${MONTHS[x.d.getMonth()]} · ${fmtMin(x.sec)}`}><span className="val">{Math.round(x.sec / 60)}</span><span className="b" style={{ height: `${Math.max(5, x.sec / mx * 92)}px` }} /><span className="lab">{lab}</span></div>
          })}
        </div>
        <p className="note">Dakika. Kesikli: henüz gelmemiş gün.</p>
      </div>

      {cards.length > 0 && (
        <div className="card sec"><h2 className="h2">Kartlara göre</h2>
          {cards.map(([k, v]) => { const c = cardMeta(k); return <div key={k} className="hb"><span className="l">{c.icon} {c.label}</span><span className="tr"><i style={{ width: `${v / cmx * 100}%`, background: c.color }} /></span><span className="m">{fmtMin(v)}</span></div> })}
        </div>
      )}

      {units.length > 0 && (
        <div className="card sec"><h2 className="h2">{child ? 'Kitaplara göre' : 'Ünitelere göre'}</h2>
          {units.map(([u, e]) => {
            const t = unitTitles[u]
            const libIts = e.its.filter(i => i.card === 'library')
            const isBook = libIts.length > 0 && e.cards.size === 1
            const reads = sum(libIts, 'reads'), listens = sum(libIts, 'listens'), marks = sum(libIts, 'marks')
            const pages = new Set(libIts.flatMap(i => Array.isArray(i.stats?.pages) ? i.stats.pages : [])).size
            const qt = sum(libIts, 'quiz_total'), qo = sum(libIts, 'quiz_ok')
            const orange = { background: '#FFEDD5', color: '#9A3412' }
            return (
              <div key={u} className="urow">
                <div className="top2"><span>{isBook ? '📚 ' : ''}{u}{t && t !== u ? ' · ' + t : ''}</span><span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>{fmtMin(e.sec)}</span></div>
                <div className="cs">
                  {isBook ? (
                    <>
                      {reads > 0 && <span className="chip" style={orange}>{reads} kez okudu</span>}
                      {pages > 0 && <span className="chip" style={orange}>{pages} sayfa açtı</span>}
                      {listens > 0 && <span className="chip" style={orange}>Dinle {listens}</span>}
                      {marks > 0 && <span className="chip" style={{ background: '#DCFCE7', color: '#166534' }}>{marks} kelime işaretledi</span>}
                      {qt > 0 && <span className="chip" style={{ background: '#F1F5F9', color: '#334155' }}>Sorular {qo} / {qt}</span>}
                    </>
                  ) : [...e.cards.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => { const c = cardMeta(k); return <span key={k} className="chip" style={{ background: c.bg, color: c.color }}>{c.icon} {c.label}</span> })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {written > 0 && (
        <div className="card sec"><h2 className="h2">✍️ Dictation</h2>
          <div className="stats3">
            <div><div className="v">{written}</div><div className="k">cümle yazdı</div></div>
            <div><div className="v">{Math.round(first / written * 100)}%</div><div className="k">ilk denemede doğru</div></div>
            <div><div className="v">{hinted}</div><div className="k">ipucuyla tamamladı</div></div>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)' }}>İlk denemede doğru, haftadan haftaya</div>
          <div className="trend">
            {weeks.map((v, i) => v == null
              ? <div key={i} className="c"><span className="v" style={{ color: 'var(--muted-foreground)' }}>—</span><span className="b" style={{ height: '3px', background: '#E2E8F0' }} /><span className="lab">{wLabs[i]}</span></div>
              : <div key={i} className="c"><span className="v">{v}%</span><span className={'b' + (i === 3 ? ' cur' : '')} style={{ height: `${Math.max(3, v / 100 * 70)}px` }} /><span className="lab">{wLabs[i]}</span></div>)}
          </div>
          {misses.length > 0 && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)', marginTop: '12px' }}>Zorlandığı cümleler</div>
              {shownMiss.map(m => {
                const df = wordDiff(m.expected, m.typed)
                return (
                  <div key={m.id} className="sent">
                    <div className="src">{m.unit_key ? m.unit_key + ' · ' : ''}ilk yazdığı</div>
                    <div className="row2"><span className="k">Doğrusu</span><span>{df.A.map((w, i) => <span key={i}>{i ? ' ' : ''}{df.okA[i] ? w : <span className="miss">{w}</span>}</span>)}</span></div>
                    <div className="row2"><span className="k">Yazdığı</span><span>{df.B.map((w, i) => <span key={i}>{i ? ' ' : ''}{df.okB[i] ? w : <span className="bad">{w}</span>}</span>)}</span></div>
                  </div>
                )
              })}
              {misses.length > 8 && !moreMiss && <button className="quiet" style={{ width: '100%', marginTop: '8px', fontSize: '14px' }} onClick={() => setMoreMiss(true)}>Hepsini göster ({misses.length})</button>}
              <p className="note"><span className="miss">sarı</span> kaçırdığı ya da yanlış yazdığı kelime, <span className="bad">üstü çizili</span> onun yazdığı. Yalnızca ilk denemede yanlış olan cümleler saklanır.</p>
            </>
          )}
        </div>
      )}

      {dr.length > 0 && (sum(dr, 'ok') + sum(dr, 'hard')) > 0 && (
        <div className="card sec"><h2 className="h2">🎯 Drill</h2>
          <div className="stats3">
            <div><div className="v">{topicSet.size}</div><div className="k">konu çalıştı</div></div>
            <div><div className="v">{sum(dr, 'ok')}</div><div className="k">doğru üretebildim</div></div>
            <div><div className="v">{sum(dr, 'hard')}</div><div className="k">zorlandım</div></div>
          </div>
          {hard.length > 0 && (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Zorlandığı konular</div>
              {hard.map((h, i) => <div key={i} className="sent">{h.unit && <div className="src">{h.unit}</div>}{h.label}{h.n > 1 && <span className="chip warn" style={{ marginLeft: '6px' }}>{h.n} kez</span>}</div>)}
            </>
          )}
          <p className="note">Tekrar takvimi Drill sekmesinde, değişmiyor. Burada yalnızca o dönemin sonuçları.</p>
        </div>
      )}

      {shSent > 0 && (
        <div className="card sec"><h2 className="h2">🎙️ Shadowing</h2>
          <div className="stats3">
            <div><div className="v">{shSent}</div><div className="k">cümle çalıştı</div></div>
            <div><div className="v">{shRep}</div><div className="k">tekrar dinledi</div></div>
            <div><div className="v">{topSpeed ? `${topSpeed}x` : '—'}</div><div className="k">en çok kullandığı hız</div></div>
          </div>
          <p className="note">Ses kaydı yok; yalnızca sayılar.</p>
        </div>
      )}

      {lib.length > 0 && (
        <div className="card sec"><h2 className="h2">📚 Kitaplık</h2>
          <div className="stats3">
            <div><div className="v">{libReads}</div><div className="k">bölüm okudu</div></div>
            <div><div className="v">{libListens}</div><div className="k">Dinle'ye bastı</div></div>
            <div><div className="v">{libShadow ? 'Açık' : 'Kapalı'}</div><div className="k">gölgeleme</div></div>
          </div>
          <p className="note">Kelime işaretleri ve okuma ilerlemesi zaten kayıtlı; Kitaplık sekmesinde duruyor. Buraya süre ve okuma sayısı eklendi.</p>
        </div>
      )}

      {speech.length > 0 && (
        <div className="card sec"><h2 className="h2">🗣️ Konuşma cevapları</h2>
          {speech.map(it => {
            const type = it.question_type === 'fixed' ? ['Cevabı belli', '#DCFCE7', '#166534'] : it.question_type === 'critical' ? ['Kritik', '#FEF3C7', '#92400E'] : ['Serbest', '#EEF2FF', '#3730A3']
            const heard = it.input_mode === 'voice' && it.raw_text
            const df = heard ? wordDiff(it.raw_text, it.confirmed_text) : null
            const changed = !!heard && it.raw_text.toLowerCase().replace(/[.]/g, '').trim() !== it.confirmed_text.toLowerCase().replace(/[.]/g, '').trim()
            return (
              <div key={it.id} className="ans">
                <div className="q">{it.question_text}</div>
                <div className="meta">
                  <span className="chip" style={{ background: type[1], color: type[2] }}>{type[0]}</span>
                  <span className="chip" style={{ background: 'var(--secondary)', color: '#334155' }}>{it.input_mode === 'voice' ? '🎤 sesle' : '⌨️ yazıyla'}</span>
                  {it.result && <span className="chip" style={it.result === 'correct' ? { background: '#DCFCE7', color: '#166534' } : { background: '#FEE2E2', color: '#B91C1C' }}>{it.result === 'correct' ? 'Doğru' : 'Yanlış'}</span>}
                  {changed && <span className="chip" style={{ background: '#E0E7FF', color: '#3730A3' }}>yazıda düzeltti</span>}
                </div>
                {df && <div className="row2" style={{ fontSize: '14.5px' }}><span className="k">Duyulan</span><span>{df.A.map((w, i) => <span key={i}>{i ? ' ' : ''}{df.okA[i] ? w : <span className="bad">{w}</span>}</span>)}</span></div>}
                <div className="row2" style={{ fontSize: '14.5px', marginTop: '3px' }}><span className="k">{df ? 'Onayladığı' : 'Yazdığı'}</span><span>{df ? df.B.map((w, i) => <span key={i}>{i ? ' ' : ''}{df.okB[i] ? w : <span className="chg">{w}</span>}</span>) : it.confirmed_text}</span></div>
              </div>
            )
          })}
          <p className="note"><span className="bad">üstü çizili</span>: tanıyıcının duyduğu, öğrencinin değiştirdiği kelime. <span className="chg">mavi</span>: yazıda düzelttiği hali. Konuşurken yanlış söyleyip yazıda düzeltiyorsa kuralı biliyor ama henüz otomatikleşmemiş demektir.</p>
        </div>
      )}

      <div className="card sec"><h2 className="h2">Son oturumlar</h2>
        {shownSess.map(s => {
          const t = new Date(s.started_at)
          const its = (s.activity_items || []).filter(i => i.seconds >= 30).sort((a, b) => b.seconds - a.seconds).slice(0, 4)
          return (
            <div key={s.id} className="sess">
              <div className="when"><b>{dayName(t)}</b><span>{hhmm(t)} · {KIND_LABEL[s.device_kind] || s.device_kind || '—'}</span></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{fmtMin(s.active_seconds)}</b>
                {isNew(s) && <span className="chip warn" style={{ marginLeft: '8px' }}>yeni cihaz</span>}
                {its.length > 0 && <div className="cs">{its.map((i, k) => { const c = cardMeta(i.card); return <span key={k} className="chip" style={{ background: c.bg, color: c.color }}>{c.icon} {c.label}</span> })}</div>}
                <div className="dev">{[deviceLabel(s.device_info), s.ip ? `IP ${s.ip}` : ''].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </div>
          )
        })}
        {recent.length > 8 && !moreSess && <button className="quiet" style={{ width: '100%', marginTop: '8px', fontSize: '14px' }} onClick={() => setMoreSess(true)}>Hepsini göster ({recent.length})</button>}
        <p className="note">Ekran arka plandayken ya da 5 dakika hiçbir şeye dokunulmadığında geçen süre sayılmaz. "Yeni cihaz": son 30 günde bu hesapta görülmemiş bir IP ya da cihazdan giriş. Mobil internette IP sık değişir; IP tek başına kişiyi ya da yeri kesin göstermez. IP'ler 90 gün sonra kendiliğinden silinir.</p>
      </div>

      <p className="note" style={{ margin: '0 2px 12px' }}>Bölümler yalnızca {student.name} adlı öğrencide o dönemde veri varsa görünür.</p>
      <button className="quiet" style={{ width: '100%' }} disabled={busy} onClick={onExcel}>{busy ? 'Hazırlanıyor…' : "Excel'e indir"}</button>
    </>
  )
}
