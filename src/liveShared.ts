// ─── Canlı Ders: ortak parçalar ───────────────────────────────────────────────
// Supabase bağlantısı (anlık iletim dahil), tahta cümlesinin veri biçimi,
// cevap kontrolü, isim biçimi ve Sheets'ten içe aktarma burada.

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, getAccessToken } from './auth'

// Sitenin kendi giriş oturumunu kullanır; ayrı bir giriş yoktur.
export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => {
    try { return await getAccessToken() } catch { return null }
  },
  realtime: { params: { eventsPerSecond: 20 } },
})

export function newId(): string {
  try { return crypto.randomUUID() } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }
}

// ─── Tahta cümlesi ───
export type ColorKey = 'ozne' | 'fiil' | 'nesne' | 'zaman' | 'baglac' | 'kiremit'
export interface BoardToken {
  w: string          // kelime
  p?: string         // kelimeye yapışık noktalama (renk almaz)
  c?: ColorKey | null
  b?: boolean        // kalın
  i?: boolean        // italik
  h?: boolean        // sarı fosforlu zemin
}

export const ROLES: { k: ColorKey; l: string; m: string }[] = [
  { k: 'ozne', l: 'Özne', m: 'düz çizgi' },
  { k: 'fiil', l: 'Fiil', m: 'çift çizgi' },
  { k: 'nesne', l: 'Nesne', m: 'noktalı çizgi' },
  { k: 'zaman', l: 'Zaman / yer', m: 'dalgalı çizgi' },
  { k: 'baglac', l: 'Bağlaç', m: 'kesik çizgi' },
]

// Cümleyi kelimelere böler. Kısaltmalar (doesn't) tek parça kalır;
// sondaki noktalama kelimeye yapışık durur ama renk almaz.
export function tokenize(text: string): BoardToken[] {
  const out: BoardToken[] = []
  for (const raw of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const m = raw.match(/^(.*?)([.,!?;:…]*)$/)
    const w = m ? m[1] : raw
    const p = m ? m[2] : ''
    if (!w) {
      if (out.length) out[out.length - 1].p = (out[out.length - 1].p || '') + p
      else out.push({ w: p })
      continue
    }
    out.push(p ? { w, p } : { w })
  }
  return out
}

export function tokensToText(tokens: BoardToken[]): string {
  return tokens.map(t => t.w + (t.p || '')).join(' ')
}

// Yeni yazılan cümleye eski biçimleri sırayla taşır (aynı sıradaki kelime
// değişmediyse biçimi korunur).
export function retokenize(text: string, old: BoardToken[]): BoardToken[] {
  const fresh = tokenize(text)
  return fresh.map((t, i) => {
    const o = old[i]
    if (o && o.w === t.w) return { ...t, c: o.c ?? null, b: o.b, i: o.i, h: o.h }
    return t
  })
}

export function cleanBoard(raw: unknown): BoardToken[] {
  if (!Array.isArray(raw)) return []
  const ok: ColorKey[] = ['ozne', 'fiil', 'nesne', 'zaman', 'baglac', 'kiremit']
  return raw.filter(t => t && typeof t.w === 'string').map((t: any) => ({
    w: String(t.w),
    ...(t.p ? { p: String(t.p) } : {}),
    c: ok.includes(t.c) ? t.c : null,
    b: !!t.b, i: !!t.i, h: !!t.h,
  }))
}

// ─── Kalemler ───
export type Pen = ColorKey | 'bold' | 'italic' | 'highlight' | 'eraser'

// Bir sürükleme hareketinin ilk dokunduğu kelime "ekle mi, kaldır mı"yı belirler:
// ilk kelimede o biçim zaten varsa hareket boyunca kaldırır, yoksa ekler.
export function penIsOn(t: BoardToken, pen: Pen): boolean {
  if (pen === 'bold') return !!t.b
  if (pen === 'italic') return !!t.i
  if (pen === 'highlight') return !!t.h
  if (pen === 'eraser') return false
  return t.c === pen
}
export function applyPen(t: BoardToken, pen: Pen, remove: boolean): BoardToken {
  if (pen === 'eraser') return { w: t.w, ...(t.p ? { p: t.p } : {}), c: null, b: false, i: false, h: false }
  if (pen === 'bold') return { ...t, b: !remove }
  if (pen === 'italic') return { ...t, i: !remove }
  if (pen === 'highlight') return { ...t, h: !remove }
  return { ...t, c: remove ? null : pen }
}

// ─── İsim biçimi: "Ali A." ───
export function shortName(displayName: string, initial: string): string {
  const first = String(displayName || '').trim().split(/\s+/)[0] || '?'
  const ini = String(initial || '').trim().charAt(0).toLocaleUpperCase('tr-TR')
  return ini ? `${first} ${ini}.` : first
}

// ─── Cevap kontrolü ───
// Sitedeki drill kontrolüyle aynı kurallar: "//" ile alternatifler,
// kısaltma = açık hal ('d ve 's hariç), büyük-küçük harf ve noktalama önemsiz.
export type AutoStatus = 'dogru' | 'yakin' | 'yanlis' | 'notr'

function expandContractions(s: string): string {
  let out = s.replace(/[’‘`´]/g, "'")
  out = out.replace(/\bwon't\b/g, 'will not')
  out = out.replace(/\bcan't\b/g, 'can not')
  out = out.replace(/\bcannot\b/g, 'can not')
  out = out.replace(/\bshan't\b/g, 'shall not')
  out = out.replace(/n't\b/g, ' not')
  out = out.replace(/'re\b/g, ' are')
  out = out.replace(/'ve\b/g, ' have')
  out = out.replace(/'ll\b/g, ' will')
  out = out.replace(/'m\b/g, ' am')
  return out
}
export function normalizeAnswer(s: string): string {
  return expandContractions(String(s || '').toLowerCase())
    .replace(/[.,!?;:"'`()\-_/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
export function splitAccepted(expected: string): string[] {
  return String(expected || '').split('//').map(s => s.trim()).filter(Boolean)
}
// Kesme işaretini unutmuş yazımları onarır: "doesnt" → "doesn't".
function repairApostrophes(s: string): string {
  return String(s || '')
    .replace(/\b(do|does|did|is|are|was|were|has|have|had|could|would|should|must|need)nt\b/gi, "$1n't")
    .replace(/\bwont\b/gi, "won't").replace(/\bcant\b/gi, "can't")
}
// Yardımcı fiil, zamir, artikel gibi kısa kelimelerdeki fark hiçbir zaman
// "küçük yazım hatası" sayılmaz.
const FUNC = new Set('do does did is are am was were not has have had will would can could shall should may might must a an the he she it they we i you me him her us them his its their our my your this that these those there here and or but to of in on at for with from by'.split(' '))
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  const d: number[][] = []
  for (let i = 0; i <= m; i++) d[i] = [i]
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return d[m][n]
}
// -s, -es, -ed, -ing farkları dilbilgisi hatasıdır, yazım hatası değil.
function isInflection(x: string, y: string): boolean {
  const s = x.length <= y.length ? x : y
  const l = x.length <= y.length ? y : x
  if (['s', 'es', 'ed', 'd', 'ing'].some(f => l === s + f)) return true
  if (s.endsWith('e') && l === s.slice(0, -1) + 'ing') return true
  if (s.endsWith('y') && (l === s.slice(0, -1) + 'ies' || l === s.slice(0, -1) + 'ied')) return true
  return false
}
function isTypo(a: string, b: string): boolean {
  const A = a.split(' '), B = b.split(' ')
  if (A.length !== B.length) return false
  let diffs = 0
  for (let i = 0; i < A.length; i++) {
    if (A[i] === B[i]) continue
    diffs++
    if (FUNC.has(A[i]) || FUNC.has(B[i])) return false
    if (isInflection(A[i], B[i])) return false
    const d = lev(A[i], B[i])
    if (d > 2) return false
    if (Math.min(A[i].length, B[i].length) < 4 && d > 1) return false
  }
  return diffs > 0 && diffs <= 2
}
export function autoCheck(expected: string, answer: string): AutoStatus {
  const alts = splitAccepted(expected).map(normalizeAnswer).filter(Boolean)
  if (!alts.length) return 'notr'
  const a = normalizeAnswer(answer)
  if (!a) return 'yanlis'
  if (alts.includes(a)) return 'dogru'
  const r = normalizeAnswer(repairApostrophes(answer))
  if (alts.includes(r)) return 'yakin'
  if (alts.some(x => isTypo(a, x) || isTypo(r, x))) return 'yakin'
  return 'yanlis'
}

// ─── Sheets'ten içe aktarma ───
// Sütunlar: Soru | Görev | Beklenen cevap | Konu | Not
// Renk işareti: (ö ...) özne, (f ...) fiil, (n ...) nesne, (z ...) zaman/yer, (b ...) bağlaç
export interface PlanItemDraft {
  id: string
  board: BoardToken[]
  task: string
  expected: string
  topic: string
  teacher_note: string
}

const MARK: Record<string, ColorKey> = { 'ö': 'ozne', 'o': 'ozne', 'f': 'fiil', 'n': 'nesne', 'z': 'zaman', 'b': 'baglac' }

export function parseMarkedSentence(src: string): BoardToken[] {
  const out: BoardToken[] = []
  const re = /\(([öÖoOfFnNzZbB]) ([^()]*?)\)/g
  let last = 0
  let m: RegExpExecArray | null
  const pushPlain = (s: string) => {
    for (const t of tokenize(s)) {
      if (!t.w && out.length) { out[out.length - 1].p = (out[out.length - 1].p || '') + (t.p || ''); continue }
      out.push(t)
    }
  }
  while ((m = re.exec(src))) {
    if (m.index > last) pushPlain(src.slice(last, m.index))
    const color = MARK[m[1].toLocaleLowerCase('tr-TR')] || null
    for (const t of tokenize(m[2])) out.push({ ...t, c: color })
    last = re.lastIndex
  }
  if (last < src.length) pushPlain(src.slice(last))
  // Kapanış parantezinin hemen ardındaki noktalama (") .") önceki kelimeye yapışsın.
  const merged: BoardToken[] = []
  for (const t of out) {
    if (/^[.,!?;:…]+$/.test(t.w) && merged.length) {
      merged[merged.length - 1].p = (merged[merged.length - 1].p || '') + t.w + (t.p || '')
    } else merged.push(t)
  }
  return merged
}

// Sheets'ten kopyalanan satırlar sekmeyle ayrılır; çok satırlı hücreler
// tırnak içinde gelir.
function parseTSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = String(text || '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') { q = true; continue }
    if (ch === '\t') { row.push(cell); cell = ''; continue }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows
}

export function parseImport(text: string): PlanItemDraft[] {
  const rows = parseTSV(text)
  const items: PlanItemDraft[] = []
  rows.forEach((r, idx) => {
    const soru = (r[0] || '').trim()
    if (!soru) return
    if (idx === 0 && soru.toLocaleLowerCase('tr-TR') === 'soru') return
    items.push({
      id: newId(),
      board: parseMarkedSentence(soru),
      task: (r[1] || '').trim(),
      expected: (r[2] || '').trim(),
      topic: (r[3] || '').trim(),
      teacher_note: (r[4] || '').trim(),
    })
  })
  return items
}

// ─── Saat ───
export function secondsLabel(ms: number | null | undefined): string {
  if (ms == null) return ''
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s} sn`
  return `${Math.floor(s / 60)} dk ${s % 60} sn`
}
