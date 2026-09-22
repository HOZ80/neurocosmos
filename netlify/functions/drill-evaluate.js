// netlify/functions/drill-evaluate.js
//
// Neurocosmos AI Kapısı — "drill_degerlendirme" görev tipi.
// Faz 1: yalnızca "neither / nor" konusu için test ediliyor.
// Model: Gemma 4 26B A4B IT (Google AI Studio, ücretsiz katman).
//
// Bu dosya sunucu tarafında çalışır, öğrenci hiçbir zaman içeriğini görmez.
// API anahtarı Netlify'daki GEMINI_API_KEY ortam değişkeninden okunur —
// koda hiçbir zaman yazılmaz.

const MODEL_ID = 'gemma-4-26b-a4b-it'

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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ karar: 'hata', mesaj: 'Sunucu tarafında bir ayar eksik. Lütfen daha sonra tekrar dene.' }) }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: sentence }] }],
      }),
    })

    if (!res.ok) {
      // Google'dan hata döndü (kota, geçici sorun vb.) — öğrenciye nötr mesaj.
      return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Şu an kontrol edemedim, biraz sonra tekrar dene.' }) }
    }

    const data = await res.json()
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    const kararMatch = rawText.match(/KARAR:\s*(dogru|gramer_hatasi|yapi_eksik)/i)
    const mesajMatch = rawText.match(/MESAJ:\s*([\s\S]*)/i)

    if (!kararMatch || !mesajMatch) {
      // Model kalıp dışı cevap verdi — site bozulmasın, nötr mesaj göster.
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
    return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Bir bağlantı sorunu oldu, biraz sonra tekrar dene.' }) }
  }
}
