// ─── My Brain: veritabanı kayıtları ───────────────────────────────────────────
// Her öğrencinin beyni veritabanındaki brain_items tablosundadır. Kural:
// beyne YALNIZCA öğretmen kayıt ekler, değiştirir ya da siler; öğrenci yalnızca
// kendi beynini okur (güvenlik kuralları veritabanında).
// Sıra (sort_order) beyindeki yeri belirler: yeni kayıt hep en sona eklenir,
// böylece eski nöronların yeri değişmez. Bir kaydı silmek, ondan sonra
// eklenenlerin yerini kaydırır (Sheets döneminde satır silmek gibi).

import { rest } from './memoryStore'
import { normalizeMemoryDate } from './memoryShared'
import type { MemoryItem, MemStatus, MemType } from './memoryShared'

export interface BrainRow extends MemoryItem {
  id: string
  sort: number
}

export interface BrainPerson {
  id: string
  name: string
  areas: string[]
}

interface DbRow {
  id: string; unit_id: string; item: string; kind: MemType; learned_on: string; status: MemStatus; sort_order: number
}

function toRow(r: DbRow): BrainRow {
  return { id: r.id, sort: r.sort_order, unit: r.unit_id || '', item: r.item, type: r.kind, date: String(r.learned_on).slice(0, 10), status: r.status }
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Bir öğrencinin beyni, beyindeki sırayla.
export async function fetchBrain(studentId: string): Promise<BrainRow[]> {
  const res = await rest(`brain_items?student_id=eq.${encodeURIComponent(studentId)}&select=id,unit_id,item,kind,learned_on,status,sort_order&order=sort_order.asc,created_at.asc&limit=10000`)
  const rows: DbRow[] = await res.json()
  return rows.map(toRow)
}

// Öğretmen için: etkin öğrenci hesapları (beyin listesi ve yönetim ekranı).
export async function listBrainPeople(): Promise<BrainPerson[]> {
  const res = await rest('profiles?role=eq.student&active=eq.true&select=id,display_name,areas&order=display_name.asc')
  const rows: { id: string; display_name: string; areas: string[] | null }[] = await res.json()
  return rows.map(r => ({ id: r.id, name: r.display_name, areas: r.areas || [] }))
}

// Öğretmen: kayıtları öğrencinin beyninin EN SONUNA ekler (verilen sırayla).
export async function addBrainItems(studentId: string, items: MemoryItem[]): Promise<void> {
  if (!items.length) return
  const sid = encodeURIComponent(studentId)
  const last = await (await rest(`brain_items?student_id=eq.${sid}&select=sort_order&order=sort_order.desc&limit=1`)).json() as { sort_order: number }[]
  let next = (last[0]?.sort_order ?? 0) + 1
  const body = items.map(it => ({
    student_id: studentId,
    unit_id: it.unit.trim(),
    item: it.item.trim(),
    kind: it.type,
    learned_on: it.date,
    status: it.status,
    sort_order: next++,
  }))
  for (let i = 0; i < body.length; i += 500) {
    await rest('brain_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body.slice(i, i + 500)) })
  }
}

// Öğretmen: tek kaydı düzeltir (beyindeki sırası değişmez).
export async function updateBrainItem(id: string, it: MemoryItem): Promise<void> {
  await rest(`brain_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ unit_id: it.unit.trim(), item: it.item.trim(), kind: it.type, learned_on: it.date, status: it.status, updated_at: new Date().toISOString() }),
  })
}

// Öğretmen: kayıtları siler.
export async function deleteBrainItems(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const list = ids.slice(i, i + 100).join(',')
    await rest(`brain_items?id=in.(${list})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
}

// ── Sheets'ten yapıştırma ────────────────────────────────────────────────────
// Sütunlar: unit_id, item, type, date, status (eski hafıza tablosunun sırası).
// Başlık satırı da kopyalandıysa sütun sırası önemli olmaz.

// Sheets'ten kopyalanan metin: sekmeyle ayrılmış; birden çok satırlı hücreler tırnak içinde gelir.
function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  let atCellStart = true
  const t = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
      continue
    }
    if (ch === '"' && atCellStart) { q = true; atCellStart = false; continue }
    if (ch === '\t') { row.push(cur); cur = ''; atCellStart = true; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cur); cur = ''; rows.push(row); row = []; atCellStart = true
      continue
    }
    cur += ch
    atCellStart = false
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

const low = (s: string) => s.trim().toLocaleLowerCase('tr-TR')

export function toBrainType(raw: string): MemType | null {
  const s = low(raw)
  if (s === 'word' || s === 'kelime') return 'word'
  if (s === 'structure' || s === 'yapı' || s === 'yapi') return 'structure'
  return null
}

export function toBrainStatus(raw: string): MemStatus | null {
  const s = low(raw)
  if (s === 'known' || s === 'biliyor' || s === 'biliyorum') return 'known'
  if (s === 'learning' || s === 'öğreniyor' || s === 'öğreniyorum' || s === 'ogreniyor') return 'learning'
  if (s === 'fading' || s === 'tekrar' || s === 'tekrar zamanı') return 'fading'
  return null
}

export function parseBrainPaste(text: string): { items: MemoryItem[]; problems: string[] } {
  const rows = parseTsv(text)
  const items: MemoryItem[] = []
  const problems: string[] = []
  if (!rows.length) return { items, problems }
  const head = rows[0].map(low)
  const hasHeader = head.includes('item')
  const pos = (name: string, fallback: number) => {
    if (!hasHeader) return fallback
    const i = head.indexOf(name)
    return i
  }
  const iu = pos('unit_id', 0), ii = pos('item', 1), it = pos('type', 2), idt = pos('date', 3), is = pos('status', 4)
  const body = hasHeader ? rows.slice(1) : rows
  const today = todayIso()
  body.forEach((r, k) => {
    const lineNo = k + 1 + (hasHeader ? 1 : 0)
    const cell = (i: number) => (i >= 0 ? (r[i] ?? '') : '').trim()
    const item = cell(ii)
    if (!item) { problems.push(`${lineNo}. satırda kelime/yapı boş; atlandı.`); return }
    const type = toBrainType(cell(it))
    if (!type) { problems.push(`${lineNo}. satır (${item}): tür "word" ya da "structure" olmalı; atlandı.`); return }
    const status = toBrainStatus(cell(is))
    if (!status) { problems.push(`${lineNo}. satır (${item}): durum "known", "learning" ya da "fading" olmalı; atlandı.`); return }
    const rawDate = cell(idt)
    const date = rawDate ? normalizeMemoryDate(rawDate) : today
    if (!date) { problems.push(`${lineNo}. satır (${item}): tarih 2026-09-15 ya da 15.09.2026 biçiminde olmalı; atlandı.`); return }
    items.push({ unit: cell(iu), item, type, date, status })
  })
  return { items, problems }
}

// ── Excel'e indirme ──────────────────────────────────────────────────────────
// Sütunlar eski hafıza tablosuyla aynı; indirilen satırlar istenirse yeniden yapıştırılabilir.
export async function downloadBrainExcel(studentName: string, rows: MemoryItem[], unitTitles: Record<string, string>): Promise<string> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const head = ['unit_id', 'item', 'type', 'date', 'status', 'Ünite / kitap adı'].map(v => ({ value: v, fontWeight: 'bold' as const }))
  const data: any[][] = [head]
  for (const r of rows) {
    data.push([r.unit || null, r.item, r.type, r.date, r.status, unitTitles[r.unit] && unitTitles[r.unit] !== r.unit ? unitTitles[r.unit] : null])
  }
  const w = (n: number) => ({ width: n })
  const blob: Blob = await (writeExcelFile as any)([
    { data, sheet: 'Beyin', stickyRowsCount: 1, columns: [w(12), w(30), w(11), w(12), w(10), w(30)] },
  ]).toBlob()
  const safe = studentName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'ogrenci'
  const name = `MyBrain_${safe}_${todayIso()}.xlsx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  return name
}
