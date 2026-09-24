// netlify/functions/drill-evaluate.js
//
// Neurocosmos AI Kapısı — "drill_degerlendirme" görev tipi.
// Faz 1: yalnızca "neither / nor" konusu için test ediliyor.
// Model: Gemma 4 26B A4B IT, OpenRouter üzerinden (ücretsiz, ":free" sürümü).
// Google'ın kendi API'si (Gemini API) bu proje için erişimi reddettiğinden
// (403 PERMISSION_DENIED, hesap tarafında bir kısıtlama), aynı modeli
// tamamen ayrı, bağımsız bir servisten çağırıyoruz.
//
// Bu dosya sunucu tarafında çalışır, öğrenci hiçbir zaman içeriğini görmez.
// API anahtarı Netlify'daki OPENROUTER_API_KEY ortam değişkeninden okunur —
// koda hiçbir zaman yazılmaz.

const MODEL_ID = 'google/gemma-4-26b-a4b-it:free'

const SYSTEM_PROMPT = `You are a grammar drill assistant for an English language learning platform. Your role is strictly limited to evaluating student responses during structured drills.

YOUR BEHAVIOR RULES:

1. NEVER give the correct answer directly.
2. If the student's response is grammatically correct AND uses the target structure (neither/nor), confirm it briefly and move on.
3. If the student's response has a grammatical error, identify the error TYPE only (do not correct it), and prompt them to try again.
4. If the student's response is grammatically correct but does NOT use the target structure — whether the sentence is topically related or completely unrelated — tell them the grammar is fine but the target structure is missing, and prompt them to try again using it. Do not distinguish between "off-topic" and "on-topic but missing structure" — treat both the same way.
5. Keep all feedback short, calm, and encouraging. Maximum 2-3 sentences per response.
6. Do not engage in conversation outside of drill evaluation. If the student asks unrelated questions, redirect them to the drill.

ERROR CATEGORIES YOU TRACK:
- Double negative (neither + didn't/wasn't etc.)
- Wrong auxiliary (does/do/did confusion)
- Verb agreement error (neither A nor B → verb agrees with B)
- Parallel structure violation (adjective + noun pair etc.)
- Missing article (neither a doctor nor a nurse)

LANGUAGE: Respond in Turkish unless the drill prompt specifies otherwise.

OUTPUT FORMAT (mandatory, always exactly two lines, nothing else — no greetings, no extra text before or after):
KARAR: <dogru | gramer_hatasi | yapi_eksik>
MESAJ: <student-facing feedback in Turkish, 2-3 sentences, following rules above>

Mapping: rule 2 → KARAR: dogru. Rule 3 → KARAR: gramer_hatasi. Rule 4 → KARAR: yapi_eksik.`

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ karar: 'hata', mesaj: 'Desteklenmeyen istek türü.' }) }
  }

  let sentence = ''
  try {
    const body = JSON.parse(event.body || '{}')
    sentence = (body.sentence || '').trim()
  } catch {
    return { statusCode: 400, body: JSON.stringify({ karar: 'hata', mesaj: 'İstek okunamadı.' }) }
  }

  if (!sentence) {
    return { statusCode: 400, body: JSON.stringify({ karar: 'hata', mesaj: 'Cümle boş görünüyor.' }) }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('[drill-evaluate] OPENROUTER_API_KEY tanımlı değil.')
    return { statusCode: 500, body: JSON.stringify({ karar: 'hata', mesaj: 'Sunucu tarafında bir ayar eksik. Lütfen daha sonra tekrar dene.' }) }
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://neurocosmos.netlify.app',
        'X-Title': 'Neurocosmos',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: sentence },
        ],
      }),
    })

    if (!res.ok) {
      // OpenRouter'dan hata döndü (kota, geçici sorun vb.) — öğrenciye nötr mesaj.
      let errDetail = ''
      try { errDetail = (await res.text()).slice(0, 500) } catch {}
      console.error('[drill-evaluate] OpenRouter hata döndü. status=' + res.status + ' body=' + errDetail)
      return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Şu an kontrol edemedim, biraz sonra tekrar dene.', debug: errDetail }) }
    }

    const data = await res.json()
    const rawText = data?.choices?.[0]?.message?.content || ''

    const kararMatch = rawText.match(/KARAR:\s*(dogru|gramer_hatasi|yapi_eksik)/i)
    const mesajMatch = rawText.match(/MESAJ:\s*([\s\S]*)/i)

    if (!kararMatch || !mesajMatch) {
      // Model kalıp dışı cevap verdi — site bozulmasın, nötr mesaj göster.
      console.error('[drill-evaluate] Kalıp uyuşmadı. rawText=' + rawText.slice(0, 500))
      return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Cevabı okuyamadım, biraz sonra tekrar dene.' }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        karar: kararMatch[1].toLowerCase(),
        mesaj: mesajMatch[1].trim(),
      }),
    }
  } catch (e) {
    console.error('[drill-evaluate] Beklenmedik hata: ' + (e && e.message ? e.message : String(e)))
    return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Bir bağlantı sorunu oldu, biraz sonra tekrar dene.' }) }
  }
}
