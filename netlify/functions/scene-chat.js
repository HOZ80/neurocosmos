// netlify/functions/scene-chat.js
//
// Sahnedeki karakteri gerçekten konuşturur.
// Sahne ve karakter bilgisi siteden (Sheets'ten okunmuş haliyle) gelir —
// bu dosyanın içinde hiçbir sahne/karakter metni yazılı değildir.
//
// Her çağrıda iki iş yapılır:
//   1) Karakterin (örn. Tesla) o anki cevabı üretilir
//   2) Öğrencinin cümlesinde hedef yapı var mı, ayrıca değerlendirilir
// İkisi paralel çalışır. Değerlendirme öğrenciyi engellemez, sadece kaydedilir.
//
// API anahtarı Netlify ortam değişkeninden (GEMINI_API_KEY) okunur.

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Sadece POST isteği kabul edilir' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY tanımlı değil' }) };
  }

  let istek;
  try {
    istek = JSON.parse(event.body);
  } catch (hata) {
    return { statusCode: 400, body: JSON.stringify({ error: 'İstek gövdesi geçerli JSON değil' }) };
  }

  const scene = istek.scene || {};
  const character = istek.character || {};
  const gecmis = Array.isArray(istek.gecmis) ? istek.gecmis : [];
  const ogrenciMesaji = istek.ogrenciMesaji;

  if (!ogrenciMesaji || typeof ogrenciMesaji !== 'string' || !ogrenciMesaji.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ogrenciMesaji eksik' }) };
  }

  try {
    const sonuclar = await Promise.all([
      karakterCevabiUret(scene, character, gecmis, ogrenciMesaji, apiKey),
      yapiTespitiYap(scene, ogrenciMesaji, apiKey)
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        karakterCevabi: sonuclar[0],
        yapiTespitEdildi: sonuclar[1].tespitEdildi,
        yapiNotu: sonuclar[1].not
      })
    };
  } catch (hata) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AI çağrısı başarısız oldu', detay: hata.message })
    };
  }
};

// ─── Karakterin cevabı ───────────────────────────────────────────────────────

function sistemTalimatiKur(scene, character) {
  const satirlar = [];

  satirlar.push('You are ' + (character.name || 'a character') + ' in an interactive English learning scene.');
  if (character.who) satirlar.push('Who you are: ' + character.who);
  if (character.personality) satirlar.push('Your personality: ' + character.personality);
  if (character.goal) satirlar.push('What you want from this conversation: ' + character.goal);

  if (scene.place || scene.situation) {
    satirlar.push('The scene: ' + [scene.place, scene.situation].filter(Boolean).join(' — '));
  }
  if (scene.characterExpectation) {
    satirlar.push('What you expect from the student here: ' + scene.characterExpectation);
  }
  if (scene.productionQuestion) {
    satirlar.push('You have just asked the student this question: "' + scene.productionQuestion + '"');
  }

  satirlar.push('');
  satirlar.push('RULES — follow all of them:');
  satirlar.push('- Speak ONLY in English, even if the student writes in Turkish.');
  if (character.speechLimits) {
    satirlar.push('- Keep your English within these limits: ' + character.speechLimits);
  }
  satirlar.push('- Keep replies short: 2 to 4 sentences. This is a conversation, not a lesson.');
  satirlar.push('- Never break character. Never say you are an AI or a language model.');
  if (character.wontSay) {
    satirlar.push('- Things you must never do: ' + character.wontSay);
  }
  if (scene.target) {
    satirlar.push('- The student is practising this structure: ' + scene.target +
      '. Encourage them to use it by asking about the past and its imagined consequences, but NEVER correct their grammar, never give them a model sentence, and never mention grammar terms.');
  }
  satirlar.push('- If the student goes off topic, gently bring the conversation back with something from your own story.');

  return satirlar.join('\n');
}

async function karakterCevabiUret(scene, character, gecmis, ogrenciMesaji, apiKey) {
  const contents = gecmis.map(function (tur) {
    return {
      role: tur.from === 'ogrenci' ? 'user' : 'model',
      parts: [{ text: tur.text }]
    };
  });
  contents.push({ role: 'user', parts: [{ text: ogrenciMesaji }] });

  const cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistemTalimatiKur(scene, character) }] },
      contents: contents
    })
  });

  const sonuc = await cevap.json();
  if (!cevap.ok) {
    throw new Error((sonuc.error && sonuc.error.message) || 'Karakter cevabı alınamadı');
  }

  const metin = sonuc.candidates &&
    sonuc.candidates[0] &&
    sonuc.candidates[0].content &&
    sonuc.candidates[0].content.parts &&
    sonuc.candidates[0].content.parts[0] &&
    sonuc.candidates[0].content.parts[0].text;

  return metin || '';
}

// ─── Yapı tespiti (ayrı, bağımsız çağrı) ─────────────────────────────────────

async function yapiTespitiYap(scene, ogrenciMesaji, apiKey) {
  if (!scene.target) {
    return { tespitEdildi: false, not: 'Bu sahne için hedef yapı tanımlı değil.' };
  }

  const kontrolPromptu =
    'Bir İngilizce öğrencisinin cümlesini değerlendir.\n' +
    'Hedef yapı: ' + scene.target + '\n' +
    (scene.structureNote ? 'Yapının tanımı: ' + scene.structureNote + '\n' : '') +
    'Öğrenci cümlesi: "' + ogrenciMesaji + '"\n\n' +
    'Bu cümlede hedef yapı üretilmiş mi? Sadece şu formatta, başka hiçbir şey eklemeden cevap ver:\n' +
    'TESPIT: evet\n' +
    'NOT: tek cümlelik kısa gerekçe (Türkçe)';

  const cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: kontrolPromptu }] }]
    })
  });

  const sonuc = await cevap.json();
  if (!cevap.ok) {
    throw new Error((sonuc.error && sonuc.error.message) || 'Yapı tespiti alınamadı');
  }

  const metin = (sonuc.candidates &&
    sonuc.candidates[0] &&
    sonuc.candidates[0].content &&
    sonuc.candidates[0].content.parts &&
    sonuc.candidates[0].content.parts[0] &&
    sonuc.candidates[0].content.parts[0].text) || '';

  const tespitEdildi = /TESPIT:\s*evet/i.test(metin);
  const notEslesme = metin.match(/NOT:\s*(.+)/i);
  const not = notEslesme ? notEslesme[1].trim() : '';

  return { tespitEdildi: tespitEdildi, not: not };
}
