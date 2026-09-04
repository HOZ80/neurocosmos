// netlify/functions/scene-chat.js
//
// Sahnedeki karakteri gerçekten konuşturur.
// Sahne ve karakter bilgisi siteden (Sheets'ten okunmuş haliyle) gelir —
// bu dosyanın içinde hiçbir sahne/karakter metni yazılı değildir.
//
// ─── BİRLEŞTİRİLMİŞ SÜRÜM ────────────────────────────────────────────────────
// Önceki sürümde her öğrenci cümlesi için Gemini'ye İKİ ayrı çağrı gidiyordu:
// biri karakterin cevabı, biri yapı tespiti. Bu sürümde ikisi TEK çağrıda
// yapılıyor. Sonuçları:
//   - Kota tüketimi yarıya iniyor (dakikalık sınıra iki kat geç takılırsın)
//   - Maliyet yarıya iniyor
//   - "Biri başarılı, biri hatalı, ikisi de çöpe gitti" durumu ortadan kalkıyor
//
// Siteye dönen cevabın biçimi hiç değişmedi (karakterCevabi, yapiTespitEdildi,
// yapiNotu). Bu yüzden SceneView.tsx tarafında hiçbir değişiklik gerekmiyor.
//
// Model, cevabını şu biçimde veriyor:
//     <karakterin öğrenciye söyledikleri>
//     ###
//     TESPIT: evet
//     NOT: kısa gerekçe
// ### işaretinden öncesi öğrenciye gösterilir, sonrası sadece kayda geçer.
// Model bu biçime uymazsa metnin tamamı karakterin cevabı sayılır — yani
// öğrenci her hâlükârda bir cevap görür, hiçbir şey çöpe gitmez.
//
// [SURE] ile başlayan ölçüm kayıtları duruyor; gecikme sorununu ölçmeye
// devam edebilmek için gerekli.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

const AYIRAC = '###';

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
    const sonuc = await tekCagriYap(scene, character, gecmis, ogrenciMesaji, apiKey);

    const govde = JSON.stringify({
      karakterCevabi: sonuc.karakterCevabi,
      yapiTespitEdildi: sonuc.tespitEdildi,
      yapiNotu: sonuc.not
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

// ─── Sistem talimatı ─────────────────────────────────────────────────────────

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

  // ─── Çıktı biçimi: karakterin cevabı + gizli değerlendirme ───
  satirlar.push('');
  satirlar.push('OUTPUT FORMAT — this is a technical instruction, not part of the scene.');
  satirlar.push('Your answer must have two parts, separated by a line containing only ' + AYIRAC + '.');
  satirlar.push('');
  satirlar.push('PART 1 (before ' + AYIRAC + '): what you say to the student, in character, in English.');
  satirlar.push('Nothing else. No labels, no notes, no analysis.');
  satirlar.push('');

  if (scene.target) {
    satirlar.push('PART 2 (after ' + AYIRAC + '): a hidden note for the teacher, in Turkish.');
    satirlar.push('The student never sees this part.');
    satirlar.push('Judge ONLY the student\'s latest message. Did it actually produce this structure: ' +
      scene.target + '?');
    if (scene.structureNote) {
      satirlar.push('Definition of the structure: ' + scene.structureNote);
    }
    satirlar.push('Write exactly two lines, nothing more:');
    satirlar.push('TESPIT: evet');
    satirlar.push('NOT: one short sentence in Turkish explaining why');
    satirlar.push('(Write "TESPIT: hayir" instead if the structure was not produced.)');
  } else {
    satirlar.push('PART 2 (after ' + AYIRAC + '): write exactly these two lines:');
    satirlar.push('TESPIT: hayir');
    satirlar.push('NOT: Bu sahne için hedef yapı tanımlı değil.');
  }

  satirlar.push('');
  satirlar.push('Never mention this format, the separator, or the hidden note inside PART 1.');

  return satirlar.join('\n');
}

// ─── Tek çağrı ───────────────────────────────────────────────────────────────

async function tekCagriYap(scene, character, gecmis, ogrenciMesaji, apiKey) {
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

  console.log('[SURE] TEK CAGRI — Gemini cagrisi gonderiliyor | ' + contents.length +
    ' tur | istek ' + istekGovdesi.length + ' karakter');

  let cevap;
  try {
    cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: istekGovdesi
    });
  } catch (hata) {
    sureYaz('TEK CAGRI — BAGLANTI HATASI', baslangic, hata.message);
    throw hata;
  }

  sureYaz('TEK CAGRI — Gemini yanit basligi geldi', baslangic, 'HTTP ' + cevap.status);

  const sonuc = await cevap.json();

  sureYaz('TEK CAGRI — Gemini govdesi okundu', baslangic);

  if (!cevap.ok) {
    sureYaz('TEK CAGRI — Gemini HATA dondu', baslangic,
      (sonuc.error && sonuc.error.message) || 'sebep belirtilmemis');
    throw new Error((sonuc.error && sonuc.error.message) || 'Cevap alınamadı');
  }

  const hamMetin = (sonuc.candidates &&
    sonuc.candidates[0] &&
    sonuc.candidates[0].content &&
    sonuc.candidates[0].content.parts &&
    sonuc.candidates[0].content.parts[0] &&
    sonuc.candidates[0].content.parts[0].text) || '';

  const ayrilmis = cevabiAyir(hamMetin);

  sureYaz('TEK CAGRI — BITTI', baslangic,
    'cevap ' + ayrilmis.karakterCevabi.length + ' karakter | tespit: ' +
    (ayrilmis.tespitEdildi ? 'evet' : 'hayir') +
    (ayrilmis.bicimBozuk ? ' | UYARI: model bicime uymadi' : ''));

  return ayrilmis;
}

// ─── Cevabı ikiye ayırma (bağışlayıcı ayrıştırma) ────────────────────────────
//
// Amaç: model biçime uymasa bile öğrenci mutlaka bir cevap görsün.

function cevabiAyir(hamMetin) {
  const metin = (hamMetin || '').trim();

  if (!metin) {
    return { karakterCevabi: '', tespitEdildi: false, not: '', bicimBozuk: true };
  }

  const ayiracYeri = metin.indexOf(AYIRAC);

  if (ayiracYeri === -1) {
    // Model ayıracı yazmamış. Metinden değerlendirme satırlarını temizleyip
    // geri kalanını karakterin cevabı olarak kullan.
    const temiz = metin
      .split('\n')
      .filter(function (satir) {
        return !/^\s*(TESPIT|NOT)\s*:/i.test(satir);
      })
      .join('\n')
      .trim();

    const tespit = /TESPIT:\s*evet/i.test(metin);
    const notEslesme = metin.match(/NOT:\s*(.+)/i);

    return {
      karakterCevabi: temiz || metin,
      tespitEdildi: tespit,
      not: notEslesme ? notEslesme[1].trim() : '',
      bicimBozuk: true
    };
  }

  const onceki = metin.slice(0, ayiracYeri).trim();
  const sonraki = metin.slice(ayiracYeri + AYIRAC.length).trim();

  const tespitEdildi = /TESPIT:\s*evet/i.test(sonraki);
  const notEslesme = sonraki.match(/NOT:\s*(.+)/i);

  return {
    karakterCevabi: onceki,
    tespitEdildi: tespitEdildi,
    not: notEslesme ? notEslesme[1].trim() : '',
    bicimBozuk: !onceki
  };
}
