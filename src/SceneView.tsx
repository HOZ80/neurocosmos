import { useState, useRef, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneCharacter {
  code: string
  name: string
  who: string
  copyright: string
  personality: string
  speechLimits: string
  wontSay: string
  goal: string
  visualNote: string
}

export interface Scene {
  code: string
  title: string
  unit: string
  target: string
  locked: boolean
  place: string
  bgImage: string
  bgImageGiris: string
  bgImageSelamlama: string
  bgImageTepki: string
  bgImageAlistirma: string
  bgImageUretim: string
  bgImageKapanis: string
  bgImageKayit: string
  situation: string
  studentReason: string
  characterExpectation: string
  exitReason: string
  openingLine: string
  fadedLine: string
  repeatReaction: string
  drillReason: string
  drillType: string
  cues: string[]
  answers: string[]
  interjections: string[]
  productionQuestion: string
  structureNote: string
  exampleAnswers: string[]
  closingReaction: string
  exitStyle: string
  exitLine: string
  nextScene: string
  characterCode: string
}

export type SceneSheetData = {
  scenes: Scene[]
  characters: Record<string, SceneCharacter>
}

// ─── Sheet parsing ────────────────────────────────────────────────────────────
// Sahneler sekmesi sütunları: sahne_kodu, sahne_basligi, unite, hedef_yapi,
// kilit, mekan, arkaplan_gorsel, durum, ogrenci_gerekcesi, karakter_beklentisi,
// cikis_gerekcesi, acilis_replik, silik_cevap, tekrar_tepkisi, drill_gerekce,
// drill_tipi, uyaranlar, beklenen_cevaplar, ara_tepkiler, uretim_sorusu,
// yapi_tanimi, ornek_cevaplar, kapanis_tepkisi, cikis_bicimi, cikis_replik,
// sonraki_sahne, karakter_kodu, arkaplan_gorsel_giris, arkaplan_gorsel_selamlama,
// arkaplan_gorsel_tepki, arkaplan_gorsel_alistirma, arkaplan_gorsel_uretim,
// arkaplan_gorsel_kapanis, arkaplan_gorsel_kayit
//
// Aşama başına arka plan sütunları boş bırakılabilir — boşsa, o aşama kendinden
// önceki dolu aşamanın görselini kullanmaya devam eder (bkz. resolveBgImage).

function splitPipe(str: string | undefined): string[] {
  if (!str) return []
  return str.split('|').map(s => s.trim()).filter(Boolean)
}

export function parseSceneRows(rows: Record<string, string>[]): Scene[] {
  return rows
    .filter(r => (r.sahne_kodu || '').trim() !== '')
    .map(r => ({
      code: r.sahne_kodu || '',
      title: r.sahne_basligi || 'Sahne',
      unit: r.unite || '',
      target: r.hedef_yapi || '',
      locked: (r.kilit || '').toLowerCase().startsWith('kapal'),
      place: r.mekan || '',
      bgImage: r.arkaplan_gorsel || '',
      bgImageGiris: r.arkaplan_gorsel_giris || '',
      bgImageSelamlama: r.arkaplan_gorsel_selamlama || '',
      bgImageTepki: r.arkaplan_gorsel_tepki || '',
      bgImageAlistirma: r.arkaplan_gorsel_alistirma || '',
      bgImageUretim: r.arkaplan_gorsel_uretim || '',
      bgImageKapanis: r.arkaplan_gorsel_kapanis || '',
      bgImageKayit: r.arkaplan_gorsel_kayit || '',
      situation: r.durum || '',
      studentReason: r.ogrenci_gerekcesi || '',
      characterExpectation: r.karakter_beklentisi || '',
      exitReason: r.cikis_gerekcesi || '',
      openingLine: r.acilis_replik || '',
      fadedLine: r.silik_cevap || '',
      repeatReaction: r.tekrar_tepkisi || '',
      drillReason: r.drill_gerekce || '',
      drillType: r.drill_tipi || '',
      cues: splitPipe(r.uyaranlar),
      answers: splitPipe(r.beklenen_cevaplar),
      interjections: splitPipe(r.ara_tepkiler),
      productionQuestion: r.uretim_sorusu || '',
      structureNote: r.yapi_tanimi || '',
      exampleAnswers: splitPipe(r.ornek_cevaplar),
      closingReaction: r.kapanis_tepkisi || '',
      exitStyle: r.cikis_bicimi || 'çıkış',
      exitLine: r.cikis_replik || '',
      nextScene: r.sonraki_sahne || '',
      characterCode: r.karakter_kodu || '',
    }))
}

export function parseCharacterRows(rows: Record<string, string>[]): Record<string, SceneCharacter> {
  const out: Record<string, SceneCharacter> = {}
  rows
    .filter(r => (r.karakter_kodu || '').trim() !== '')
    .forEach(r => {
      out[r.karakter_kodu] = {
        code: r.karakter_kodu,
        name: r.ad || 'Karakter',
        who: r.kim || '',
        copyright: r.telif_durumu || '',
        personality: r.kisilik || '',
        speechLimits: r.konusma_sinirlari || '',
        wontSay: r.soylemeyecekleri || '',
        goal: r.amaci || '',
        visualNote: r.gorsel_not || '',
      }
    })
  return out
}

// ─── Fallback: Sheet bağlanmadan da çalışsın ─────────────────────────────────
// SCENE_SHEET_CSV_URL boşsa ya da fetch başarısız olursa bu veri kullanılır.

export const FALLBACK_SCENE_DATA: SceneSheetData = {
  scenes: [{
    code: 'sahne-01',
    title: 'Yırtılmış Sayfa',
    unit: 'Çalışma Notu 1',
    target: 'Type 3 Conditional',
    locked: false,
    place: 'kütüphane',
    bgImage: '',
    bgImageGiris: '',
    bgImageSelamlama: '',
    bgImageTepki: '',
    bgImageAlistirma: '',
    bgImageUretim: '',
    bgImageKapanis: '',
    bgImageKayit: '',
    situation: 'Tesla kalenin kütüphanesinde, gece geç saatte, masasında dağınık kâğıtlarla oturuyor.',
    studentReason: 'Öğrenci kalede konaklıyor ve uyuyamıyor. Koridorda tek yanan ışık burası.',
    characterExpectation: 'Tesla kendi kararı hakkında dışarıdan bir yargı istiyor.',
    exitReason: 'Tesla kuleye çıkacağını söyleyip öğrenciyi de çağırıyor.',
    openingLine: 'Come in. The door was never locked. I do not sleep much these days.',
    fadedLine: 'Good evening, Mr Tesla. I saw the light under your door.',
    repeatReaction: 'Then you are the first visitor in a long time. Sit down. I need another mind in this room.',
    drillReason: 'There are lines in this notebook I wrote as facts. Turn each one around for me, and say what would not have happened.',
    drillType: 'Transformation',
    cues: [
      'You tore up the contract. You lost a fortune.',
      'The laboratory burned in 1895. Your notes disappeared.',
      'Morgan stopped the funding. The tower stayed unfinished.',
      'You worked alone. Nobody defended your ideas.',
      "You left Edison's company. You built your own system.",
    ],
    answers: [
      "If you hadn't torn up the contract, you wouldn't have lost a fortune.",
      "If the laboratory hadn't burned in 1895, your notes wouldn't have disappeared.",
      "If Morgan hadn't stopped the funding, the tower wouldn't have stayed unfinished.",
      "If you hadn't worked alone, somebody would have defended your ideas.",
      "If you hadn't left Edison's company, you wouldn't have built your own system.",
    ],
    interjections: [
      'Yes. That is the sentence I could not write myself.',
      'Read it again, slowly.',
      'You see how the past changes shape when you turn it around?',
      'Go on. There is one more line.',
      'Enough of the notebook.',
    ],
    productionQuestion: 'Now the question I cannot answer alone. That night, I held the contract in my hands. If you had been in my place, what would you have done, and what would have happened?',
    structureNote: 'Cevapta iki parça birlikte bulunmalı: geçmişte gerçekleşmemiş bir koşul ve onun gerçekleşmemiş sonucu.',
    exampleAnswers: [
      'If I had been in your place, I would have kept the contract.',
      'If I had kept the paper, I would have finished the tower.',
    ],
    closingReaction: 'Thank you. I have turned that night over for forty years and never heard it said aloud. Come, the sky is clearing, and there is something on the tower you should see.',
    exitStyle: 'kule merdiveni',
    exitLine: 'Take the lamp. The steps are older than both of us.',
    nextScene: '',
    characterCode: 'kar-tesla',
  }],
  characters: {
    'kar-tesla': {
      code: 'kar-tesla',
      name: 'Nikola Tesla',
      who: 'Elektrik akımı üzerine çalışmış, buluşlarının çoğunu tamamlayamadan bırakmış bir mucit.',
      copyright: 'kamu malı tarihi kişi (1856-1943)',
      personality: 'Nazik ama mesafeli. Resmî konuşur, kısa cümleler kurar.',
      speechLimits: 'B1-B2 seviyesinde, kısa ve düz cümleler.',
      wontSay: 'Hedef cümleyi öğrenciye söylemez. Türkçe konuşmaz.',
      goal: 'O gece verdiği kararın doğru olup olmadığını başka birinin ağzından duymak istiyor.',
      visualNote: 'Elli yaşlarında, uzun boylu, ince. Koyu takım.',
    },
  },
}

// ─── Küçük yardımcılar ────────────────────────────────────────────────────────

function useSpeech() {
  const [enabled, setEnabled] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  function speak(text: string) {
    if (!enabled || !supported || !text) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-GB'
      u.rate = 0.9
      u.pitch = 0.9
      window.speechSynthesis.speak(u)
    } catch { /* sessizce geç */ }
  }

  function stop() {
    try { window.speechSynthesis?.cancel() } catch { /* yoksay */ }
  }

  return { enabled, setEnabled, speak, stop, supported }
}

const ACCENT = '#B45309'
const ACCENT_BG = '#FEF3C7'

// ─── Tam sayfa görsel panel: sabit okunurluk renkleri ──────────────────────
// Panelin arkası her zaman koyu bir gradyan olduğu için (hangi görsel gelirse
// gelsin), buradaki metin renkleri siteye göre değişen var(--foreground) gibi
// değişkenlere değil, sabit açık renklere bağlanıyor.
const PANEL_TEXT = '#F5F0E6'
const PANEL_MUTED = 'rgba(245, 240, 230, 0.68)'
const PANEL_ACCENT = '#F0B457'
const PANEL_BORDER = 'rgba(245, 240, 230, 0.22)'

// ─── Atmosfer efektleri: ışık titremesi + yavaş sis ─────────────────────────
// Ekstra dosya veya kütüphane gerektirmez, sadece CSS animasyonu. Hareket
// hassasiyeti olan kullanıcılar için prefers-reduced-motion'da kapanır.
const ATMOSPHERE_CSS = `
.ncsm-scene-flicker {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  animation: ncsmFlicker 5.5s ease-in-out infinite;
}
@keyframes ncsmFlicker {
  0%, 100% { opacity: 0.55; }
  20% { opacity: 0.90; }
  35% { opacity: 0.40; }
  50% { opacity: 0.75; }
  65% { opacity: 0.50; }
  80% { opacity: 0.95; }
}
.ncsm-scene-fog {
  position: absolute; left: -20%; right: -20%;
  z-index: 1; pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, rgba(230,230,235,0.42) 25%, rgba(230,230,235,0.55) 50%, rgba(230,230,235,0.42) 75%, transparent 100%);
  filter: blur(6px);
  animation: ncsmFog 22s linear infinite;
}
@keyframes ncsmFog {
  0% { transform: translateX(-10%); }
  100% { transform: translateX(10%); }
}
@media (prefers-reduced-motion: reduce) {
  .ncsm-scene-flicker, .ncsm-scene-fog { animation: none; }
}
.ncsm-bubble {
  position: relative;
  background: #F3E8D3;
  border: 1.5px solid #8B5A2B;
  border-radius: 18px;
  padding: 14px 18px;
  max-width: 78%;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
}
.ncsm-bubble::after {
  content: '';
  position: absolute;
  left: 28px;
  bottom: -13px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 14px 14px 0 0;
  border-color: #F3E8D3 transparent transparent transparent;
  filter: drop-shadow(1px 2px 1px rgba(0,0,0,0.25));
}
.ncsm-bubble--tail-right::after { left: auto; right: 28px; border-width: 14px 0 0 14px; border-color: transparent transparent transparent #F3E8D3; }
.ncsm-bubble--tail-center::after { left: 50%; transform: translateX(-50%); }
`

// ─── Aşama başına arka plan görseli çözümü ──────────────────────────────────
// Boş bırakılan aşamalar, kendinden önceki dolu aşamanın görselini kullanır.
// Hiçbiri doluysa eski tekil arkaplan_gorsel'e, o da boşsa varsayılan gradyana düşer.

const STAGE_ORDER = ['intro', 'greeting', 'reaction', 'drill', 'production', 'closing', 'record'] as const

// ─── Gemini bağlantısı anahtarı ──────────────────────────────────────────────
// false yaparsan "Söyle" butonu API'ye hiç gitmez, yerine sabit bir test
// cevabı gösterir. Faturalandırma/kota netleşince true yapman yeterli —
// başka hiçbir şeyi değiştirmene gerek yok.
const AI_BAGLANTISI_AKTIF = false

function stageBgField(scene: Scene, stage: typeof STAGE_ORDER[number]): string {
  switch (stage) {
    case 'intro': return scene.bgImageGiris
    case 'greeting': return scene.bgImageSelamlama
    case 'reaction': return scene.bgImageTepki
    case 'drill': return scene.bgImageAlistirma
    case 'production': return scene.bgImageUretim
    case 'closing': return scene.bgImageKapanis
    case 'record': return scene.bgImageKayit
  }
}

function resolveStageVisualRaw(scene: Scene, stage: typeof STAGE_ORDER[number]): string {
  const idx = STAGE_ORDER.indexOf(stage)
  for (let i = idx; i >= 0; i--) {
    const val = stageBgField(scene, STAGE_ORDER[i])
    if (val) return val
  }
  return scene.bgImage || ''
}

// ─── Hücre biçimi: dosya.webp|konum|efekt|efekt-konumu ───
// Dört parça da her zaman yazılır. Bir parça bu sahnede uygulanmıyorsa,
// boş bırakmak yerine değeri açıkça "yok" yazılır — örn: gorsel.webp|yok|sis|orta-ust
// konum alanına "yok" yazılırsa o aşamada baloncuk hiç gösterilmez.
// Baloncuğun konumu ile atmosfer efekti birbirinden bağımsızdır, aynı sütunda
// yan yana durabilirler ama biri diğerini etkilemez.

type BubblePos = 'sol-ust' | 'sag-ust' | 'orta-ust' | 'sol-alt' | 'sag-alt' | 'orta-alt'
type EfektTipi = 'yok' | 'sis' | 'isik'

const GECERLI_KONUMLAR: BubblePos[] = ['sol-ust', 'sag-ust', 'orta-ust', 'sol-alt', 'sag-alt', 'orta-alt']

type StageVisual = { image: string; konum: BubblePos; konumGizli: boolean; efekt: EfektTipi; efektKonum: BubblePos }

// "yok" her dört parça için de geçerli, açık bir boş değer işaretidir — parça
// hiç yazılmamış gibi boş bırakmak yerine, o parçanın kasıtlı olarak
// uygulanmadığını belirtir. Dördü de her zaman tam yazılmalıdır:
// dosya.webp|konum|efekt|efekt-konumu  (uygulanmayan parça: yok)
function parseStageVisual(raw: string): StageVisual {
  const parts = (raw || '').split('|').map(s => s.trim())
  const imageRaw = parts[0] || ''
  const image = imageRaw.toLowerCase() === 'yok' ? '' : imageRaw
  const konumRaw = (parts[1] || '').toLowerCase()
  const konumGizli = konumRaw === 'yok'
  const konum: BubblePos = GECERLI_KONUMLAR.includes(konumRaw as BubblePos) ? (konumRaw as BubblePos) : 'sol-alt'
  const efektRaw = (parts[2] || '').toLowerCase()
  const efektKonumRaw = (parts[3] || '').toLowerCase()
  const efekt: EfektTipi = (efektRaw === 'sis' || efektRaw === 'isik') ? efektRaw : 'yok'
  // Efekt konumu yazılmamışsa (veya "yok" ise), efekt tipine göre makul bir varsayılana düş.
  const efektVarsayilan: BubblePos = efekt === 'sis' ? 'orta-ust' : 'sol-ust'
  const efektKonum: BubblePos = GECERLI_KONUMLAR.includes(efektKonumRaw as BubblePos) ? (efektKonumRaw as BubblePos) : efektVarsayilan
  return { image, konum, konumGizli, efekt, efektKonum }
}

function resolveStageVisual(scene: Scene, stage: typeof STAGE_ORDER[number]): StageVisual {
  return parseStageVisual(resolveStageVisualRaw(scene, stage))
}

// Baloncuğun köşeye yaslanma stili. Üst şeritle (Back + sahne seçici) ve
// alt panelle çakışmaması için sabit bir boşluk payı bırakılıyor.
function bubbleAnchorStyle(konum: BubblePos): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', zIndex: 3, maxWidth: '78%' }
  switch (konum) {
    case 'sol-ust': return { ...base, top: '92px', left: '20px' }
    case 'sag-ust': return { ...base, top: '92px', right: '20px' }
    case 'orta-ust': return { ...base, top: '92px', left: '50%', transform: 'translateX(-50%)' }
    case 'sol-alt': return { ...base, bottom: '200px', left: '20px' }
    case 'sag-alt': return { ...base, bottom: '200px', right: '20px' }
    case 'orta-alt': return { ...base, bottom: '200px', left: '50%', transform: 'translateX(-50%)' }
  }
}

function bubbleTailClass(konum: BubblePos): string {
  if (konum === 'sag-ust' || konum === 'sag-alt') return 'ncsm-bubble ncsm-bubble--tail-right'
  if (konum === 'orta-ust' || konum === 'orta-alt') return 'ncsm-bubble ncsm-bubble--tail-center'
  return 'ncsm-bubble'
}

// Işık efekti tek bir noktadan yayılan bir parıltı olduğu için altı konumun
// hepsi farklı bir merkez noktasına karşılık geliyor.
function flickerStyle(konum: BubblePos): React.CSSProperties {
  const merkezler: Record<BubblePos, [string, string]> = {
    'sol-ust': ['25%', '20%'], 'sag-ust': ['75%', '20%'], 'orta-ust': ['50%', '15%'],
    'sol-alt': ['25%', '80%'], 'sag-alt': ['75%', '80%'], 'orta-alt': ['50%', '85%'],
  }
  const [x, y] = merkezler[konum]
  return { background: `radial-gradient(55% 45% at ${x} ${y}, rgba(255,200,120,0.55) 0%, rgba(255,200,120,0) 70%)` }
}

// Sis zaten ekranın tamamı genişliğinde bir şerit; konum sadece üstte mi
// altta mı duracağını belirliyor, sağ/sol farkı önemli değil.
function fogStyle(konum: BubblePos): React.CSSProperties {
  return konum.endsWith('ust') ? { top: 0, height: '55%' } : { bottom: 0, height: '55%' }
}

function SceneButton({ children, onClick, primary = false, disabled = false }: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? ACCENT : 'var(--card)',
        color: primary ? '#fff' : 'var(--foreground)',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: '9px',
        padding: '9px 18px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        marginRight: '10px',
        transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

// ─── SceneView ────────────────────────────────────────────────────────────────

type Stage = 'intro' | 'greeting' | 'reaction' | 'drill' | 'production' | 'closing' | 'record'

type ChatTurn = { from: 'ogrenci' | 'karakter'; text: string }

export default function SceneView({ scenes, characters, onBack }: {
  scenes: Scene[]
  characters: Record<string, SceneCharacter>
  onBack: () => void
}) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [stage, setStage] = useState<Stage>('intro')
  const [drillIndex, setDrillIndex] = useState(0)
  const [drillText, setDrillText] = useState('')
  const [drillRevealed, setDrillRevealed] = useState(false)
  const [drillLog, setDrillLog] = useState<{ cue: string; answer: string }[]>([])
  const [productionText, setProductionText] = useState('')
  const [productionLog, setProductionLog] = useState('')
  const [fadedRevealed, setFadedRevealed] = useState(false)
  const [error, setError] = useState('')

  // Canlı konuşma (desteksiz üretim aşaması)
  const [chatLog, setChatLog] = useState<ChatTurn[]>([])
  const [verdicts, setVerdicts] = useState<{ sentence: string; ok: boolean; note: string }[]>([])
  const [sending, setSending] = useState(false)

  const { enabled, setEnabled, speak, stop, supported } = useSpeech()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => stop(), [])

  const scene = scenes[sceneIndex]

  if (!scene) {
    return (
      <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: 0, textAlign: 'left' }}>← Back</button>
        <p style={{ color: 'var(--muted-foreground)' }}>Bu ünite için henüz sahne eklenmemiş.</p>
      </div>
    )
  }

  const character = characters[scene.characterCode]
  const characterName = character?.name ?? 'Karakter'

  function go(next: Stage, line?: string) {
    setStage(next)
    setError('')
    if (line) speak(line)
  }

  function handleDrill() {
    if (drillRevealed) {
      setDrillLog(log => [...log, { cue: scene.cues[drillIndex], answer: drillText }])
      setDrillText('')
      setDrillRevealed(false)
      const next = drillIndex + 1
      if (next >= scene.cues.length) {
        go('production', scene.productionQuestion)
      } else {
        setDrillIndex(next)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } else {
      setDrillRevealed(true)
      speak(scene.interjections[drillIndex] ?? '')
    }
  }

  async function sendProduction() {
    const mesaj = productionText.trim()
    if (!mesaj) { setError('Önce bir cümle yaz.'); return }
    if (sending) return

    setSending(true)
    setError('')
    const gecmis = chatLog
    setChatLog(log => [...log, { from: 'ogrenci', text: mesaj }])
    setProductionText('')
    if (!productionLog) setProductionLog(mesaj)

    if (!AI_BAGLANTISI_AKTIF) {
      setChatLog(log => [...log, { from: 'karakter', text: '(AI kapalı — test modu)' }])
      setVerdicts(v => [...v, {
        sentence: mesaj,
        ok: false,
        note: 'AI kapalı — test modu, değerlendirme yapılmadı.',
      }])
      setSending(false)
      return
    }

    try {
      const res = await fetch('/.netlify/functions/scene-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, character, gecmis, ogrenciMesaji: mesaj }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detay || data.error || 'Cevap alınamadı. Tekrar dener misin?')
      } else {
        const reply: string = data.karakterCevabi || ''
        if (reply) {
          setChatLog(log => [...log, { from: 'karakter', text: reply }])
          speak(reply)
        }
        setVerdicts(v => [...v, {
          sentence: mesaj,
          ok: !!data.yapiTespitEdildi,
          note: data.yapiNotu || '',
        }])
      }
    } catch {
      setError('Bağlantı kurulamadı. Tekrar dener misin?')
    } finally {
      setSending(false)
    }
  }

  function restart() {
    stop()
    setStage('intro')
    setDrillIndex(0)
    setDrillText('')
    setDrillRevealed(false)
    setDrillLog([])
    setProductionText('')
    setProductionLog('')
    setFadedRevealed(false)
    setError('')
    setChatLog([])
    setVerdicts([])
    setSending(false)
  }

  const visual = resolveStageVisual(scene, stage)
  const bubbleClass = bubbleTailClass(visual.konum)
  const bubbleStyle = bubbleAnchorStyle(visual.konum)

  // Baloncuğun bu aşamada gösterilecek metni. Panelin içindeki akıştan bağımsız
  // olarak, doğrudan görselin üzerine (konum kodunun gerçekten göre olduğu
  // çerçeveye) yerleştirilebilmesi için burada, tek bir yerde hesaplanıyor.
  const bubbleText: string | null =
    stage === 'greeting' ? scene.openingLine :
    stage === 'reaction' ? scene.repeatReaction :
    stage === 'drill' ? scene.cues[drillIndex] :
    stage === 'production' ? (() => {
      const karakterTurns = chatLog.filter(t => t.from === 'karakter')
      return karakterTurns.length > 0 ? karakterTurns[karakterTurns.length - 1].text : scene.productionQuestion
    })() :
    stage === 'closing' ? scene.closingReaction :
    null

  const dialogueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    lineHeight: 1.65,
    color: PANEL_TEXT,
    margin: '0 0 20px',
  }
  const mutedStyle: React.CSSProperties = { color: PANEL_MUTED }
  // Baloncuğun zemini krem olduğu için içindeki metin koyu olmalı — panel
  // metinlerinden (açık renk) ayrı, sadece baloncuk içinde kullanılıyor.
  const bubbleTextStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    lineHeight: 1.6,
    color: '#3A2A1A',
  }

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{ATMOSPHERE_CSS}</style>

      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: '0 0 6px' }}>{scene.title}</h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{scene.target}</p>
      </div>

      {/* Tam sayfa, atmosferik sahne alanı — kart çerçevesi yok, kenar yuvarlaması yok */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        background: visual.image
          ? `center/cover no-repeat url(${visual.image})`
          : 'radial-gradient(120% 90% at 70% 40%, #6b4b18 0%, #2a2416 28%, #131a20 62%, #080c11 100%)',
      }}>
        {visual.efekt === 'isik' && <div className="ncsm-scene-flicker" style={flickerStyle(visual.efektKonum)} />}
        {visual.efekt === 'sis' && <div className="ncsm-scene-fog" style={fogStyle(visual.efektKonum)} />}

        {/* Konuşma baloncuğu — panelin değil, doğrudan görselin üzerinde. Konum
            kodu (sol-ust, sag-alt, vb.) bu büyük görsel alanına göre hesaplanıyor,
            alttaki diyalog paneline göre değil. */}
        {!visual.konumGizli && bubbleText !== null && (
          <div className={bubbleClass} style={{ ...bubbleStyle }}>
            <p style={{ ...bubbleTextStyle, fontSize: '18px', margin: 0 }}>{bubbleText}</p>
          </div>
        )}

        {/* Görselin üzerinde yüzen ince üst şerit: Back + sahne seçici */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', gap: '10px',
          padding: '14px 18px',
          background: 'linear-gradient(to bottom, rgba(8,10,14,0.55) 0%, rgba(8,10,14,0) 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={onBack}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: PANEL_TEXT, fontSize: '13px', padding: 0, textAlign: 'left' }}
            >← Back</button>
            <span style={{ fontSize: '12px', color: PANEL_MUTED }}>{scene.place}</span>
          </div>

          {scenes.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {scenes.map((s, i) => (
                <button
                  key={s.code}
                  onClick={() => { restart(); setSceneIndex(i) }}
                  style={{
                    background: i === sceneIndex ? 'rgba(240,180,87,0.25)' : 'rgba(20,20,24,0.45)',
                    color: i === sceneIndex ? PANEL_ACCENT : PANEL_MUTED,
                    border: `1px solid ${PANEL_BORDER}`, borderRadius: '7px',
                    padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >{s.title}</button>
              ))}
            </div>
          )}
        </div>

        {/* Alt kısımda yüzen diyalog paneli — okunurluk için sabit koyu gradyan */}
        <div style={{
          position: 'relative', zIndex: 2,
          marginTop: 'auto',
          maxHeight: '62vh', overflowY: 'auto',
          padding: '22px 22px 24px',
          background: 'linear-gradient(to top, rgba(8,10,14,0.94) 0%, rgba(8,10,14,0.80) 55%, rgba(8,10,14,0) 100%)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: PANEL_ACCENT }}>
              {stage === 'intro' ? scene.title : characterName}
            </span>
            {supported && (
              <button
                onClick={() => { if (enabled) stop(); setEnabled(!enabled) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: PANEL_MUTED, textDecoration: 'underline' }}
              >{enabled ? 'Sesi kapat' : 'Sesi aç'}</button>
            )}
          </div>

          {stage === 'intro' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '16px', ...mutedStyle }}>{scene.studentReason}</p>
              <SceneButton primary onClick={() => go('greeting', scene.openingLine)}>Başla</SceneButton>
            </div>
          )}

          {stage === 'greeting' && (
            <div>
              <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: '0 0 6px' }}>Sesli oku:</p>
              <p style={{
                ...dialogueStyle,
                fontSize: '17px',
                opacity: fadedRevealed ? 1 : 0.3,
                color: fadedRevealed ? PANEL_ACCENT : PANEL_MUTED,
                transition: 'opacity 0.3s',
              }}>{scene.fadedLine}</p>
              {!fadedRevealed && <SceneButton onClick={() => setFadedRevealed(true)}>Netleştir</SceneButton>}
              <SceneButton primary onClick={() => go('reaction', scene.repeatReaction)}>Söyledim</SceneButton>
            </div>
          )}

          {stage === 'reaction' && (
            <div>
              <SceneButton primary onClick={() => { go('drill', scene.drillReason); setTimeout(() => inputRef.current?.focus(), 50) }}>Devam et</SceneButton>
            </div>
          )}

          {stage === 'drill' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '16px', ...mutedStyle }}>{scene.drillReason}</p>

              <input
                ref={inputRef}
                type="text"
                value={drillText}
                onChange={e => setDrillText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDrill() }}
                placeholder="If ..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: `1px solid ${PANEL_BORDER}`, borderRadius: '9px',
                  fontSize: '15px', fontFamily: 'var(--font-display)',
                  background: 'rgba(20,20,24,0.55)', color: PANEL_TEXT,
                  marginBottom: '16px',
                }}
              />

              {drillRevealed && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: '0 0 4px' }}>Beklenen cümle:</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: PANEL_ACCENT, margin: '0 0 10px' }}>{scene.answers[drillIndex]}</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontStyle: 'italic', color: PANEL_MUTED, margin: 0 }}>{scene.interjections[drillIndex]}</p>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SceneButton primary onClick={handleDrill}>{drillRevealed ? 'Devam' : 'Karşılaştır'}</SceneButton>
                <span style={{ fontSize: '12px', color: PANEL_MUTED }}>{drillIndex + 1} / {scene.cues.length}</span>
              </div>
            </div>
          )}

          {stage === 'production' && (
            <div>
              {chatLog.map((turn, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: turn.from === 'karakter' ? '16px' : '15px',
                    lineHeight: 1.6,
                    color: turn.from === 'karakter' ? PANEL_TEXT : PANEL_MUTED,
                    borderLeft: turn.from === 'karakter' ? `3px solid ${PANEL_ACCENT}` : `3px solid ${PANEL_BORDER}`,
                    paddingLeft: '14px',
                    margin: '0 0 14px',
                  }}
                >{turn.text}</p>
              ))}

              {sending && (
                <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: '0 0 14px' }}>
                  {characterName} düşünüyor…
                </p>
              )}

              <textarea
                value={productionText}
                onChange={e => { setProductionText(e.target.value); if (error) setError('') }}
                rows={3}
                placeholder="Kendi cümlenle yaz."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: `1px solid ${PANEL_BORDER}`, borderRadius: '9px',
                  fontSize: '15px', fontFamily: 'var(--font-display)',
                  background: 'rgba(20,20,24,0.55)', color: PANEL_TEXT,
                  resize: 'vertical', marginBottom: '10px',
                }}
              />
              {error && <p style={{ fontSize: '13px', color: '#FCA5A5', margin: '0 0 10px' }}>{error}</p>}

              <SceneButton primary onClick={sendProduction} disabled={sending}>
                {sending ? 'Gönderiliyor…' : 'Söyle'}
              </SceneButton>
              {chatLog.length > 0 && !sending && (
                <SceneButton onClick={() => go('closing', scene.closingReaction)}>Sahneyi bitir</SceneButton>
              )}
            </div>
          )}

          {stage === 'closing' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '16px', ...mutedStyle }}>{scene.exitLine}</p>
              <SceneButton primary onClick={() => go('record')}>{scene.exitStyle} — çık</SceneButton>
            </div>
          )}

          {stage === 'record' && (
            <div>
              <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: '0 0 16px' }}>
                Sahne bitti. Hiçbir aşamada engellenmedin; kaydedilen şey aşağıda.
              </p>

              {drillLog.map((item, i) => (
                <div key={i} style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: 0 }}>{item.cue}</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', margin: 0, color: PANEL_TEXT }}>{item.answer || '—'}</p>
                </div>
              ))}

              <div style={{ borderTop: `1px solid ${PANEL_BORDER}`, paddingTop: '12px', marginTop: '4px', marginBottom: '18px' }}>
                <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: '0 0 8px' }}>Desteksiz üretim</p>
                {verdicts.length === 0 && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: PANEL_ACCENT, margin: 0 }}>{productionLog || '—'}</p>
                )}
                {verdicts.map((v, i) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: PANEL_ACCENT, margin: 0 }}>{v.sentence}</p>
                    <p style={{ fontSize: '13px', color: PANEL_MUTED, margin: 0 }}>
                      {v.ok ? '✓ hedef yapı üretildi' : '○ hedef yapı görülmedi'}{v.note ? ' — ' + v.note : ''}
                    </p>
                  </div>
                ))}
              </div>

              <SceneButton onClick={restart}>Baştan oyna</SceneButton>
              <SceneButton onClick={onBack}>Üniteye dön</SceneButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
