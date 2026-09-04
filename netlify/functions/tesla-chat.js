// netlify/functions/tesla-chat.js
//
// Bu dosya, öğrencinin yazdığı cümleyi alıp iki iş yapar:
// 1) Sahne bilgisini (karakter, hedef yapı) Google Sheets'ten (CSV) okur
// 2) Tesla karakteri olarak sınırlandırılmış bir cevap üretir, aynı anda cümledeki
//    hedef yapının doğru kullanılıp kullanılmadığını ayrı bir çağrıyla değerlendirir
//
// API anahtarı Netlify'ın ortam değişkenlerinden (GEMINI_API_KEY) okunur, kodun içinde hiç yazılı değildir.
// Sahne verisi kod içinde değil, aşağıdaki CSV linkindeki Sheet'te tutulur - yeni sahne eklemek
// için Sheet'e satır eklemen yeterli, bu dosyaya dokunmana gerek yok.

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const SAHNELER_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyUn04bfVniB3QdyqiQjLsHJ5KL_oQ7otMr9hzcCIfgxGYK8WWGbOzwA9V63ADi7qelLIXkZHZjJJ1/pub?gid=312674251&single=true&output=csv';

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

  const ogrenciMesaji = istek.ogrenciMesaji;
  const konusmaGecmisi = istek.konusmaGecmisi || []; // [{ kimden: 'ogrenci' | 'tesla', metin: '...' }, ...]
  const sceneId = istek.sceneId || 'tesla-type3'; // hangi sahnenin oynandığı, frontend'den gelir

  if (!ogrenciMesaji || typeof ogrenciMesaji !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'ogrenciMesaji eksik veya geçersiz' }) };
  }

  try {
    const sahne = await sahneBilgisiniGetir(sceneId);
    if (!sahne) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Sahne bulunamadı: ' + sceneId }) };
    }

    const [teslaCevabi, yapiSonucu] = await Promise.all([
      karakterCevabiUret(sahne, ogrenciMesaji, konusmaGecmisi, apiKey),
      yapiTespitiYap(sahne, ogrenciMesaji, apiKey)
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        teslaCevabi: teslaCevabi,
        yapiTespitEdildi: yapiSonucu.tespitEdildi,
        yapiNotu: yapiSonucu.not
      })
    };
  } catch (hata) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'İşlem başarısız oldu', detay: hata.message })
    };
  }
};

// --- Sheets'ten sahne bilgisi okuma ---

async function sahneBilgisiniGetir(sceneId) {
  const cevap = await fetch(SAHNELER_CSV_URL);
  if (!cevap.ok) {
    throw new Error('Sahneler CSV okunamadı (HTTP ' + cevap.status + ')');
  }
  const csvMetni = await cevap.text();
  const satirlar = csvAyristir(csvMetni);

  if (satirlar.length < 2) {
    throw new Error('Sahneler CSV boş görünüyor');
  }

  const basliklar = satirlar[0];
  const sceneIdIndex = basliklar.indexOf('sceneId');

  for (let i = 1; i < satirlar.length; i++) {
    const satir = satirlar[i];
    if (satir[sceneIdIndex] === sceneId) {
      const sahne = {};
      basliklar.forEach(function (baslik, index) {
        sahne[baslik] = satir[index];
      });
      return sahne;
    }
  }

  return null;
}

// Basit ama tırnak içi virgül/çift tırnak durumlarını doğru işleyen bir CSV ayrıştırıcı
function csvAyristir(metin) {
  const satirlar = [];
  let satir = [];
  let hucre = '';
  let tirnakIcinde = false;

  for (let i = 0; i < metin.length; i++) {
    const karakter = metin[i];
    const sonraki = metin[i + 1];

    if (tirnakIcinde) {
      if (karakter === '"' && sonraki === '"') {
        hucre += '"';
        i++;
      } else if (karakter === '"') {
        tirnakIcinde = false;
      } else {
        hucre += karakter;
      }
    } else {
      if (karakter === '"') {
        tirnakIcinde = true;
      } else if (karakter === ',') {
        satir.push(hucre);
        hucre = '';
      } else if (karakter === '\n' || karakter === '\r') {
        if (karakter === '\r' && sonraki === '\n') i++;
        satir.push(hucre);
        satirlar.push(satir);
        satir = [];
        hucre = '';
      } else {
        hucre += karakter;
      }
    }
  }

  if (hucre.length > 0 || satir.length > 0) {
    satir.push(hucre);
    satirlar.push(satir);
  }

  return satirlar.filter(function (s) {
    return s.length > 1 || (s.length === 1 && s[0] !== '');
  });
}

// --- Gemini çağrıları ---

async function karakterCevabiUret(sahne, ogrenciMesaji, konusmaGecmisi, apiKey) {
  const contents = konusmaGecmisi.map(function (tur) {
    return {
      role: tur.kimden === 'ogrenci' ? 'user' : 'model',
      parts: [{ text: tur.metin }]
    };
  });
  contents.push({ role: 'user', parts: [{ text: ogrenciMesaji }] });

  const cevap = await fetch(GEMINI_API_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sahne.karakterPromptu }] },
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

async function yapiTespitiYap(sahne, ogrenciMesaji, apiKey) {
  const kontrolPromptu =
    'Aşağıdaki öğrenci cümlesinde "' + sahne.hedefYapi + '" yapısı doğru kullanılmış mı, değerlendir.\n' +
    'Yapı açıklaması: ' + sahne.hedefYapiAciklama + '\n' +
    'Öğrenci cümlesi: "' + ogrenciMesaji + '"\n\n' +
    'Sadece şu formatta, başka hiçbir açıklama eklemeden cevap ver:\n' +
    'TESPIT: evet veya hayır\n' +
    'NOT: bir cümlelik kısa gerekçe (Türkçe)';

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
