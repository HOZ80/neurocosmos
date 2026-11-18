// ─── Google tabloları ve altyazılar: önce kayıtlı kopya, sonra taze kopya ─────
// Site her açılışta tabloları (üniteler, dilbilgisi, Drill, sahneler) ve
// altyazıları internetten sıfırdan indiriyordu; öğrenci bu sırada boş ya da
// eski bir liste görüyordu. Artık son indirilen kopya tarayıcıda saklanır:
// sayfa açılınca hemen o gösterilir, arkada taze kopya indirilir, içerik
// değişmişse ekran güncellenir. Taze kopya inemezse kayıtlı kopya kalır.
//
// Saklama yeri tarayıcının Cache Storage alanıdır (localStorage değil; böylece
// Drill/Unutmama gibi kayıtların yerini doldurmaz). Desteklenmeyen tarayıcıda
// her şey eskisi gibi doğrudan internetten gelir.

const SHEET_CACHE = 'nc-sheets-v1'

function hasCacheStorage(): boolean {
  try { return typeof caches !== 'undefined' && !!caches.open } catch { return false }
}

export async function readCachedText(url: string): Promise<string | null> {
  if (!url || !hasCacheStorage()) return null
  try {
    const c = await caches.open(SHEET_CACHE)
    const r = await c.match(url)
    return r ? await r.text() : null
  } catch {
    return null
  }
}

export async function writeCachedText(url: string, text: string): Promise<void> {
  if (!url || !hasCacheStorage()) return
  try {
    const c = await caches.open(SHEET_CACHE)
    await c.put(url, new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
  } catch { /* sessiz: bir sonraki açılışta yine internetten gelir */ }
}

// Taze kopya: tarayıcının kendi önbelleği atlanır (zaman damgası + no-store).
export async function fetchFreshText(url: string): Promise<string> {
  const busted = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
  const res = await fetch(busted, { cache: 'no-store' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.text()
}

// Önce kayıtlı kopyayı (varsa) verir, sonra taze kopyayı (kayıtlıdan farklıysa).
// accept: metin kullanılabilir mi (ör. en az bir satır çıkıyor mu). Kabul
// edilmeyen taze kopya saklanmaz, ekrana da verilmez.
// onSettled: taze kopya denemesi bittiğinde (başarılı ya da değil) bir kez çağrılır.
export function loadCachedThenFresh(
  url: string,
  onText: (text: string) => void,
  opts: { accept?: (text: string) => boolean; onSettled?: () => void } = {},
): () => void {
  let cancelled = false
  let freshShown = false   // taze kopya ekrana verildiyse kayıtlı kopya artık verilmez
  let shown: string | null = null
  const accept = opts.accept ?? (() => true)

  readCachedText(url).then(t => {
    if (cancelled || freshShown || t == null || !accept(t)) return
    shown = t
    onText(t)
  })

  fetchFreshText(url)
    .then(t => {
      if (cancelled || !accept(t)) return
      freshShown = true
      if (t !== shown) onText(t)
      void writeCachedText(url, t)
    })
    .catch(() => { /* kayıtlı kopya (varsa) ekranda kalır */ })
    .finally(() => { if (!cancelled) opts.onSettled?.() })

  return () => { cancelled = true }
}
