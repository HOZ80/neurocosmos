// Unutmama (tekrar) alanı — saf mantık: CSV okuma, aralık takvimi, durum hesabı.
// React'e bağlı değildir; böylece tek başına test edilebilir.

import { normalizeMemoryDate } from './memoryShared'
import type { MemoryItem, MemStatus, MemType } from './memoryShared'

export interface UnutCard {
  id: string
  soru: string      // Türkçe soru (kartta görünür). Birden çok satır olabilir.
  cevap: string     // İngilizce cevap (satırlar \n ile ayrılır)
  alt: string       // kabul edilen alternatifler, " | " ile ayrılmış
  neuron: string    // beyinde görünen ad (Nöron adı sütunu; yoksa Konu)
  type: MemType     // word | structure
  source: string    // Kaynak sütunu (beyinde ünite yerine bu görünür)
  added: string     // YYYY-MM-DD
}

export interface UnutProgress {
  stage: number     // 0..6, STAGES_H dizinindeki geçerli aralık
  last: number      // son tekrar (ms)
  due: number       // sıradaki tekrar (ms)
}
export type UnutProgressMap = Record<string, UnutProgress>
export type UnutResult = 'ok' | 'mid' | 'bad'

// 8 saat → 1 gün → 2 gün → 1 hafta → 2 hafta → 1 ay → 3 ay (drill motoruyla aynı)
export const STAGES_H = [8, 24, 48, 168, 336, 720, 2160]
export const STAGE_LABELS = ['8 saat', '1 gün', '2 gün', '1 hafta', '2 hafta', '1 ay', '3 ay']

const HOUR = 3600000

// ── CSV ──────────────────────────────────────────────────────────────────────
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  const t = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += ch
    } else {
      if (ch === '"') q = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++
        row.push(cur); cur = ''; rows.push(row); row = []
      } else cur += ch
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function findCol(header: string[], match: (h: string) => boolean): number {
  for (let i = 0; i < header.length; i++) if (match(header[i])) return i
  return -1
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toType(raw: string): MemType {
  const s = raw.trim().toLowerCase()
  if (s === 'word' || s === 'kelime') return 'word'
  return 'structure'
}

// Zorunlu sütunlar: ID, Soru…, Cevap…  (başlıklar küçük/büyük harf ve sıraya bağlı değildir)
// İsteğe bağlı: Nöron adı, Tür, Kaynak, Eklenme tarihi, Kabul edilen alternatifler, Konu
export function parseUnutCards(text: string): UnutCard[] {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const h = rows[0].map(x => x.trim().toLowerCase())
  const cId = findCol(h, x => x === 'id')
  const cSoru = findCol(h, x => x.startsWith('soru'))
  const cCevap = findCol(h, x => x.startsWith('cevap'))
  if (cId < 0 || cSoru < 0 || cCevap < 0) return []
  const cAlt = findCol(h, x => x.startsWith('kabul'))
  const cKonu = findCol(h, x => x === 'konu')
  const cNeuron = findCol(h, x => x.startsWith('nöron') || x.startsWith('noron'))
  const cTur = findCol(h, x => x === 'tür' || x === 'tur' || x.startsWith('tür ') || x.startsWith('tur '))
  const cSource = findCol(h, x => x === 'kaynak')
  const cDate = findCol(h, x => x.startsWith('eklenme'))
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  const out: UnutCard[] = []
  const seen = new Set<string>()
  for (const r of rows.slice(1)) {
    const id = get(r, cId)
    const soru = get(r, cSoru)
    const cevap = get(r, cCevap)
    if (!id || !soru || !cevap || seen.has(id)) continue
    seen.add(id)
    const neuron = get(r, cNeuron) || get(r, cKonu) || id
    out.push({
      id, soru, cevap,
      alt: get(r, cAlt),
      neuron,
      type: toType(get(r, cTur)),
      source: get(r, cSource) || 'Unutmama',
      added: normalizeMemoryDate(get(r, cDate)) ?? todayIso(),
    })
  }
  return out
}

// ── Takvim ───────────────────────────────────────────────────────────────────
export function isDue(p: UnutProgress | undefined, nowMs: number): boolean {
  return !p || p.due <= nowMs
}

export function nextProgress(prev: UnutProgress | undefined, result: UnutResult, nowMs: number): UnutProgress {
  let stage = prev ? prev.stage : 0
  if (result === 'ok') stage = Math.min(stage + 1, STAGES_H.length - 1)
  else if (result === 'bad') stage = 0
  return { stage, last: nowMs, due: nowMs + STAGES_H[stage] * HOUR }
}

// Beyin durumu (kart başına):
//  - hiç tekrar edilmemiş            → learning
//  - tekrar zamanı 1 günden fazla geçmiş → fading
//  - aralığı 1 hafta ve üzeri, gecikmemiş → known
//  - diğer                           → learning
export function cardStatus(p: UnutProgress | undefined, nowMs: number): MemStatus {
  if (!p) return 'learning'
  if (nowMs - p.due > 24 * HOUR) return 'fading'
  if (p.stage >= 3) return 'known'
  return 'learning'
}

const RANK: Record<MemStatus, number> = { known: 0, learning: 1, fading: 2 }

// Aynı nöron adını taşıyan kartlar tek nöron olur; durum en zayıf karta göre belirlenir.
// Sıra: nöronun ilk göründüğü satıra göre (beyindeki yerler sabit kalsın diye).
export function buildMemoryItems(cards: UnutCard[], progress: UnutProgressMap, nowMs: number): MemoryItem[] {
  const map = new Map<string, MemoryItem>()
  for (const c of cards) {
    const st = cardStatus(progress[c.id], nowMs)
    const cur = map.get(c.neuron)
    if (!cur) {
      map.set(c.neuron, { unit: c.source, item: c.neuron, type: c.type, date: c.added, status: st })
    } else {
      if (RANK[st] > RANK[cur.status]) cur.status = st
      if (c.added < cur.date) cur.date = c.added
    }
  }
  return Array.from(map.values())
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  const m = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
