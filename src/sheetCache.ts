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

// ── Arka plandan dönünce tazeleme ───────────────────────────────────────────
// Telefonda site sekmede ya da yüklü uygulamada günlerce açık kalabiliyor;
// sayfa yeniden açılmadığı için tabloların taze hali hiç inmiyordu (öğretmen
// tabloda bir şey değiştirse öğrenci sayfayı yenilemeden göremiyordu). Artık
// sayfa 10 dakikadan uzun arka planda kaldıktan sonra öne gelince, bu dosyayla
// yüklenen bütün tablolar yeniden taze indirilir; içerik değiştiyse ekran
// güncellenir. Taze kopya inmezse ekrandaki hal kalır.
const REFRESH_AFTER_MS = 10 * 60 * 1000

interface Loader {
  url: string
  onText: (text: string) => void
  accept: (text: string) => boolean
  last: string | null      // ekrana en son verilen metin
}
const loaders = new Set<Loader>()
let hiddenAt = 0
let watching = false

function refreshAll() {
  loaders.forEach(l => {
    fetchFreshText(l.url)
      .then(t => {
        if (!loaders.has(l) || !l.accept(t)) return
        if (t !== l.last) { l.last = t; l.onText(t) }
        void writeCachedText(l.url, t)
      })
      .catch(() => { /* ekrandaki hal kalır */ })
  })
}

function watchVisibility() {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    const away = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    if (away >= REFRESH_AFTER_MS) refreshAll()
  })
}

// Önce kayıtlı kopyayı (varsa) verir, sonra taze kopyayı (kayıtlıdan farklıysa).
// accept: metin kullanılabilir mi (ör. en az bir satır çıkıyor mu). Kabul
// edilmeyen taze kopya saklanmaz, ekrana da verilmez.
// onSettled: taze kopya denemesi bittiğinde (başarılı ya da değil) bir kez çağrılır.
// Yükleme iptal edilene kadar, sayfa uzun süre arka planda kalıp öne gelince
// yeniden tazelenir (yukarıda).
export function loadCachedThenFresh(
  url: string,
  onText: (text: string) => void,
  opts: { accept?: (text: string) => boolean; onSettled?: () => void } = {},
): () => void {
  let cancelled = false
  let freshShown = false   // taze kopya ekrana verildiyse kayıtlı kopya artık verilmez
  const accept = opts.accept ?? (() => true)
  const loader: Loader = { url, onText, accept, last: null }
  loaders.add(loader)
  watchVisibility()

  readCachedText(url).then(t => {
    if (cancelled || freshShown || t == null || !accept(t)) return
    loader.last = t
    onText(t)
  })

  fetchFreshText(url)
    .then(t => {
      if (cancelled || !accept(t)) return
      freshShown = true
      if (t !== loader.last) { loader.last = t; onText(t) }
      void writeCachedText(url, t)
    })
    .catch(() => { /* kayıtlı kopya (varsa) ekranda kalır */ })
    .finally(() => { if (!cancelled) opts.onSettled?.() })

  return () => { cancelled = true; loaders.delete(loader) }
}
