# Dikte (Dictation) Özelliği — Entegrasyon Notları

Bu klasördeki `dikte-pratik.html` (öğretmen/hazırlama aracı) ve `dikte-ogrenci.html`
(öğrenci pratiği) Claude.ai sohbetinde adım adım geliştirilip test edildi. Buradaki
mantık, `App.tsx` içindeki mevcut `DictationView`'a taşınmalı — görsel tasarım
(kartlar, renkler, success/error state'leri) zaten oradaki App.tsx'te var ve büyük
ölçüde bizim mantığımızla örtüşüyor. Eksik olan iki şey:

## 1) Tek cümle değil, segment listesi

Şu an `DictationView`, `unit.dictationSentence` adında **tek bir cümle** üzerinden
çalışıyor. Bunun yerine bir `Unit`'in bir dizi segment'i olmalı:

```ts
interface DictationSegment {
  start: number   // saniye
  end: number      // saniye
  text: string     // referans cümle
}
```

Kullanıcı segment listesinde ilerler (İleri/Geri), her segment kendi ses aralığını
çalar ve kendi doğru/yanlış durumunu tutar — `dikte-ogrenci.html` içindeki
`curIndex`, `answered[]`, `correctCount` state'lerine bakılabilir.

## 2) Gerçek ses oynatma

`MiniPlayer` şu an `setInterval` ile sahte ilerliyor, gerçek `<audio>` etiketine
bağlı değil. Gerçek segment oynatma mantığı `dikte-ogrenci.html` içindeki
`playSegment()` fonksiyonunda: `audio.currentTime = segment.start`, `play()`,
`timeupdate` event'inde `segment.end`'e gelince `pause()`. `MiniPlayer`'ın
scrubber/hız/rewind-forward arayüzü olduğu gibi kalabilir, sadece gerçek
`<audio>` state'ine bağlanmalı.

## 3) Kontrol mantığı — maskeli ipucu

`dikte-ogrenci.html` içindeki `maskedHint()` fonksiyonu referans:
- Kullanıcının yazdığıyla doğru cümleyi kelime kelime, normalize ederek
  (küçük harf, noktalama temizlenmiş) baştan karşılaştırır.
- İlk uyuşmayan noktaya kadar olan kelimeler düz metin gösterilir.
- Uyuşmadığı ilk doğru kelime **yeşil/kalın** olarak ipucu verilir.
- Ondan sonraki kelimeler harf sayısı kadar `*` ile maskelenir (noktalama dahil).
- Tamamen doğruysa: yeşil "Doğru!" durumu.

Bu mantık `App.tsx` içindeki mevcut `compareWords()`/`maskWord()` fonksiyonlarına
çok yakın zaten — muhtemelen doğrudan uyarlanabilir, üzerine ekstra bir versiyon
yazmaya gerek olmayabilir. İkisini karşılaştırıp hangisi kalacaksa ona karar
verilmeli.

## 4) Ayarlar

İki toggle: "Yanlışta ipucu göster" (varsayılan açık, maskeli ipucu) ve
"Yanlışta tam cevabı göster" (varsayılan kapalı, tam cümleyi gösterir).

## 5) Klavye kısayolları

- `Enter`: ilk basışta kontrol eder; cevap doğruysa **ikinci** `Enter` sıradaki
  segmente geçer (aynı davranışı "İleri" butonu da yapar).
- `Ctrl+R`: focus yazı kutusunda olsa bile geçerli segmenti tekrar çalar
  (düz `R` kullanılmadı çünkü kullanıcı cümlede "r" harfi yazabilir).
- `←` / `→`: önceki/sonraki segment.

## 6) İçerik hazırlama tarafı (öğretmen — sen)

`dikte-pratik.html` şunları destekliyor, bunlar App.tsx tarafına taşınmayabilir
(muhtemelen ayrı, sadece senin kullanacağın bir "içerik hazırlama" aracı olarak
kalması daha mantıklı — öğrenciye gitmeyecek):
- Ses/video dosyası + transkript (satır satır) yükleme.
- Elle segment işaretleme (Boşluk tuşuyla, dinlerken).
- `.srt`/`.vtt` altyazı dosyasından otomatik segment içe aktarma (zaman kodları
  altyazıdan direkt okunuyor, elle işaretlemeye gerek kalmıyor).
- Hazır segmentleri `.json` olarak dışa aktarma — bu JSON, `Unit` verisinin
  `segments` alanına konacak veri.

Örnek segment verisi: `dikte-segmentleri.json` (working-in-my-yard.mp3 için,
otomatik hizalanmış — sessizlik tespiti + kelime sayısı oranıyla tahmin edildi,
kulakla doğrulanmadı, küçük kaymalar olabilir).

## Renk/görsel

Şimdilik dokunulmadı — App.tsx'teki mevcut tasarım sistemi (indigo/yeşil,
Outfit/Inter/DM Mono) korunmalı. Önce fonksiyonel entegrasyon, görsel revizyon
sonra.
