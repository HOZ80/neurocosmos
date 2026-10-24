// ─── Giriş sistemi (Supabase) ─────────────────────────────────────────────────
// Ek paket kullanmadan, Supabase'in giriş servisine doğrudan bağlanır.
//
// Buradaki anahtar Supabase'in "herkese açık" (publishable) anahtarıdır.
// Tarayıcıda görünmesi için tasarlanmıştır; asıl koruma veritabanındaki
// kurallardadır (öğrenci yalnızca kendi satırlarını görür vb.).
// GİZLİ anahtar bu dosyada YOKTUR ve hiçbir zaman olmamalıdır — o yalnızca
// Netlify'ın ortam değişkenlerinde durur.

export const SUPABASE_URL = 'https://enacdiolibbxakxoslla.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dx8Rx1zdfhvhg6G0TEZUHQ_JSQg-Z-Q'

// Giriş adı arka planda bu alan adıyla e-postaya çevrilir.
const LOGIN_DOMAIN = 'giris.neurocosmos.tr'

// Telefonda kalıcı oturum (çıkış yapılana kadar).
const SESSION_KEY = 'nc_auth_session'

export type AreaId = 'A1' | 'A2' | 'child_omur' | 'child_oztug' | 'owner'

export interface Account {
  id: string
  loginName: string
  displayName: string
  role: 'student' | 'teacher'
  areas: AreaId[]
  active: boolean
}

interface StoredSession {
  accessToken: string
  refreshToken: string
  expiresAt: number // saniye cinsinden (Unix)
  account: Account | null
}

export class AuthError extends Error {
  kind: 'credentials' | 'banned' | 'inactive' | 'network' | 'expired' | 'other'
  constructor(kind: AuthError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

// Ekranda yazılan giriş adını sadeleştirir: boşlukları atar, küçük harfe
// çevirir, Türkçe harfleri karşılığına çevirir (Ömür → omur).
export function normalizeLoginName(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, '')
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || typeof s.accessToken !== 'string' || typeof s.refreshToken !== 'string') return null
    return s as StoredSession
  } catch { return null }
}

function writeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {}
}

export function getCachedAccount(): Account | null {
  return readSession()?.account ?? null
}

async function tokenRequest(grant: 'password' | 'refresh_token', body: Record<string, string>) {
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthError('network', 'İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.')
  }
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = String(data?.error_code || data?.code || data?.error || '')
    const msg = String(data?.msg || data?.message || data?.error_description || '')
    if (code === 'user_banned' || /banned/i.test(msg)) {
      throw new AuthError('banned', 'Bu hesap şu an kapalı. Öğretmeninle konuş.')
    }
    if (grant === 'password') {
      throw new AuthError('credentials', 'Giriş adı ya da şifre yanlış.')
    }
    throw new AuthError('expired', 'Oturumun sona erdi, lütfen yeniden giriş yap.')
  }
  return data as { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number }
}

function toSession(t: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number }, account: Account | null): StoredSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: t.expires_at ?? now + (t.expires_in ?? 3600),
    account,
  }
}

async function fetchAccount(accessToken: string, userId: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,login_name,display_name,role,areas,active`,
      { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }, cache: 'no-store' },
    )
  } catch {
    throw new AuthError('network', 'İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.')
  }
  if (res.status === 401) throw new AuthError('expired', 'Oturumun sona erdi, lütfen yeniden giriş yap.')
  const rows: any = await res.json().catch(() => null)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!res.ok || !row) throw new AuthError('other', 'Hesap bilgisi okunamadı. Öğretmeninle konuş.')
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name || row.login_name,
    role: row.role === 'teacher' ? 'teacher' : 'student',
    areas: Array.isArray(row.areas) ? row.areas : [],
    active: row.active !== false,
  }
}

function userIdFromToken(token: string): string {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(decodeURIComponent(escape(atob(part))))
    return String(json.sub || '')
  } catch { return '' }
}

// Giriş adı + şifre ile giriş. Başarılıysa hesap bilgisini döndürür.
export async function signIn(loginNameRaw: string, password: string): Promise<Account> {
  const loginName = normalizeLoginName(loginNameRaw)
  if (!loginName || !password) throw new AuthError('credentials', 'Giriş adını ve şifreni yaz.')
  const t = await tokenRequest('password', { email: `${loginName}@${LOGIN_DOMAIN}`, password })
  const account = await fetchAccount(t.access_token, userIdFromToken(t.access_token))
  if (!account.active) {
    await signOut(t.access_token)
    throw new AuthError('inactive', 'Bu hesap şu an kapalı. Öğretmeninle konuş.')
  }
  writeSession(toSession(t, account))
  return account
}

// Geçerli bir giriş anahtarı döndürür; süresi dolmak üzereyse yeniler.
// Oturum yoksa ya da yenilenemiyorsa null döner.
let refreshing: Promise<StoredSession | null> | null = null
export async function getAccessToken(): Promise<string | null> {
  const s = readSession()
  if (!s) return null
  const now = Math.floor(Date.now() / 1000)
  if (s.expiresAt - now > 60) return s.accessToken
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const t = await tokenRequest('refresh_token', { refresh_token: s.refreshToken })
        const fresh = toSession(t, s.account)
        writeSession(fresh)
        return fresh
      } catch (e) {
        if (e instanceof AuthError && e.kind !== 'network') writeSession(null)
        throw e
      } finally {
        refreshing = null
      }
    })()
  }
  const fresh = await refreshing
  return fresh ? fresh.accessToken : null
}

// Site açılınca çağrılır: kayıtlı oturumu doğrular ve güncel hesap bilgisini
// getirir. İnternet yoksa telefonda kayıtlı son hesap bilgisiyle devam eder.
export async function restoreSession(): Promise<Account | null> {
  const s = readSession()
  if (!s) return null
  try {
    const token = await getAccessToken()
    if (!token) return null
    const account = await fetchAccount(token, userIdFromToken(token))
    if (!account.active) {
      await signOut()
      return null
    }
    const latest = readSession()
    if (latest) writeSession({ ...latest, account })
    return account
  } catch (e) {
    if (e instanceof AuthError && e.kind === 'network') return s.account
    writeSession(null)
    return null
  }
}

export async function signOut(tokenOverride?: string) {
  const token = tokenOverride ?? readSession()?.accessToken
  writeSession(null)
  if (!token) return
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    })
  } catch {}
}

// Hangi kartın bu hesaba açık olduğu. Öğretmen her şeye erişir.
export function canUseArea(account: Account | null, area: AreaId): boolean {
  if (!account || !account.active) return false
  if (account.role === 'teacher') return true
  return account.areas.includes(area)
}
