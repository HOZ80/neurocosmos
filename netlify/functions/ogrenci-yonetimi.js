// netlify/functions/ogrenci-yonetimi.js
//
// Öğretmen panelinin "Öğrenciler" bölümü bu görevi çağırır.
// Hesap açmak, şifre değiştirmek ve hesabı kapatmak yönetici yetkisi ister;
// bu yüzden bu işler sitenin kendisinde değil burada yapılır.
//
// GİZLİ ANAHTAR: yalnızca Netlify ortam değişkeninde durur:
//     SUPABASE_SECRET_KEY   (Supabase > Settings > API Keys > Secret keys)
// Bu dosyada, sitenin kodunda ya da GitHub'da hiçbir yerde yazılı değildir.
//
// GÜVENLİK: Her istekte önce çağıranın giriş anahtarı Supabase'e sorulur.
// Çağıran aktif bir öğretmen değilse hiçbir şey yapılmadan reddedilir.
// Öğretmen hesapları bu görevle değiştirilemez (yalnızca öğrenciler).

const SUPABASE_URL = 'https://enacdiolibbxakxoslla.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_dx8Rx1zdfhvhg6G0TEZUHQ_JSQg-Z-Q'
const LOGIN_DOMAIN = 'giris.neurocosmos.tr'

const STUDENT_AREAS = ['A1', 'A2', 'child_omur', 'child_oztug']
const BAN_FOREVER = '876000h' // ~100 yıl: hesap kapalı
const LOGIN_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,29}$/

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  }
}

function secretHeaders(secret, extra) {
  const h = { apikey: secret, 'Content-Type': 'application/json', ...(extra || {}) }
  // Eski tip (JWT) anahtar girilmişse onu da Authorization'a koy.
  // Yeni tip (sb_secret_...) anahtar yalnızca apikey başlığında gönderilir.
  if (secret.startsWith('eyJ')) h.Authorization = `Bearer ${secret}`
  return h
}

function normalizeLoginName(raw) {
  return String(raw || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/\s+/g, '')
}

function cleanAreas(list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const a of list) {
    if (!STUDENT_AREAS.includes(a)) return null
    if (!out.includes(a)) out.push(a)
  }
  return out
}

async function readJson(res) {
  try { return await res.json() } catch { return null }
}

// Çağıran kim? Aktif öğretmen değilse null.
async function verifyTeacher(userToken, secret) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${userToken}` },
  })
  if (!userRes.ok) return null
  const user = await readJson(userRes)
  if (!user || !user.id) return null

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active`,
    { headers: secretHeaders(secret) },
  )
  if (!profRes.ok) return null
  const rows = await readJson(profRes)
  const p = Array.isArray(rows) ? rows[0] : null
  if (!p || p.role !== 'teacher' || p.active !== true) return null
  return p
}

async function getStudent(id, secret) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,role,login_name`,
    { headers: secretHeaders(secret) },
  )
  if (!res.ok) return null
  const rows = await readJson(res)
  const p = Array.isArray(rows) ? rows[0] : null
  if (!p || p.role !== 'student') return null
  return p
}

async function updateProfile(id, fields, secret) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: secretHeaders(secret, { Prefer: 'return=representation' }),
    body: JSON.stringify(fields),
  })
  return res.ok
}

async function adminUpdateUser(id, fields, secret) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: secretHeaders(secret),
    body: JSON.stringify(fields),
  })
  return { ok: res.ok, data: await readJson(res) }
}

async function listStudents(secret) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.student&select=id,login_name,display_name,areas,active,created_at&order=created_at.asc`,
    { headers: secretHeaders(secret) },
  )
  if (!res.ok) return null
  const rows = await readJson(res)
  if (!Array.isArray(rows)) return null
  return rows.map(r => ({
    id: r.id,
    loginName: r.login_name,
    displayName: r.display_name || r.login_name,
    areas: Array.isArray(r.areas) ? r.areas : [],
    active: r.active !== false,
  }))
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Sadece POST isteği kabul edilir.' })

  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) return json(500, { error: 'Gizli anahtar Netlify ayarlarına henüz eklenmemiş (SUPABASE_SECRET_KEY).' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  const userToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!userToken) return json(401, { error: 'Giriş yapılmamış.' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'İstek okunamadı.' }) }

  try {
    const teacher = await verifyTeacher(userToken, secret)
    if (!teacher) return json(403, { error: 'Bu işlem yalnızca öğretmen hesabıyla yapılabilir.' })

    const islem = body.islem

    if (islem === 'liste') {
      const students = await listStudents(secret)
      if (!students) return json(500, { error: 'Öğrenci listesi okunamadı.' })
      return json(200, { students })
    }

    if (islem === 'ekle') {
      const loginName = normalizeLoginName(body.girisAdi)
      const displayName = String(body.gorunenAd || '').trim().slice(0, 60)
      const password = String(body.sifre || '')
      const areas = cleanAreas(body.alanlar)
      if (!LOGIN_NAME_RE.test(loginName)) {
        return json(400, { error: 'Giriş adı 2-30 karakter olmalı; yalnızca harf, rakam, nokta, alt çizgi ve tire kullanılabilir.' })
      }
      if (loginName === 'admin') return json(400, { error: 'Bu giriş adı kullanılamaz.' })
      if (!displayName) return json(400, { error: 'Görünen adı yaz.' })
      if (password.length < 6) return json(400, { error: 'Şifre en az 6 karakter olmalı.' })
      if (!areas) return json(400, { error: 'Alan seçimi geçersiz.' })

      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: secretHeaders(secret),
        body: JSON.stringify({ email: `${loginName}@${LOGIN_DOMAIN}`, password, email_confirm: true }),
      })
      const created = await readJson(createRes)
      if (!createRes.ok || !created || !created.id) {
        const msg = String((created && (created.msg || created.message || created.error_code)) || '')
        if (/already|exists|registered/i.test(msg)) return json(409, { error: 'Bu giriş adı zaten kullanılıyor.' })
        if (/password/i.test(msg)) return json(400, { error: 'Şifre kabul edilmedi. En az 6 karakter olmalı.' })
        return json(500, { error: 'Hesap açılamadı.' })
      }

      // Profil satırını veritabanı kendiliğinden açar; adı ve alanları yaz.
      const ok = await updateProfile(created.id, { display_name: displayName, areas }, secret)
      if (!ok) {
        // Yarım kalmasın: hesabı geri sil.
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(created.id)}`, {
          method: 'DELETE', headers: secretHeaders(secret),
        }).catch(() => {})
        return json(500, { error: 'Hesap açılamadı (profil yazılamadı).' })
      }
      return json(200, { ok: true, students: await listStudents(secret) })
    }

    // Aşağıdaki işlemlerin hepsi tek bir öğrenci üzerinde.
    const id = String(body.id || '')
    const student = id ? await getStudent(id, secret) : null
    if (!student) return json(404, { error: 'Öğrenci bulunamadı.' })

    if (islem === 'alanlar') {
      const areas = cleanAreas(body.alanlar)
      if (!areas) return json(400, { error: 'Alan seçimi geçersiz.' })
      const ok = await updateProfile(id, { areas }, secret)
      if (!ok) return json(500, { error: 'Alanlar kaydedilemedi.' })
      return json(200, { ok: true, students: await listStudents(secret) })
    }

    if (islem === 'sifre') {
      const password = String(body.sifre || '')
      if (password.length < 6) return json(400, { error: 'Şifre en az 6 karakter olmalı.' })
      const r = await adminUpdateUser(id, { password }, secret)
      if (!r.ok) return json(500, { error: 'Şifre değiştirilemedi.' })
      return json(200, { ok: true })
    }

    if (islem === 'aktif') {
      const active = body.aktif === true
      const r = await adminUpdateUser(id, { ban_duration: active ? 'none' : BAN_FOREVER }, secret)
      if (!r.ok) return json(500, { error: 'Hesap durumu değiştirilemedi.' })
      const ok = await updateProfile(id, { active }, secret)
      if (!ok) {
        // Giriş durumu ile profil uyuşmazsa eski hâline döndür.
        await adminUpdateUser(id, { ban_duration: active ? BAN_FOREVER : 'none' }, secret)
        return json(500, { error: 'Hesap durumu değiştirilemedi.' })
      }
      return json(200, { ok: true, students: await listStudents(secret) })
    }

    return json(400, { error: 'Bilinmeyen işlem.' })
  } catch (e) {
    console.error('[ogrenci-yonetimi]', e)
    return json(500, { error: 'Beklenmeyen bir hata oldu. Biraz sonra tekrar dene.' })
  }
}
