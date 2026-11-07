// ─── Unutmama ve Drill: veritabanı kayıtları ──────────────────────────────────
// Kartlar, kart atamaları, kart ilerlemesi, Drill ilerlemesi ve Drill'e elle
// eklenen konular veritabanında durur. Bu dosya:
//  - giriş yapmış hesabın kendi kayıtlarını okur/yazar,
//  - her yazmayı önce tarayıcıdaki "bekleyenler" listesine koyar, internet
//    varsa hemen gönderir; internet yoksa ya da gönderim başarısızsa liste
//    kalır ve bağlantı gelince yeniden gönderilir (çalışma kaybolmaz),
//  - tarayıcıda hesap başına bir kopya tutar (açılışta beklemeden görünsün,
//    internet yokken de çalışsın).
// Aynı kart ya da konu iki cihazda farklı çalışıldıysa en son çalışılan
// geçerli; bu kural veritabanındaki kaydetme işlevlerindedir.
// Güvenlik kuralları veritabanındadır: öğrenci yalnızca kendisine atanmış
// kartları ve kendi kayıtlarını görür; kart ve atamaları yalnızca öğretmen
// değiştirir.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, getAccessToken, getCachedAccount } from './auth'
import type { UnutCard, UnutProgress, UnutProgressMap, UnutResult } from './unutmamaLogic'
import type { MemType } from './memoryShared'

// ── Ortak ────────────────────────────────────────────────────────────────────
export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('oturum yok')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    let msg = ''
    try { const d = await res.json(); msg = String(d?.message || d?.hint || '') } catch { /* boş */ }
    throw new Error(`kayıt hatası ${res.status}${msg ? ': ' + msg : ''}`)
  }
  return res
}

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) })
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

function lsGet<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k)
    if (raw == null) return fallback
    const v = JSON.parse(raw)
    return v == null ? fallback : (v as T)
  } catch { return fallback }
}
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sessiz */ } }

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export function currentAccountId(): string | null {
  return getCachedAccount()?.id ?? null
}

// ══════════════════════════════════════════════════════════════════════════════
// UNUTMAMA
// ══════════════════════════════════════════════════════════════════════════════

export interface UnutPendingRow { card_id: string; stage: number; last: number; due: number; result: UnutResult | null }

const unutKeys = (uid: string) => ({
  cards: `nc_unut_cards_${uid}`,
  progress: `nc_unut_progress_${uid}`,
  pending: `nc_unut_pending_${uid}`,
})

// Eski (tarayıcıda tutulan) Unutmama ilerlemesi. Silinmez; yedek olarak kalır.
export const LEGACY_UNUT_PROGRESS_KEY = 'nc_unutmama_progress_v1'
const LEGACY_UNUT_DONE_KEY = 'nc_unutmama_migrated_v1'

export function readUnutCache(uid: string): { cards: UnutCard[] | null; progress: UnutProgressMap } {
  const k = unutKeys(uid)
  const cards = lsGet<UnutCard[] | null>(k.cards, null)
  return { cards: Array.isArray(cards) ? cards : null, progress: lsGet<UnutProgressMap>(k.progress, {}) }
}

export function writeUnutCache(uid: string, cards: UnutCard[] | null, progress: UnutProgressMap) {
  const k = unutKeys(uid)
  if (cards) lsSet(k.cards, cards)
  lsSet(k.progress, progress)
}

export function readUnutPending(uid: string): UnutPendingRow[] {
  const v = lsGet<UnutPendingRow[]>(unutKeys(uid).pending, [])
  return Array.isArray(v) ? v : []
}

export function addUnutPending(uid: string, rows: UnutPendingRow[]) {
  if (!rows.length) return
  lsSet(unutKeys(uid).pending, [...readUnutPending(uid), ...rows])
}

function toType(raw: string): MemType {
  const s = String(raw || '').trim().toLowerCase()
  return s === 'word' || s === 'kelime' ? 'word' : 'structure'
}

interface MyCardRow {
  id: string; question: string; answer: string; alternatives: string; topic: string
  neuron: string; kind: string; source: string; added_on: string; sort_order: number
}

export async function fetchMyCards(): Promise<UnutCard[]> {
  const rows = await rpc<MyCardRow[]>('my_memory_cards', {})
  return (rows || []).map(r => ({
    id: r.id,
    soru: r.question,
    cevap: r.answer,
    alt: r.alternatives || '',
    neuron: (r.neuron || '').trim() || (r.topic || '').trim() || r.id,
    type: toType(r.kind),
    source: (r.source || '').trim() || 'Unutmama',
    added: String(r.added_on || '').slice(0, 10),
  }))
}

export async function fetchMyCardProgress(uid: string): Promise<UnutProgressMap> {
  const res = await rest(`memory_card_progress?student_id=eq.${encodeURIComponent(uid)}&select=card_id,stage,last_at,due_at&limit=10000`)
  const rows: { card_id: string; stage: number; last_at: string; due_at: string }[] = await res.json()
  const out: UnutProgressMap = {}
  for (const r of rows) {
    const last = toMs(r.last_at), due = toMs(r.due_at)
    if (last == null || due == null) continue
    out[r.card_id] = { stage: r.stage, last, due }
  }
  return out
}

// İki ilerleme kaydından en son çalışılanı seçer.
export function mergeUnutProgress(base: UnutProgressMap, over: UnutProgressMap): UnutProgressMap {
  const out: UnutProgressMap = { ...base }
  for (const [id, p] of Object.entries(over)) {
    const cur = out[id]
    if (!cur || p.last >= cur.last) out[id] = p
  }
  return out
}

export function pendingAsProgress(rows: UnutPendingRow[]): UnutProgressMap {
  const out: UnutProgressMap = {}
  for (const r of rows) {
    const cur = out[r.card_id]
    if (!cur || r.last >= cur.last) out[r.card_id] = { stage: r.stage, last: r.last, due: r.due }
  }
  return out
}

// Bekleyenleri gönderir. Başarılıysa gönderilenleri listeden çıkarır.
const unutFlushing = new Set<string>()
export async function flushUnutPending(uid: string): Promise<boolean> {
  if (unutFlushing.has(uid)) return false
  const rows = readUnutPending(uid)
  if (!rows.length) return true
  unutFlushing.add(uid)
  try {
    await rpc<number>('memory_progress_save', { p_rows: rows })
    // Gönderim sırasında yeni satır eklenmiş olabilir: yalnızca gönderilenleri çıkar.
    const now = readUnutPending(uid)
    lsSet(unutKeys(uid).pending, now.slice(rows.length))
    return true
  } catch {
    return false
  } finally {
    unutFlushing.delete(uid)
  }
}

// Eski tarayıcı kaydını bir kereye mahsus bekleyenlere ekler (yalnızca bu
// hesaba atanmış kartlar için). Gönderim başarılı olunca bir daha yapılmaz.
export function legacyUnutRows(cards: UnutCard[]): UnutPendingRow[] {
  try { if (localStorage.getItem(LEGACY_UNUT_DONE_KEY)) return [] } catch { return [] }
  const legacy = lsGet<Record<string, UnutProgress>>(LEGACY_UNUT_PROGRESS_KEY, {})
  const ids = new Set(cards.map(c => c.id))
  const rows: UnutPendingRow[] = []
  for (const [id, p] of Object.entries(legacy)) {
    if (!ids.has(id) || !p || typeof p.last !== 'number' || typeof p.due !== 'number') continue
    rows.push({ card_id: id, stage: Math.max(0, Math.min(6, p.stage | 0)), last: p.last, due: p.due, result: null })
  }
  return rows
}
export function markLegacyUnutDone(uid: string) {
  try { localStorage.setItem(LEGACY_UNUT_DONE_KEY, uid) } catch { /* sessiz */ }
}
export function legacyUnutPendingDone(): boolean {
  try { return !!localStorage.getItem(LEGACY_UNUT_DONE_KEY) } catch { return true }
}

// ══════════════════════════════════════════════════════════════════════════════
// DRILL
// ══════════════════════════════════════════════════════════════════════════════
// Yerel biçim eskisiyle aynı: konu id → { reviewStage, nextReview }.
// "Son çalışma" zamanı bu ikisinden hesaplanır (nextReview = çalışma anı + aralık).

export interface DrillProg { reviewStage: number; nextReview: number | null }
export type DrillProgMap = Record<string, DrillProg>

const DRILL_STAGE_MS = [8, 24, 48, 168, 336, 720, 2160].map(h => h * 3600 * 1000)

export function drillLastMs(p: DrillProg | undefined): number {
  if (!p || p.nextReview == null || p.reviewStage < 0) return 0
  return p.nextReview - (DRILL_STAGE_MS[Math.min(p.reviewStage, 6)] ?? 0)
}

interface DrillPendingRow { unit_key: string; topic_id: string; review_stage: number; next_review: number | null; last: number }
interface DrillTopicsLocal { saved: number; topics: unknown[] }

const drillKeys = (uid: string) => ({
  progress: (unit: string) => `nc_drill2_progress_${uid}_u${unit}`,
  topics: (unit: string) => `nc_drill2_topics_${uid}_u${unit}`,
  pending: `nc_drill2_pending_${uid}`,
  tpending: `nc_drill2_tpending_${uid}`,
})

// Eski (cihaz başına) anahtarlar. Silinmez; yedek olarak kalır.
const LEGACY_DRILL_DONE_KEY = 'nc_drill_migrated_v1'
const legacyProgressKey = (unit: string) => `nc_drill_progress_u${unit}`
const legacyTopicsKey = (unit: string) => `nc_drill_topics_u${unit}`

export function loadDrillProgressLocal(unit: string): DrillProgMap {
  const uid = currentAccountId()
  if (!uid) return lsGet<DrillProgMap>(legacyProgressKey(unit), {})
  return lsGet<DrillProgMap>(drillKeys(uid).progress(unit), {})
}

export function loadDrillTopicsLocal(unit: string): unknown[] {
  const uid = currentAccountId()
  if (!uid) return lsGet<unknown[]>(legacyTopicsKey(unit), [])
  const v = lsGet<DrillTopicsLocal | null>(drillKeys(uid).topics(unit), null)
  return v && Array.isArray(v.topics) ? v.topics : []
}

function readDrillPending(uid: string): DrillPendingRow[] {
  const v = lsGet<DrillPendingRow[]>(drillKeys(uid).pending, [])
  return Array.isArray(v) ? v : []
}
function readDrillTopicsPending(uid: string): Record<string, DrillTopicsLocal> {
  const v = lsGet<Record<string, DrillTopicsLocal>>(drillKeys(uid).tpending, {})
  return v && typeof v === 'object' ? v : {}
}

// Ünitenin ilerlemesini kaydeder; değişen konular veritabanına gönderilmek üzere sıraya girer.
export function saveDrillProgressLocal(unit: string, map: DrillProgMap) {
  const uid = currentAccountId()
  if (!uid) { lsSet(legacyProgressKey(unit), map); return }
  const k = drillKeys(uid)
  const prev = lsGet<DrillProgMap>(k.progress(unit), {})
  lsSet(k.progress(unit), map)
  const rows: DrillPendingRow[] = []
  for (const [topicId, p] of Object.entries(map)) {
    const o = prev[topicId]
    if (o && o.reviewStage === p.reviewStage && o.nextReview === p.nextReview) continue
    rows.push({ unit_key: unit, topic_id: topicId, review_stage: p.reviewStage, next_review: p.nextReview, last: drillLastMs(p) || Date.now() })
  }
  if (rows.length) {
    lsSet(k.pending, [...readDrillPending(uid), ...rows])
    void flushDrillPending()
  }
}

// Konu listesini kaydeder. sync=false: yalnızca bu tarayıcıda (ör. ilk açılıştaki
// örnek konu; başka cihazdaki gerçek listenin üstüne yazmasın diye gönderilmez).
export function saveDrillTopicsLocal(unit: string, topics: unknown[], sync = true) {
  const uid = currentAccountId()
  if (!uid) { lsSet(legacyTopicsKey(unit), topics); return }
  const k = drillKeys(uid)
  const entry: DrillTopicsLocal = { saved: sync ? Date.now() : 0, topics }
  lsSet(k.topics(unit), entry)
  if (sync) {
    lsSet(k.tpending, { ...readDrillTopicsPending(uid), [unit]: entry })
    void flushDrillPending()
  }
}

let drillFlushing = false
export async function flushDrillPending(): Promise<boolean> {
  const uid = currentAccountId()
  if (!uid || drillFlushing) return false
  drillFlushing = true
  try {
    const k = drillKeys(uid)
    const rows = readDrillPending(uid)
    if (rows.length) {
      await rpc<number>('drill_progress_save', { p_rows: rows })
      lsSet(k.pending, readDrillPending(uid).slice(rows.length))
    }
    const tp = readDrillTopicsPending(uid)
    for (const [unit, entry] of Object.entries(tp)) {
      await rpc<boolean>('drill_topics_save', { p_unit_key: unit, p_topics: entry.topics, p_saved: entry.saved })
      const now = readDrillTopicsPending(uid)
      if (now[unit] && now[unit].saved === entry.saved) {
        delete now[unit]
        lsSet(k.tpending, now)
      }
    }
    return true
  } catch {
    return false
  } finally {
    drillFlushing = false
  }
}

// Bir kereye mahsus: bu tarayıcıdaki eski (cihaz başına) Drill kayıtlarını
// giriş yapmış hesaba aktarır. Eski anahtarlar yedek olarak kalır.
export async function migrateLegacyDrill(): Promise<void> {
  const uid = currentAccountId()
  if (!uid) return
  try { if (localStorage.getItem(LEGACY_DRILL_DONE_KEY)) return } catch { return }
  const k = drillKeys(uid)
  const progUnits: string[] = []
  const topicUnits: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || ''
      let m = /^nc_drill_progress_u(.+)$/.exec(key)
      if (m) progUnits.push(m[1])
      m = /^nc_drill_topics_u(.+)$/.exec(key)
      if (m) topicUnits.push(m[1])
    }
  } catch { return }

  const rows: DrillPendingRow[] = []
  for (const unit of progUnits) {
    const legacy = lsGet<DrillProgMap>(legacyProgressKey(unit), {})
    const mine = lsGet<DrillProgMap>(k.progress(unit), {})
    const merged: DrillProgMap = { ...legacy }
    for (const [t, p] of Object.entries(mine)) if (!merged[t] || drillLastMs(p) >= drillLastMs(merged[t])) merged[t] = p
    lsSet(k.progress(unit), merged)
    for (const [t, p] of Object.entries(legacy)) {
      if (!p || typeof p.reviewStage !== 'number') continue
      rows.push({ unit_key: unit, topic_id: t, review_stage: p.reviewStage, next_review: p.nextReview ?? null, last: drillLastMs(p) })
    }
  }
  const tp = readDrillTopicsPending(uid)
  for (const unit of topicUnits) {
    const legacy = lsGet<unknown[]>(legacyTopicsKey(unit), [])
    if (!Array.isArray(legacy) || !legacy.length) continue
    const mine = lsGet<DrillTopicsLocal | null>(k.topics(unit), null)
    // saved=0: yalnızca bu tarayıcıda oluşmuş örnek konu; eski gerçek liste onun yerine geçer.
    if (!mine || !mine.topics.length || mine.saved === 0) {
      // Eski listenin kaydedilme zamanı bilinmiyor: 1 ms verilir; başka bir
      // cihazda daha önce kaydedilmiş gerçek bir listenin üstüne yazmaz.
      const entry: DrillTopicsLocal = { saved: 1, topics: legacy }
      lsSet(k.topics(unit), entry)
      tp[unit] = entry
    }
  }
  lsSet(k.tpending, tp)
  if (rows.length) lsSet(k.pending, [...readDrillPending(uid), ...rows])
  try { localStorage.setItem(LEGACY_DRILL_DONE_KEY, uid) } catch { /* sessiz */ }
  await flushDrillPending()
}

// Ünitenin veritabanındaki kayıtlarını okur, tarayıcıdakiyle birleştirir
// (her konuda en son çalışılan geçerli) ve tarayıcı kopyasını günceller.
export async function syncDrillUnit(unit: string): Promise<{ progress: DrillProgMap; topics: unknown[] | null } | null> {
  const uid = currentAccountId()
  if (!uid) return null
  await flushDrillPending()
  const sid = encodeURIComponent(uid)
  const u = encodeURIComponent(unit)
  const [pr, tr] = await Promise.all([
    rest(`drill_progress?student_id=eq.${sid}&unit_key=eq.${u}&select=topic_id,review_stage,next_review,last_at&limit=5000`),
    rest(`drill_custom_topics?student_id=eq.${sid}&unit_key=eq.${u}&select=topics,saved_at`),
  ])
  const prow: { topic_id: string; review_stage: number; next_review: string | null; last_at: string }[] = await pr.json()
  const trow: { topics: unknown[]; saved_at: string }[] = await tr.json()
  const k = drillKeys(uid)

  const local = lsGet<DrillProgMap>(k.progress(unit), {})
  const merged: DrillProgMap = { ...local }
  for (const r of prow) {
    const p: DrillProg = { reviewStage: r.review_stage, nextReview: toMs(r.next_review) }
    const serverLast = toMs(r.last_at) ?? 0
    const cur = merged[r.topic_id]
    if (!cur || serverLast > drillLastMs(cur)) merged[r.topic_id] = p
  }
  lsSet(k.progress(unit), merged)

  let localT = lsGet<DrillTopicsLocal | null>(k.topics(unit), null)
  const serverT = trow[0]
  if (serverT && Array.isArray(serverT.topics)) {
    const serverSaved = toMs(serverT.saved_at) ?? 0
    if (!localT || serverSaved > localT.saved) {
      localT = { saved: serverSaved, topics: serverT.topics }
      lsSet(k.topics(unit), localT)
    }
  }
  // Konu listesi: bu hesabın en güncel listesi (yoksa null).
  return { progress: merged, topics: localT ? localT.topics : null }
}

// ══════════════════════════════════════════════════════════════════════════════
// ÖĞRETMEN: kart bankası ve atamalar (yalnızca öğretmen hesabında çalışır)
// ══════════════════════════════════════════════════════════════════════════════

export interface BankCard {
  id: string
  card_type: string
  topic: string
  source_item_no: string
  source: string
  question: string
  answer: string
  alternatives: string
  note: string
  added_on: string
  neuron: string
  kind: 'word' | 'structure'
  extra: Record<string, string>
  sort_order: number
}

export interface BankAssignment { student_id: string; card_id: string }
export interface BankProgress {
  student_id: string; card_id: string; stage: number; last_at: string; due_at: string
  review_count: number; ok_count: number; mid_count: number; bad_count: number; last_result: UnutResult | null
}
export interface BankPerson { id: string; display_name: string; role: 'student' | 'teacher'; areas: string[] }

const CARD_COLS = 'id,card_type,topic,source_item_no,source,question,answer,alternatives,note,added_on,neuron,kind,extra,sort_order'

export async function bankLoadAll(): Promise<{ cards: BankCard[]; assignments: BankAssignment[]; progress: BankProgress[]; people: BankPerson[] }> {
  const [c, a, p, pe] = await Promise.all([
    rest(`memory_cards?select=${CARD_COLS}&order=sort_order.asc,id.asc&limit=10000`),
    rest('memory_card_assignments?select=student_id,card_id&limit=50000'),
    rest('memory_card_progress?select=student_id,card_id,stage,last_at,due_at,review_count,ok_count,mid_count,bad_count,last_result&limit=50000'),
    rest('profiles?active=eq.true&select=id,display_name,role,areas&order=display_name.asc'),
  ])
  return { cards: await c.json(), assignments: await a.json(), progress: await p.json(), people: await pe.json() }
}

export async function bankUpsertCards(cards: BankCard[]): Promise<void> {
  for (let i = 0; i < cards.length; i += 200) {
    await rest('memory_cards?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(cards.slice(i, i + 200).map(c => ({ ...c, updated_at: new Date().toISOString() }))),
    })
  }
}

export async function bankRenameCard(oldId: string, card: BankCard): Promise<void> {
  await rest(`memory_cards?id=eq.${encodeURIComponent(oldId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...card, updated_at: new Date().toISOString() }),
  })
}

// PostgREST "in" süzgeci için: her değer çift tırnak içinde, içindeki tırnak ve ters bölü kaçışlı.
function quotedList(ids: string[]): string {
  return ids.map(id => '"' + id.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')
}

export async function bankDeleteCards(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const list = quotedList(ids.slice(i, i + 100))
    await rest(`memory_cards?id=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
}

export async function bankAssign(studentId: string, cardIds: string[]): Promise<void> {
  for (let i = 0; i < cardIds.length; i += 500) {
    await rest('memory_card_assignments?on_conflict=student_id,card_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(cardIds.slice(i, i + 500).map(card_id => ({ student_id: studentId, card_id }))),
    })
  }
}

export async function bankUnassign(studentId: string, cardIds: string[]): Promise<void> {
  for (let i = 0; i < cardIds.length; i += 100) {
    const list = quotedList(cardIds.slice(i, i + 100))
    await rest(`memory_card_assignments?student_id=eq.${encodeURIComponent(studentId)}&card_id=in.(${encodeURIComponent(list)})`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    })
  }
}
