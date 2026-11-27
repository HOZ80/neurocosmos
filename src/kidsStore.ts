// ─── Çocuk paneli: durak ve ödül kayıtları (veritabanı: kids_progress) ────────
// Her satır: çocuk + ünite + adım. Adımlar: grammar, listen, dictation,
// shadowing, drill (durak bitti) ve "kutlama" (ünite kutlaması görüldü).
// Ödüller bu satırlardan hesaplanır, ayrıca saklanmaz: her durağın ilk
// bitişi bir ödüldür. Aynı durak tekrar oynanınca yeni satır yazılmaz.
// Çocuk yalnızca kendi satırını yazar/okur; öğretmen hepsini görür (veritabanı
// kuralı). İnternet yoksa kayıt cihazda bekler, sonraki açılışta gönderilir.
// Öğretmen paneli önizlerken (persist kapalı) hiçbir şey yazılmaz.

import { rest } from './memoryStore'

export interface KidsStepRow { unit_id: string; step: string; done_at: string }

const pendKey = (uid: string) => `nc_kids_pending_${uid}`
const cacheKey = (uid: string) => `nc_kids_cache_${uid}`

function lsGet<T>(k: string, fb: T): T {
  try {
    const raw = localStorage.getItem(k)
    if (raw == null) return fb
    const v = JSON.parse(raw)
    return v == null ? fb : (v as T)
  } catch { return fb }
}
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sessiz */ } }

export const stepKey = (unit: string, step: string) => `${unit}|${step}`

// Cihazdaki son bilinen kayıtlar + gönderilmeyi bekleyenler (anında açılış için)
export function readKidsLocal(uid: string): KidsStepRow[] {
  const a = lsGet<KidsStepRow[]>(cacheKey(uid), [])
  const p = lsGet<KidsStepRow[]>(pendKey(uid), [])
  return [...a, ...p]
}

async function sendRows(rows: KidsStepRow[]): Promise<void> {
  if (rows.length === 0) return
  await rest('kids_progress?on_conflict=student_id,unit_id,step', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows.map(r => ({ unit_id: r.unit_id, step: r.step, done_at: r.done_at }))),
  })
}

// Bekleyenleri gönderir, sonra tüm kayıtları okur
export async function loadKidsProgress(uid: string): Promise<KidsStepRow[]> {
  const pend = lsGet<KidsStepRow[]>(pendKey(uid), [])
  if (pend.length > 0) {
    try { await sendRows(pend); lsSet(pendKey(uid), []) } catch { /* sonra yeniden */ }
  }
  const res = await rest(`kids_progress?student_id=eq.${encodeURIComponent(uid)}&select=unit_id,step,done_at&limit=5000`)
  const rows = (await res.json()) as KidsStepRow[]
  lsSet(cacheKey(uid), rows)
  return [...rows, ...lsGet<KidsStepRow[]>(pendKey(uid), [])]
}

export async function saveKidsStep(uid: string, unit: string, step: string): Promise<void> {
  const row: KidsStepRow = { unit_id: unit, step, done_at: new Date().toISOString() }
  try {
    await sendRows([row])
    lsSet(cacheKey(uid), [...lsGet<KidsStepRow[]>(cacheKey(uid), []), row])
  } catch {
    const p = lsGet<KidsStepRow[]>(pendKey(uid), [])
    if (!p.some(x => x.unit_id === unit && x.step === step)) lsSet(pendKey(uid), [...p, row])
  }
}
