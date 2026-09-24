// netlify/functions/drill-evaluate.js
//
// Neurocosmos AI Kapısı — "drill_degerlendirme" görev tipi.
// Faz 1: yalnızca "neither / nor" konusu için test ediliyor.
// Model: Gemma 4 26B A4B IT, OpenRouter üzerinden (ücretli sürüm, ön ödemeli bakiyeden düşer).
// Google'ın kendi API'si (Gemini API) bu proje için erişimi reddettiğinden
// (403 PERMISSION_DENIED, hesap tarafında bir kısıtlama), aynı modeli
// tamamen ayrı, bağımsız bir servisten çağırıyoruz.
//
// Bu dosya sunucu tarafında çalışır, öğrenci hiçbir zaman içeriğini görmez.
// API anahtarı Netlify'daki OPENROUTER_API_KEY ortam değişkeninden okunur —
// koda hiçbir zaman yazılmaz.

const MODEL_ID = 'google/gemma-4-26b-a4b-it'

const SYSTEM_PROMPT = `You are a grammar drill assistant for an English language learning platform. Your role is strictly limited to evaluating student responses during structured drills.

YOUR BEHAVIOR RULES:

1. NEVER give the correct answer directly.
2. If the student's response is grammatically correct AND uses the target structure (neither/nor), confirm it briefly and move on.
3. If the student's response has a grammatical error, identify the error TYPE and point to the specific word or short phrase in their sentence that causes it (quote it exactly as they wrote it) — but do NOT state what it should be changed to. Then prompt them to try again.
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

You will also be given the question the student was answering — use it to judge whether their sentence is on-topic and to make your feedback more specific, but keep following the rules above.

OUTPUT FORMAT (mandatory, always exactly two lines, nothing else — no greetings, no extra text before or after):
KARAR: <dogru | gramer_hatasi | yapi_eksik>
MESAJ: <student-facing feedback in Turkish, 2-3 sentences, following rules above>

Mapping: rule 2 → KARAR: dogru. Rule 3 → KARAR: gramer_hatasi. Rule 4 → KARAR: yapi_eksik.`

// Üçüncü ardışık hatalı denemede kullanılan ayrı prompt: artık düzeltmeyi
// gizlemiyoruz, öğrencinin kendi cümlesini hedef yapıyla düzeltip kısa bir
// açıklama veriyoruz.
const REVEAL_SYSTEM_PROMPT = `You are a grammar drill assistant for an English language learning platform.

The student has attempted the given question three times without producing a correct sentence using the target structure (neither/nor). Your job now is different from normal evaluation: take their most recent sentence and rewrite ONLY the incorrect part into a correct, natural sentence that uses the target structure, keeping any part of their sentence that was already correct exactly as they wrote it, and preserving their original content and meaning as closely as possible. Then add one short, clear explanation of the key rule the correction illustrates.

You will be given the question the student was answering — use it to make sure the correction stays relevant to what was asked.

ERROR CATEGORIES FOR CONTEXT:
- Double negative (neither + didn't/wasn't etc.)
- Wrong auxiliary (does/do/did confusion)
- Verb agreement error (neither A nor B → verb agrees with B)
- Parallel structure violation (adjective + noun pair etc.)
- Missing article (neither a doctor nor a nurse)

TARGET STRUCTURE LAYERS:
- Neither + aux + subject (Agreement)
- Neither A nor B + verb agrees with B (Subject)
- Subject + verb + neither X nor Y (Complement)

RULES:
- Do not repeat parts of the student's sentence that were already correct — only show the corrected sentence once, in full, not twice.
- Keep it short: the corrected sentence, then one explanation sentence. Maximum 2-3 sentences total.
- Calm and encouraging tone.

LANGUAGE: The corrected sentence stays in English; everything else is in Turkish.

OUTPUT FORMAT (mandatory, exactly this shape, nothing else before or after):
Doğru hali: "<the corrected sentence in English>." Burada <what was wrong, in a few words> — <the rule, in one clause>.`

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ karar: 'hata', mesaj: 'Desteklenmeyen istek türü.' }) }
  }

  let sentence = ''
  let question = ''
  let reveal = false
  try {
    const body = JSON.parse(event.body || '{}')
    sentence = (body.sentence || '').trim()
    question = (body.question || '').trim()
    reveal = !!body.reveal
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
    const userContent = question
      ? `SORU (öğrenciye verilen görev): ${question}\n\nÖĞRENCİNİN CÜMLESİ: ${sentence}`
      : sentence

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
          { role: 'system', content: reveal ? REVEAL_SYSTEM_PROMPT : SYSTEM_PROMPT },
          { role: 'user', content: userContent },
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
    const rawText = (data?.choices?.[0]?.message?.content || '').trim()

    if (reveal) {
      // Model "Doğru hali: ..." kalıbına uyması bekleniyor, ama kontrolü
      // elimizde tutmak için olası kaçak KARAR:/MESAJ: etiketlerini
      // öğrenciye göstermeden önce temizliyoruz.
      const mesaj = rawText
        .replace(/^KARAR:.*$/gim, '')
        .replace(/MESAJ:\s*/gi, '')
        .trim()
      if (!mesaj) {
        console.error('[drill-evaluate] Reveal modunda boş cevap geldi. rawText=' + rawText.slice(0, 300))
        return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Cevabı okuyamadım, biraz sonra tekrar dene.' }) }
      }
      return { statusCode: 200, body: JSON.stringify({ karar: 'aciklama', mesaj }) }
    }

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
