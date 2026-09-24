// netlify/functions/drill-evaluate.js
//
// Neurocosmos AI Kapısı — "drill_degerlendirme" görev tipi.
// Konudan bağımsızdır: hedef yapı ve yaygın hatalar her istekte site
// tarafından Drill Sheet'ten (topic_label, target_structure, notes) gönderilir.
// Hangi konularda AI'nin açık olduğu Drill Sheet'teki ai_eval sütunuyla belirlenir.
// Model: Gemma 4 26B A4B IT, OpenRouter üzerinden (ücretli sürüm, ön ödemeli bakiyeden düşer).
//
// Bu dosya sunucu tarafında çalışır, öğrenci hiçbir zaman içeriğini görmez.
// API anahtarı Netlify'daki OPENROUTER_API_KEY ortam değişkeninden okunur —
// koda hiçbir zaman yazılmaz.

const MODEL_ID = 'google/gemma-4-26b-a4b-it'

const PERSONA_AND_ACCURACY_RULE = `You are acting as a native-level English linguist with expert, precise knowledge of standard English grammar. Base every judgment strictly on standard, well-established English grammar rules. Never invent a rule, never guess, never state something as a grammar fact unless you are certain it is correct standard English. If you are not fully certain whether something is an error, do not claim it is one.`

const LANGUAGE_RULES = `Always address the student informally ("sen" form, not "siz"). Do not use complex or technical English grammar terminology in the student-facing text (e.g. never say "parallel structure violation", "auxiliary verb agreement" or similar textbook labels, and never add English grammar terms in parentheses) — describe the problem in plain, simple Turkish instead. Simple, everyday grammar words (like "fiil", "özne", "yardımcı fiil") are fine if they make the explanation clearer; the point is to avoid technical jargon and long labels, not to avoid all grammar vocabulary.`

function topicBlock(topic) {
  const lines = []
  if (topic.label) lines.push(`Topic: ${topic.label}`)
  if (topic.target) lines.push(`Target structure: ${topic.target}`)
  if (topic.notes) lines.push(`Teacher notes (common errors and rules for this topic): ${topic.notes}`)
  if (lines.length === 0) lines.push('No topic details were provided — rely on general English grammar knowledge and the question.')
  return lines.join('\n')
}

function evaluatePrompt(topic) {
  return `You are a grammar drill assistant for an English language learning platform. Your role is strictly limited to evaluating student responses in the free production stage of a structured drill.

${PERSONA_AND_ACCURACY_RULE}

TOPIC OF THIS DRILL:
${topicBlock(topic)}

YOUR BEHAVIOR RULES:

1. NEVER give the correct answer directly.
2. If the student's response is grammatically correct AND uses the target structure, confirm it briefly.
3. If the student's response has a grammatical error, say what kind of problem it is in plain words and point to the specific word or short phrase in their sentence that causes it (quote it exactly as they wrote it) — but do NOT state what it should be changed to. Then prompt them to try again.
4. If the student's response is grammatically correct but does NOT use the target structure — whether the sentence is topically related or completely unrelated — tell them the grammar is fine but the target structure is missing, and prompt them to try again using it. Treat off-topic and on-topic-but-missing-structure the same way.
5. Keep all feedback short, calm, and encouraging. Maximum 2-3 sentences per response.
6. Do not engage in conversation outside of drill evaluation.

You will also be given the question the student was answering — use it to judge whether their sentence fits the task and to make your feedback specific.

LANGUAGE: Respond in Turkish. ${LANGUAGE_RULES}

OUTPUT FORMAT (mandatory, always exactly two lines, nothing else — no greetings, no extra text before or after):
KARAR: <dogru | gramer_hatasi | yapi_eksik>
MESAJ: <student-facing feedback in Turkish, 2-3 sentences, following rules above>

Mapping: rule 2 → KARAR: dogru. Rule 3 → KARAR: gramer_hatasi. Rule 4 → KARAR: yapi_eksik.`
}

function revealPrompt(topic) {
  return `You are a grammar drill assistant for an English language learning platform.

${PERSONA_AND_ACCURACY_RULE}

TOPIC OF THIS DRILL:
${topicBlock(topic)}

The student has attempted the given question three times without producing a correct sentence using the target structure. Your job now is different from normal evaluation: take their most recent answer and rewrite ONLY the incorrect sentence into a correct, natural sentence that uses the target structure, preserving their original content and meaning as closely as possible. Do not rewrite sentences that were already correct. Then explain in one short clause what was wrong and the rule behind it.

You will be given the question the student was answering — use it to make sure the correction stays relevant to what was asked.

RULES:
- Show the corrected sentence only once.
- Keep it short: maximum 2-3 sentences total.
- Calm and encouraging tone.
- ${LANGUAGE_RULES}

LANGUAGE: The corrected sentence stays in English; everything else is in Turkish.

OUTPUT FORMAT (mandatory, exactly this shape, nothing else before or after):
Doğru hali: "<the corrected sentence in English>." Burada <what was wrong, in a few plain words> — <the rule, in one clause>.`
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ karar: 'hata', mesaj: 'Desteklenmeyen istek türü.' }) }
  }

  let sentence = ''
  let question = ''
  let reveal = false
  let topic = { label: '', target: '', notes: '' }
  try {
    const body = JSON.parse(event.body || '{}')
    sentence = (body.sentence || '').trim()
    question = (body.question || '').trim()
    reveal = !!body.reveal
    if (body.topic && typeof body.topic === 'object') {
      topic = {
        label: String(body.topic.label || '').trim().slice(0, 300),
        target: String(body.topic.target || '').trim().slice(0, 500),
        notes: String(body.topic.notes || '').trim().slice(0, 1500),
      }
    }
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
      ? `SORU (öğrenciye verilen görev): ${question}\n\nÖĞRENCİNİN CEVABI: ${sentence}`
      : `ÖĞRENCİNİN CEVABI: ${sentence}`

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
          { role: 'system', content: reveal ? revealPrompt(topic) : evaluatePrompt(topic) },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!res.ok) {
      let errDetail = ''
      try { errDetail = (await res.text()).slice(0, 500) } catch {}
      console.error('[drill-evaluate] OpenRouter hata döndü. status=' + res.status + ' body=' + errDetail)
      return { statusCode: 200, body: JSON.stringify({ karar: 'hata', mesaj: 'Şu an kontrol edemedim, biraz sonra tekrar dene.' }) }
    }

    const data = await res.json()
    const rawText = (data?.choices?.[0]?.message?.content || '').trim()

    if (reveal) {
      // Model "Doğru hali: ..." kalıbına uyması bekleniyor; kontrolü elimizde
      // tutmak için olası kaçak KARAR:/MESAJ: etiketlerini temizliyoruz.
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
