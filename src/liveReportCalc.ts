// ─── Canlı Ders raporları: sayma kuralları ────────────────────────────────────
// Veritabanından gelen ham kayıtları, kabul edilen rapor önizlemesindeki
// kurallara göre sayar. Bu dosyada ağ bağlantısı yoktur; sadece hesap vardır.
//
// SAYMA KURALLARI (rapor ekranındaki "Nasıl sayılıyor?" ile aynı):
// - Yazılıda her öğrencinin o sorudaki SON sonucu sayılır; öğretmen kararı
//   değiştirdiyse onun kararı sayılır.
// - Cevapsız: derse katıldı ama o soruya hiç cevap göndermedi.
// - Aynı soruda üst üste iki yanlış birebir destektir; "yakın" yanlış sayılmaz.
// - Sözlüde her söz için: ilk denemede doğru / düzeltmeden sonra doğru / yapamadı.
// - Zorlanıyor: o konudaki soruların en az yarısı yanlış, cevapsız ya da
//   yapamadı ise, ya da o konuda birebir desteğe düştüyse.

import type { AutoStatus, BoardToken } from './liveShared'
import { autoCheck, splitAccepted, tokensToText, cleanBoard } from './liveShared'

export type Fin = 'dogru' | 'yakin' | 'yanlis' | 'cevapsiz' | 'notr'
export type OralRes = 'ilk' | 'duz' | 'yap'
export type LessonKind = 'written' | 'oral' | 'both'

// ─── Veritabanından gelen ham kayıtlar ───
export interface RawQuestion { id: string; session_id: string; seq: number; kind: 'question' | 'board'; board: unknown; task: string; topic: string; expected: string; closed_at: string | null }
export interface RawAnswer { id: string; question_id: string; session_id: string; student_id: string; text: string; attempt_no: number; response_ms: number | null; submitted_at: string }
export interface RawVerdict { question_id: string; student_id: string; teacher_status: 'dogru' | 'yakin' | 'yanlis' | null; one_on_one: boolean; unanswered: boolean }
export interface RawAttendance { session_id: string; student_id: string; joined_at: string; drop_count: number }
export interface RawTurn { id: string; session_id: string; question_id: string | null; student_id: string; prompt: string; topic: string; seq: number; is_second: boolean; result: 'first_try' | 'after_fix' | 'failed' | null; one_on_one: boolean }
export interface RawLesson { questions: RawQuestion[]; answers: RawAnswer[]; verdicts: RawVerdict[]; attendance: RawAttendance[]; turns: RawTurn[] }

export interface LessonInfo { id: string; classId: string; startedAt: Date; endedAt: Date | null; title: string; kind: LessonKind }

// ─── Hesaplanmış ders ───
export interface WQ { id: string; text: string; task: string; topic: string; expected: string }
export interface OQ { key: string; text: string; topic: string }
export interface Attempt { n: number; text: string; sec: number | null; r: Fin }
export interface WEvent { lesson: string; q: number; s: string; att: Attempt[]; fin: Fin; bb: boolean }
export interface OEvent { lesson: string; q: number; s: string; r: OralRes; bb: boolean; again: boolean }

export interface LessonCalc {
  info: LessonInfo
  w: WQ[]
  o: OQ[]
  wEv: WEvent[]
  oEv: OEvent[]
  present: Set<string>
  drops: Map<string, number>
  isW: boolean
  isO: boolean
}

export const NO_TOPIC = 'Konu girilmemiş'
export function konuOf(k: string | null | undefined): string {
  const t = String(k || '').trim()
  return t || NO_TOPIC
}

const ORAL_MAP: Record<string, OralRes> = { first_try: 'ilk', after_fix: 'duz', failed: 'yap' }

// Ders kaydından (ham veri) rapor için hesaplanmış ders üretir.
export function buildLesson(info: LessonInfo, raw: RawLesson): LessonCalc {
  const present = new Set<string>()
  const drops = new Map<string, number>()
  const joined = new Map<string, number>()
  for (const a of raw.attendance) {
    present.add(a.student_id)
    drops.set(a.student_id, a.drop_count || 0)
    joined.set(a.student_id, Date.parse(a.joined_at) || 0)
  }
  // Cevap gönderen ya da söz alan öğrenci derste demektir (yoklama satırı eksik kalsa bile).
  for (const a of raw.answers) present.add(a.student_id)
  for (const t of raw.turns) present.add(t.student_id)

  // ── Yazılı ──
  const qs = raw.questions.filter(q => q.kind === 'question').sort((a, b) => a.seq - b.seq)
  const w: WQ[] = qs.map(q => ({
    id: q.id, text: tokensToText(cleanBoard(q.board) as BoardToken[]), task: q.task || '', topic: q.topic || '', expected: q.expected || '',
  }))
  const answersBy = new Map<string, RawAnswer[]>()
  for (const a of raw.answers) {
    const k = a.question_id + '|' + a.student_id
    const l = answersBy.get(k)
    if (l) l.push(a); else answersBy.set(k, [a])
  }
  const verdictBy = new Map<string, RawVerdict>()
  for (const v of raw.verdicts) verdictBy.set(v.question_id + '|' + v.student_id, v)

  const lessonEnd = info.endedAt ? info.endedAt.getTime() : Date.now()
  const wEv: WEvent[] = []
  qs.forEach((q, qi) => {
    const hasExp = splitAccepted(q.expected).length > 0
    const closedAt = q.closed_at ? Date.parse(q.closed_at) : lessonEnd
    for (const sid of present) {
      const list = (answersBy.get(q.id + '|' + sid) || []).slice().sort((a, b) => a.attempt_no - b.attempt_no)
      if (!list.length) {
        // Soru kapanmadan önce derse girmediyse cevap veremezdi; cevapsız sayılmaz.
        const j = joined.get(sid)
        if (j == null || j > closedAt) continue
        wEv.push({ lesson: info.id, q: qi, s: sid, att: [], fin: 'cevapsiz', bb: false })
        continue
      }
      const autos: AutoStatus[] = list.map(a => (hasExp ? autoCheck(q.expected, a.text) : 'notr'))
      const v = verdictBy.get(q.id + '|' + sid)
      const lastAuto = autos[autos.length - 1]
      const fin: Fin = (v && v.teacher_status) ? v.teacher_status : lastAuto
      let bb = !!(v && v.one_on_one)
      for (let i = 1; i < autos.length; i++) if (autos[i] === 'yanlis' && autos[i - 1] === 'yanlis') bb = true
      const att: Attempt[] = list.map((a, i) => ({
        n: a.attempt_no,
        text: a.text,
        sec: a.response_ms == null ? null : Math.max(1, Math.round(a.response_ms / 1000)),
        r: i === list.length - 1 ? fin : autos[i],
      }))
      wEv.push({ lesson: info.id, q: qi, s: sid, att, fin, bb })
    }
  })

  // ── Sözlü ──
  const qText = new Map<string, { text: string; topic: string }>()
  for (const q of raw.questions) qText.set(q.id, { text: tokensToText(cleanBoard(q.board) as BoardToken[]), topic: q.topic || '' })
  const done = raw.turns.filter(t => t.result).slice().sort((a, b) => a.seq - b.seq)
  const o: OQ[] = []
  const oIndex = new Map<string, number>()
  const oEv: OEvent[] = []
  for (const t of done) {
    const key = t.question_id ? 'q:' + t.question_id : 'p:' + (t.prompt || '').trim()
    let idx = oIndex.get(key)
    if (idx == null) {
      const linked = t.question_id ? qText.get(t.question_id) : undefined
      idx = o.length
      oIndex.set(key, idx)
      o.push({ key, text: (t.prompt || '').trim() || linked?.text || '(soru yazılmamış)', topic: (t.topic || '').trim() || linked?.topic || '' })
    }
    oEv.push({ lesson: info.id, q: idx, s: t.student_id, r: ORAL_MAP[t.result as string], bb: !!t.one_on_one, again: !!t.is_second })
  }

  const hasW = qs.length > 0
  const hasO = oEv.length > 0
  let isW = hasW || info.kind === 'written' || info.kind === 'both'
  const isO = hasO || info.kind === 'oral' || info.kind === 'both'
  if (!isW && !isO) isW = true
  return { info, w, o, wEv, oEv, present, drops, isW, isO }
}

export function lessonKindLabel(l: LessonCalc, showOral: boolean): string {
  const w = l.isW
  const o = l.isO && showOral
  if (w && o) return 'Yazılı + sözlü'
  if (w) return 'Yazılı'
  return 'Sözlü'
}

// ─── Sayımlar ───
export interface Agg { d: number; y: number; x: number; c: number; s: number; i: number; dz: number; yp: number; bb: number; t: number; tn: number; u: number }
export function zero(): Agg { return { d: 0, y: 0, x: 0, c: 0, s: 0, i: 0, dz: 0, yp: 0, bb: 0, t: 0, tn: 0, u: 0 } }

export function addW(a: Agg, e: WEvent) {
  if (e.fin === 'dogru') a.d++
  else if (e.fin === 'yakin') a.y++
  else if (e.fin === 'yanlis') a.x++
  else if (e.fin === 'cevapsiz') a.c++
  else a.u++ // işaretlenmemiş açık uçlu cevap: sayıya girmez, ayrıca gösterilir
  if (e.bb) a.bb++
  for (const t of e.att) if (t.sec != null) { a.t += t.sec; a.tn++ }
}
export function addO(a: Agg, e: OEvent) {
  a.s++
  if (e.r === 'ilk') a.i++
  else if (e.r === 'duz') a.dz++
  else a.yp++
  if (e.bb) a.bb++
}

export function eventsOf(ls: LessonCalc[]) {
  return { w: ls.flatMap(l => l.wEv), o: ls.flatMap(l => l.oEv) }
}
export function hasOral(ls: LessonCalc[]): boolean { return ls.some(l => l.oEv.length > 0) }

export interface StudentAgg extends Agg { pres: number; drop: number }
export function aggStudents(ls: LessonCalc[], ids: string[]): Record<string, StudentAgg> {
  const out: Record<string, StudentAgg> = {}
  for (const id of ids) {
    let pres = 0, drop = 0
    for (const l of ls) if (l.present.has(id)) { pres++; drop += l.drops.get(id) || 0 }
    out[id] = { ...zero(), pres, drop }
  }
  for (const l of ls) {
    for (const e of l.wEv) if (out[e.s]) addW(out[e.s], e)
    for (const e of l.oEv) if (out[e.s]) addO(out[e.s], e)
  }
  return out
}

export interface KonuAgg { tot: Agg; st: Record<string, Agg>; qs: Set<string>; oq: Set<string> }
export function aggKonu(ls: LessonCalc[], onlyStudent?: string): Record<string, KonuAgg> {
  const K: Record<string, KonuAgg> = {}
  const get = (k: string) => K[k] || (K[k] = { tot: zero(), st: {}, qs: new Set(), oq: new Set() })
  for (const l of ls) {
    for (const e of l.wEv) {
      if (onlyStudent && e.s !== onlyStudent) continue
      const k = get(konuOf(l.w[e.q].topic))
      addW(k.tot, e)
      k.st[e.s] = k.st[e.s] || zero()
      addW(k.st[e.s], e)
      k.qs.add(l.info.id + ':' + e.q)
    }
    for (const e of l.oEv) {
      if (onlyStudent && e.s !== onlyStudent) continue
      const k = get(konuOf(l.o[e.q].topic))
      addO(k.tot, e)
      k.st[e.s] = k.st[e.s] || zero()
      addO(k.st[e.s], e)
      k.oq.add(l.info.id + ':' + e.q)
    }
  }
  return K
}

// Zorlanıyor: en az yarısı yanlış / cevapsız / yapamadı, ya da birebir desteğe düştü.
export function struggling(a: Agg): boolean {
  const n = a.d + a.y + a.x + a.c + a.s
  if (!n) return false
  return a.bb > 0 || (a.x + a.c + a.yp) >= Math.ceil(n / 2)
}

// ─── Tarih yardımcıları (cihazın yerel saati; Türkiye) ───
export const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function fd(d: Date): string { return d.getDate() + ' ' + AY[d.getMonth()] + ' ' + GUN[d.getDay()] }
export function ft(d: Date): string { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
export function isoDate(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export interface Period { from: Date; to: Date; label: string } // to: dahil değil
export function weekPeriod(offset: number, now = new Date()): Period {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = (base.getDay() + 6) % 7 // Pazartesi = 0
  const from = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow + offset * 7)
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7)
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1)
  const sameMonth = from.getMonth() === last.getMonth() && from.getFullYear() === last.getFullYear()
  const yr = from.getFullYear() === last.getFullYear() ? '' : ' ' + from.getFullYear()
  const label = sameMonth
    ? `${from.getDate()}–${last.getDate()} ${AY[last.getMonth()]}`
    : `${from.getDate()} ${AY[from.getMonth()]}${yr} – ${last.getDate()} ${AY[last.getMonth()]}`
  return { from, to, label }
}
export function monthPeriod(offset: number, now = new Date()): Period {
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  return { from, to, label: `${AY[from.getMonth()]} ${from.getFullYear()}` }
}

// "Ekim" gibi Türkçe harfleri koruyup dosya adına uygun hale getirir.
export function fileSafe(s: string): string {
  return String(s || '').replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+/g, '-').replace(/^-+|-+$/g, '')
}
export function asciiSafe(s: string): string {
  return fileSafe(String(s || '').replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ş/g, 's').replace(/Ş/g, 'S').replace(/ü/g, 'u').replace(/Ü/g, 'U'))
}

export const RESULT_LABEL: Record<Fin | OralRes, string> = {
  dogru: 'Doğru', yakin: 'Yakın', yanlis: 'Yanlış', cevapsiz: 'Cevapsız', notr: 'İşaretlenmedi',
  ilk: 'İlk denemede doğru', duz: 'Düzeltmeden sonra doğru', yap: 'Yapamadı',
}
