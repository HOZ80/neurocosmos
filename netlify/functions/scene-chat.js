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
//
// ─── ÖLÇÜM SÜRÜMÜ ────────────────────────────────────────────────────────────
// Bu sürüme sadece süre kayıtları eklendi. Üretilen cevap, gönderilen istek ve
// dönen veri birebir aynıdır. Kayıt satırlarının hepsi [SURE] ile başlar, böylece
// Netlify log ekranında kolayca ayırt edilir.
//
// Tek bilinçli davranış farkı: iki paralel çağrı artık Promise.all yerine
// Promise.allSettled ile bekleniyor. Sebebi, biri hata verdiğinde diğerinin
// süresinin de kaydedilebilmesi. Bunun tek pratik sonucu şudur: bir çağrı erken
// hata verirse, hata mesajı eskisi gibi hemen değil, yavaş olan çağrı da bitince
// döner. Ölçüm bitince bu satır eski hâline çevrilebilir.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

// ─── Ölçüm yardımcısı ────────────────────────────────────────────────────────

function sureYaz(baslik, baslangic, ek) {
  const gecen = Date.now() - baslangic;
  console.log('[SURE] ' + baslik + ': ' + gecen + ' ms' + (ek ? ' — ' + ek : ''));
}

exports.handler = async (event) => {
  const handlerBaslangic = Date.now();

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

  console.log('[SURE] --- yeni istek --- gecmis tur sayisi: ' + gecmis.length +
    ' | gelen govde: ' + (event.body ? event.body.length : 0) + ' karakter');

  try {
    const sonuclar = await Promise.allSettled([
      karakterCevabiUret(scene, character, gecmis, ogrenciMesaji, apiKey),
      yapiTespitiYap(scene, ogrenciMesaji, apiKey)
    ]);

    sureYaz('TOPLAM — iki cagri da bitti', handlerBaslangic);

    // Eski davranışın korunması: herhangi biri hata verdiyse 500 dönülür.
    const hataliOlan = sonuclar.find(function (s) { return s.status === 'rejected'; });
    if (hataliOlan) {
      throw hataliOlan.reason;
    }

    const govde = JSON.stringify({
      karakterCevabi: sonuclar[0].value,
      yapiTespitEdildi: sonuclar[1].value.tespitEdildi,
      yapiNotu: sonuclar[1].value.not
    });

    sureYaz('TOPLAM — cevap tarayiciya donuluyor', handlerBaslangic,
      'govde ' + govde.length + ' karakter');

    return { statusCode: 200, body: govde };
  } catch (hata) {
    sureYaz('TOPLAM — hata ile bitti', handlerBaslangic, hata.message);
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
  const baslangic = Date.now();

  const contents = gecmis.map(function (tur) {
    return {
      role: tur.from === 'ogrenci' ? 'user' : 'model',
      parts: [{ text: tur.text }]
    };
  });
  contents.push({ role: 'user', parts: [{ text: ogrenciMesaji }] });

  const istekGovdesi = JSON.stringify({
    systemInstruction: { parts: [{ text: sistemTalimatiKur(scene, character) }] },
    contents: contents,
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  });

  console.log('[SURE] KARAKTER — Gemini cagrisi gonderiliyor | ' + contents.length +
    ' tur | istek ' + istekGovdesi.length + ' karakter');

  let cevap;
  try {
    cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: istekGovdesi
    });
  } catch (hata) {
    sureYaz('KARAKTER — BAGLANTI HATASI', baslangic, hata.message);
    throw hata;
  }

  sureYaz('KARAKTER — Gemini yanit basligi geldi', baslangic, 'HTTP ' + cevap.status);

  const sonuc = await cevap.json();

  sureYaz('KARAKTER — Gemini govdesi okundu', baslangic);

  if (!cevap.ok) {
    sureYaz('KARAKTER — Gemini HATA dondu', baslangic,
      (sonuc.error && sonuc.error.message) || 'sebep belirtilmemis');
    throw new Error((sonuc.error && sonuc.error.message) || 'Karakter cevabı alınamadı');
  }

  const metin = sonuc.candidates &&
    sonuc.candidates[0] &&
    sonuc.candidates[0].content &&
    sonuc.candidates[0].content.parts &&
    sonuc.candidates[0].content.parts[0] &&
    sonuc.candidates[0].content.parts[0].text;

  sureYaz('KARAKTER — BITTI', baslangic,
    'uretilen metin ' + ((metin || '').length) + ' karakter');

  return metin || '';
}

// ─── Yapı tespiti (ayrı, bağımsız çağrı) ─────────────────────────────────────

async function yapiTespitiYap(scene, ogrenciMesaji, apiKey) {
  const baslangic = Date.now();

  if (!scene.target) {
    console.log('[SURE] YAPI — atlandi, sahnede hedef yapi tanimli degil');
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

  console.log('[SURE] YAPI — Gemini cagrisi gonderiliyor');

  let cevap;
  try {
    cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: kontrolPromptu }] }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'minimal' }
        }
      })
    });
  } catch (hata) {
    sureYaz('YAPI — BAGLANTI HATASI', baslangic, hata.message);
    throw hata;
  }

  sureYaz('YAPI — Gemini yanit basligi geldi', baslangic, 'HTTP ' + cevap.status);

  const sonuc = await cevap.json();

  sureYaz('YAPI — Gemini govdesi okundu', baslangic);

  if (!cevap.ok) {
    sureYaz('YAPI — Gemini HATA dondu', baslangic,
      (sonuc.error && sonuc.error.message) || 'sebep belirtilmemis');
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

  sureYaz('YAPI — BITTI', baslangic, 'tespit: ' + (tespitEdildi ? 'evet' : 'hayir'));

  return { tespitEdildi: tespitEdildi, not: not };
}
