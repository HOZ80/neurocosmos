// netlify/functions/uyanik-tut.js
//
// Haftalık uyanık tutma. Supabase'in ücretsiz projesi 7 gün hiç kullanılmazsa
// duraklatılıyor. Bu görev haftada iki kez (pazartesi ve perşembe sabahı,
// Türkiye saatiyle 09:00) veritabanındaki küçük "ping" işlevini çağırır.
//
// Netlify bu görevi kendiliğinden çalıştırır; adresle dışarıdan çağrılamaz.
// Gizli anahtar gerekmez, yalnızca herkese açık anahtar kullanılır.

const SUPABASE_URL = 'https://enacdiolibbxakxoslla.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_dx8Rx1zdfhvhg6G0TEZUHQ_JSQg-Z-Q'

export default async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const text = await res.text()
    console.log('[uyanik-tut] durum ' + res.status + ' — ' + text)
  } catch (e) {
    console.error('[uyanik-tut] hata', e)
  }
  return new Response('ok')
}

// Saatler UTC: 06:00 UTC = 09:00 Türkiye.
export const config = {
  schedule: '0 6 * * 1,4',
}
