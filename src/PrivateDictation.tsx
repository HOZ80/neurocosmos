import { useState, useRef, useEffect, useCallback } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   PrivateDictation — Kişisel alan (freeSourceSelect) için dictation modülü.

   Bu dosya App.tsx'ten HİÇBİR ŞEY almaz. Kendi altyazı okuyucusu, kendi ses
   çaları, kendi karşılaştırma mantığı ve kendi stilleri içindedir. Öğrenci
   sekmelerinde kullanılan DictationView'a dokunulmamıştır; oradaki davranış
   aynen korunur. Buradaki hiçbir stil sitenin geri kalanına sızmaz — tamamı
   inline style olarak yazılmıştır.

   Renkler sitenin mevcut paletindedir (dictation turuncusu + site değişkenleri).
   Shadowing'deki koyu tema burada kullanılmaz.

   Akış: 1) Malzeme  2) (gerekirse) Cümle işaretleme  3) Alıştırma
────────────────────────────────────────────────────────────────────────────── */

const ACCENT = '#F59E0B'
const ACCENT_BG = '#FEF3C7'

type Segment = { start: number; end: number; text: string }
type HintPart = { word: string; kind: 'ok' | 'hint' | 'mask' }
type Step = 'setup' | 'mark' | 'practice'

/* ─── Yardımcılar ─────────────────────────────────────────────────────────── */

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function normalizeWord(s: string) {
  return s.toLowerCase().replace(/[.,!?;:"']/g, '').trim()
}

function maskedHint(correctText: string, typedText: string): { allOk: boolean; parts: HintPart[] } {
  const correct = correctText.trim().split(/\s+/).filter(Boolean)
  const typed = typedText.trim().split(/\s+/).filter(Boolean)
  let k = 0
  while (k < correct.length && k < typed.length && normalizeWord(correct[k]) === normalizeWord(typed[k])) k++
  const allOk = k === correct.length && typed.length === correct.length
  if (allOk) return { allOk: true, parts: [] }
  const parts: HintPart[] = []
  for (let i = 0; i < k; i++) parts.push({ word: correct[i], kind: 'ok' })
  if (k < correct.length) parts.push({ word: correct[k], kind: 'hint' })
  for (let i = k + 1; i < correct.length; i++) parts.push({ word: '*'.repeat(correct[i].length), kind: 'mask' })
  return { allOk: false, parts }
}

function compareWords(typed: string, target: string) {
  const tWords = typed.trim().split(/\s+/)
  const rWords = target.trim().split(/\s+/)
  return rWords.map((ref, i) => {
    const t = (tWords[i] ?? '').replace(/[^a-zA-Z']/g, '')
    const r = ref.replace(/[^a-zA-Z']/g, '')
    return { word: ref, typed: tWords[i] ?? '', correct: t.toLowerCase() === r.toLowerCase() }
  })
}

// Hem .srt hem .vtt okur. Satır satır zaman kodu arar; böylece bloklar
// arasında boş satır olmasa da, dosya başında BOM olsa da, satır sonları
// CRLF olsa da, altyazı metni rakamla başlasa da bozulmaz.
const TIME_RE = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/

function toSeconds(h: string | undefined, m: string, s: string, ms: string) {
  return (h ? +h * 3600 : 0) + +m * 60 + +s + +ms / Math.pow(10, ms.length)
}

function parseSubtitles(text: string): Segment[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
  const result: Segment[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(TIME_RE)
    if (m) {
      const start = toSeconds(m[1], m[2], m[3], m[4])
      const end = toSeconds(m[5], m[6], m[7], m[8])
      i++
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        if (/^\d+$/.test(lines[i].trim()) && TIME_RE.test(lines[i + 1] || '')) break
        textLines.push(lines[i])
        i++
      }
      const t = textLines.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (t) result.push({ start, end, text: t })
    } else {
      i++
    }
  }
  return result
}

/* ─── Ortak küçük stiller ─────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: '16px', padding: '22px',
}

const iconBtnStyle: React.CSSProperties = {
  background: 'var(--secondary)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '6px', cursor: 'pointer',
  color: 'var(--foreground)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.15s', flexShrink: 0,
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '12px 16px', borderRadius: '10px',
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', color: 'var(--muted-foreground)',
  marginBottom: '8px', letterSpacing: '0.02em',
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '10px', color: ACCENT,
  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px',
}

/* ─── Bileşen ─────────────────────────────────────────────────────────────── */

export default function PrivateDictation({ unitTitle, onBack }: {
  unitTitle: string
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>('setup')

  // Malzeme
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaName, setMediaName] = useState<string | null>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)

  // İşaretleme
  const [sentences, setSentences] = useState<string[]>([])
  const [boundaries, setBoundaries] = useState<number[]>([0])
  const [markIndex, setMarkIndex] = useState(0)

  // Alıştırma
  const [segments, setSegments] = useState<Segment[]>([])
  const [curIndex, setCurIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)
  const [readyForNext, setReadyForNext] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [answered, setAnswered] = useState<boolean[]>([])
  const [correctCount, setCorrectCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [hintOnWrong, setHintOnWrong] = useState(true)
  const [fullOnWrong, setFullOnWrong] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  // Ses çalar
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const segmentEndRef = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const done = step === 'practice' && curIndex >= segments.length
  const currentSegment = step === 'practice' && !done ? segments[curIndex] : null

  /* ── Ses çalar davranışı ── */

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !mediaUrl) return
    const onTimeUpdate = () => {
      setElapsed(audio.currentTime)
      if (segmentEndRef.current != null && audio.currentTime >= segmentEndRef.current) {
        audio.pause()
        segmentEndRef.current = null
      }
    }
    const onMeta = () => setDuration(audio.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [mediaUrl])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    if (mediaUrl && audioRef.current) audioRef.current.load()
  }, [mediaUrl])

  const playSegment = useCallback((start: number, end: number) => {
    const audio = audioRef.current
    if (!audio) return
    segmentEndRef.current = end > start ? end : null
    const seek = () => { audio.currentTime = start; void audio.play() }
    if (audio.readyState >= 1) seek()
    else {
      const onMeta = () => { audio.removeEventListener('loadedmetadata', onMeta); seek() }
      audio.addEventListener('loadedmetadata', onMeta)
    }
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else { segmentEndRef.current = null; void audio.play() }
  }

  function seek(t: number) {
    const audio = audioRef.current
    const clamped = Math.max(0, Math.min(duration || 0, t))
    segmentEndRef.current = null
    if (audio) audio.currentTime = clamped
    setElapsed(clamped)
  }

  /* ── Malzeme adımı ── */

  function handleMediaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMediaUrl(URL.createObjectURL(file))
    setMediaName(file.name)
    setSetupError(null)
  }

  function startPractice(segs: Segment[]) {
    setSegments(segs)
    setAnswered(new Array(segs.length).fill(false))
    setCorrectCount(0)
    setCurIndex(0)
    setStep('practice')
  }

  function handleSubtitleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!mediaUrl) { setSetupError('Önce ses veya video dosyasını seç.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseSubtitles(String(reader.result))
      if (parsed.length === 0) { setSetupError('Altyazı okunamadı, dosyanın formatını kontrol et.'); return }
      setSetupError(null)
      startPractice(parsed)
    }
    reader.readAsText(file)
  }

  function startMarking() {
    if (!mediaUrl) { setSetupError('Önce ses veya video dosyasını seç.'); return }
    const list = transcriptText.split('\n').map(s => s.trim()).filter(Boolean)
    if (list.length === 0) { setSetupError('İşaretleme için transkripti satır satır yazman gerekiyor.'); return }
    setSetupError(null)
    setSentences(list)
    setBoundaries([0])
    setMarkIndex(0)
    setStep('mark')
  }

  /* KAYITLI SEGMENT (.json) YÜKLEME — şimdilik kapalı.
     İleride lazım olursa aşağıdaki fonksiyonu ve "Malzeme" ekranındaki
     yorum bloğunu açman yeterli, başka değişiklik gerekmiyor.

  function handleJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!mediaUrl) { setSetupError('Önce ses veya video dosyasını seç.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Segment[]
        if (!Array.isArray(data) || data.length === 0) throw new Error('bos')
        setSetupError(null)
        startPractice(data)
      } catch {
        setSetupError('Kayıtlı segment dosyası okunamadı.')
      }
    }
    reader.readAsText(file)
  }
  */

  /* ── İşaretleme adımı ── */

  function markBoundary() {
    if (markIndex >= sentences.length) return
    const t = audioRef.current?.currentTime ?? 0
    const nextBoundaries = [...boundaries, t]
    const nextIndex = markIndex + 1
    setBoundaries(nextBoundaries)
    setMarkIndex(nextIndex)
    if (nextIndex >= sentences.length) {
      audioRef.current?.pause()
      const segs: Segment[] = sentences.map((text, i) => ({
        start: nextBoundaries[i], end: nextBoundaries[i + 1], text,
      }))
      startPractice(segs)
    }
  }

  function undoBoundary() {
    if (boundaries.length > 1) {
      setBoundaries(b => b.slice(0, -1))
      setMarkIndex(i => Math.max(0, i - 1))
    }
  }

  // İşaretleme ekranında boşluk tuşu cümle sınırı koyar.
  useEffect(() => {
    if (step !== 'mark') return
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space') { e.preventDefault(); markBoundary() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, markIndex, boundaries, sentences])

  /* ── Alıştırma adımı ── */

  useEffect(() => {
    if (step !== 'practice') return
    setTyped('')
    setChecked(false)
    setReadyForNext(false)
    setRevealed(false)
    const seg = segments[curIndex]
    if (seg) {
      playSegment(seg.start, seg.end)
      textareaRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIndex, segments, step])

  const hint = checked && currentSegment ? maskedHint(currentSegment.text, typed) : null
  const results = checked && currentSegment ? compareWords(typed, currentSegment.text) : []
  const allCorrect = hint?.allOk ?? false

  function checkAnswer() {
    if (!currentSegment || !typed.trim()) return
    const result = maskedHint(currentSegment.text, typed)
    setChecked(true)
    setReadyForNext(result.allOk)
    if (!answered[curIndex]) {
      setAnswered(a => { const next = [...a]; next[curIndex] = true; return next })
      if (result.allOk) setCorrectCount(c => c + 1)
    }
  }

  function goNext() { setCurIndex(i => Math.min(segments.length, i + 1)) }
  function goPrev() { setCurIndex(i => Math.max(0, i - 1)) }

  function replay() {
    if (currentSegment) playSegment(currentSegment.start, currentSegment.end)
  }

  function revealAnswer() {
    if (!currentSegment) return
    setRevealed(true)
    if (!answered[curIndex]) {
      setAnswered(a => { const next = [...a]; next[curIndex] = true; return next })
    }
  }

  function handleReset() {
    setCurIndex(0)
    setAnswered(new Array(segments.length).fill(false))
    setCorrectCount(0)
    setShowTranscript(false)
  }

  function backToSetup() {
    audioRef.current?.pause()
    setStep('setup')
    setSegments([])
    setSentences([])
    setBoundaries([0])
    setMarkIndex(0)
    setCurIndex(0)
    setCorrectCount(0)
    setAnswered([])
    setShowTranscript(false)
  }

  /* SEGMENTLERİ .json OLARAK İNDİRME — şimdilik kapalı.
     İleride lazım olursa bu fonksiyonu ve alıştırma ekranındaki yorum
     bloğunu açman yeterli.

  function exportSegments() {
    const blob = new Blob([JSON.stringify(segments, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'segments.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  */

  // Klavye: Enter kontrol/ileri, Ctrl+R tekrar dinle, sol/sağ cümle değiştirir.
  useEffect(() => {
    if (step !== 'practice') return
    function onKeyDown(e: KeyboardEvent) {
      const inTextarea = document.activeElement === textareaRef.current
      if (inTextarea && e.key === 'Enter') {
        e.preventDefault()
        if (readyForNext) goNext(); else checkAnswer()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); replay() }
      if (e.key === 'ArrowLeft' && !inTextarea) { if (curIndex > 0) goPrev() }
      if (e.key === 'ArrowRight' && !inTextarea) { if (curIndex < segments.length - 1) goNext() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, curIndex, readyForNext, typed, answered, segments])

  const pct = duration > 0 ? (elapsed / duration) * 100 : 0

  /* ── Görünüm ── */

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px' }}>
      {/* Geri */}
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 500,
        padding: 0, transition: 'color 0.15s',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        {unitTitle}
      </button>

      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>✍️</div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Dictation</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>Kişisel alan · kendi dosyanla dikte</p>
          </div>
        </div>
        {step === 'practice' && (
          <button onClick={() => setShowSettings(s => !s)} title="Ayarlar" style={{ ...iconBtnStyle, borderRadius: '50%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.14 7.14 0 0 0 .06-.94 7.14 7.14 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7" /></svg>
          </button>
        )}
      </div>

      {/* Ses öğesi — adımlar arasında ayakta kalması gerekiyor */}
      {mediaUrl && <audio ref={audioRef} src={mediaUrl} preload="metadata" />}

      {/* ══ ADIM 1 — MALZEME ══ */}
      {step === 'setup' && (
        <div style={cardStyle}>
          <div style={eyebrowStyle}>Adım 1 — Malzeme</div>

          <label style={labelStyle}>Ses veya video dosyası</label>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            maxWidth: '240px', margin: '0 auto',
            background: 'var(--card)', border: `1.5px solid ${mediaName ? ACCENT : 'var(--border)'}`,
            color: mediaName ? ACCENT : 'var(--foreground)',
            borderRadius: '10px', padding: '14px 20px',
            fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            Dosya seç
            <input type="file" accept="audio/*,video/*" onChange={handleMediaFile} style={{ display: 'none' }} />
          </label>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '8px', textAlign: 'center', wordBreak: 'break-all' }}>
            {mediaName ?? 'Henüz dosya seçilmedi'}
          </div>

          <div style={{ height: '18px' }} />

          <label style={labelStyle}>Transkript — her satıra bir cümle</label>
          <textarea
            value={transcriptText}
            onChange={e => setTranscriptText(e.target.value)}
            placeholder={'This is the first sentence.\nThis is the second one.\n…'}
            style={{
              width: '100%', minHeight: '120px', resize: 'vertical',
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--foreground)', borderRadius: '10px', padding: '12px 14px',
              fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: 1.7, outline: 'none',
            }}
          />

          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column' }}>
            {/* Birincil: altyazı yükle */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              width: '100%', borderRadius: '10px', padding: '13px 16px',
              background: ACCENT, color: '#fff', border: 'none',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'filter 0.15s',
            }}>
              Altyazı dosyası yükle
              <input type="file" accept=".srt,.vtt,text/*" onChange={handleSubtitleFile} style={{ display: 'none' }} />
            </label>

            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)', padding: '10px 0', letterSpacing: '0.02em' }}>ya da</div>

            {/* İkincil: işaretlemeye başla */}
            <button onClick={startMarking} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              width: '100%', borderRadius: '10px', padding: '13px 16px',
              background: 'var(--secondary)', border: '1px solid var(--border)',
              color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              Cümleleri İşaretlemeye Başla
            </button>

            {/* KAYITLI SEGMENT (.json) YÜKLEME — şimdilik gizlendi. İleride lazım
                olursa aşağıdaki bloğu ve yukarıdaki handleJsonFile fonksiyonunu
                yorumdan çıkarmak yeterli.

            <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted-foreground)', padding: '10px 0' }}>ya da</div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', borderRadius: '10px', padding: '13px 16px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            }}>
              Kayıtlı segment dosyası yükle (.json)
              <input type="file" accept="application/json" onChange={handleJsonFile} style={{ display: 'none' }} />
            </label>
            */}
          </div>

          {setupError && <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#DC2626' }}>{setupError}</p>}
        </div>
      )}

      {/* ══ ADIM 2 — İŞARETLEME ══ */}
      {step === 'mark' && (
        <div style={cardStyle}>
          <div style={eyebrowStyle}>Adım 2 — Cümle sınırlarını işaretle</div>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            Sesi oynat, her cümle bittiğinde <kbd>Boşluk</kbd> tuşuna bas ya da butona tıkla.
            Son cümleyi işaretleyince alıştırma kendiliğinden başlar.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
            <span>{markIndex} / {sentences.length} cümle işaretlendi</span>
            <span>{fmt(elapsed)}</span>
          </div>
          <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ width: `${sentences.length ? (markIndex / sentences.length) * 100 : 0}%`, height: '100%', background: ACCENT, transition: 'width 0.2s' }} />
          </div>

          <div style={{
            background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '14px 16px', fontSize: '15px', lineHeight: 1.7, minHeight: '56px', marginBottom: '14px',
          }}>
            {sentences[markIndex] ?? '— tamamlandı —'}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={togglePlay} style={{
              padding: '12px 16px', borderRadius: '10px', border: 'none',
              background: ACCENT, color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}>{playing ? 'Duraklat' : 'Oynat'}</button>
            <button onClick={markBoundary} style={{
              padding: '12px 16px', borderRadius: '10px', border: `1px solid ${ACCENT}`,
              background: ACCENT_BG, color: '#92400E', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}>Bu Cümle Bitti (Boşluk)</button>
            <button onClick={undoBoundary} style={ghostBtnStyle}>Geri Al</button>
            <button onClick={backToSetup} style={ghostBtnStyle}>Malzemeye Dön</button>
          </div>
        </div>
      )}

      {/* ══ ADIM 3 — ALIŞTIRMA ══ */}
      {step === 'practice' && (
        <>
          {showSettings && (
            <div className="anim-slide-down" style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={hintOnWrong} onChange={e => setHintOnWrong(e.target.checked)} />
                Yanlışta ipucu göster
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={fullOnWrong} onChange={e => setFullOnWrong(e.target.checked)} />
                Yanlışta tam cevabı göster
              </label>
            </div>
          )}

          {/* İlerleme */}
          {!done && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                <span>Cümle {curIndex + 1} / {segments.length}</span>
                <span>{correctCount} doğru</span>
              </div>
              <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(curIndex / segments.length) * 100}%`, height: '100%', background: ACCENT, transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          {/* Ses çalar */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: '14px', padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: '0 1px 6px rgba(15,23,42,0.06)', flexWrap: 'wrap',
          }}>
            <button onClick={() => seek(elapsed - 10)} style={iconBtnStyle} title="10 saniye geri">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" /></svg>
            </button>
            <button onClick={togglePlay} style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 10px rgba(245,158,11,0.35)',
            }}>
              {playing
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button onClick={() => seek(elapsed + 10)} style={iconBtnStyle} title="10 saniye ileri">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
            </button>

            <div style={{ flex: 1, minWidth: '120px', cursor: 'pointer' }}
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                seek(((e.clientX - r.left) / r.width) * (duration || 0))
              }}>
              <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '4px' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: ACCENT, borderRadius: '4px', position: 'relative' }}>
                  <div style={{ position: 'absolute', right: '-5px', top: '-3px', width: '10px', height: '10px', borderRadius: '50%', background: ACCENT }} />
                </div>
              </div>
            </div>

            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
              {fmt(elapsed)} / {fmt(duration)}
            </span>

            <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              background: 'var(--secondary)', border: '1px solid var(--border)',
              color: 'var(--foreground)', borderRadius: '6px',
              padding: '4px 6px', cursor: 'pointer', outline: 'none', flexShrink: 0,
            }}>
              {[0.75, 1, 1.25, 1.5].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>

            <button onClick={() => setShowTranscript(t => !t)} style={{
              padding: '6px 12px', borderRadius: '8px',
              border: `1px solid ${showTranscript ? ACCENT : 'var(--border)'}`,
              background: showTranscript ? ACCENT_BG : 'var(--secondary)',
              color: showTranscript ? '#92400E' : 'var(--muted-foreground)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
              {showTranscript ? 'Transkripti Gizle' : 'Transkripti Göster'}
            </button>
          </div>

          {/* Transkript — yüklenen dosyanın tüm cümleleri */}
          {showTranscript && (
            <div className="anim-slide-down" style={{ background: '#FFFBEB', border: `1px solid ${ACCENT}40`, borderRadius: '12px', padding: '16px 20px', maxHeight: '260px', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Transkript — {segments.length} cümle</p>
              <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {segments.map((s, i) => (
                  <li key={i}
                    onClick={() => setCurIndex(i)}
                    style={{
                      fontSize: '14px', lineHeight: 1.6, cursor: 'pointer',
                      color: i === curIndex ? '#92400E' : 'var(--foreground)',
                      fontWeight: i === curIndex ? 600 : 400,
                    }}>
                    {s.text}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {done ? (
            /* ── Bitiş ── */
            <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                background: '#ECFDF5', border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: '14px', padding: '18px 22px',
                display: 'flex', alignItems: 'center', gap: '14px',
              }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: '#065F46' }}>Bitti 🎉</p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#047857' }}>{segments.length} cümlenin {correctCount} tanesini doğru yazdın.</p>
                </div>
              </div>

              <button onClick={handleReset} style={{ ...ghostBtnStyle, padding: '12px' }}>Baştan Başla</button>
              <button onClick={backToSetup} style={{ alignSelf: 'center', background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                Farklı ses/altyazı seç
              </button>
            </div>
          ) : (
            <>
              {/* Yazma alanı */}
              <textarea
                ref={textareaRef}
                value={typed}
                onChange={e => { setTyped(e.target.value); setChecked(false); setReadyForNext(false) }}
                placeholder="Duyduğun cümleyi buraya yaz…"
                rows={4}
                disabled={checked && allCorrect}
                style={{
                  width: '100%', resize: 'vertical', padding: '16px 18px',
                  fontFamily: 'var(--font-body)', fontSize: '16px', lineHeight: 1.7,
                  color: 'var(--foreground)', background: 'var(--card)',
                  border: `1.5px solid ${checked ? (allCorrect ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.4)') : 'var(--border)'}`,
                  borderRadius: '14px', outline: 'none',
                  boxShadow: '0 1px 4px rgba(15,23,42,0.06)', transition: 'border-color 0.2s',
                }}
              />

              {/* Ana butonlar */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { if (readyForNext) goNext(); else checkAnswer() }}
                  disabled={!typed.trim()}
                  style={{
                    flex: 1, minWidth: '140px', padding: '12px', borderRadius: '10px', border: 'none',
                    background: typed.trim() ? ACCENT : 'var(--muted)',
                    color: typed.trim() ? '#fff' : 'var(--muted-foreground)',
                    fontSize: '14px', fontWeight: 600, cursor: typed.trim() ? 'pointer' : 'not-allowed',
                    letterSpacing: '0.02em', transition: 'all 0.15s',
                  }}
                >{readyForNext ? 'İleri →' : 'Kontrol Et'}</button>
                <button onClick={replay} style={ghostBtnStyle}>Tekrar Dinle ↻</button>
                <button onClick={revealAnswer} style={ghostBtnStyle}>Cevabı Göster</button>
                <button onClick={handleReset} style={ghostBtnStyle}>Baştan Başla</button>
              </div>

              {/* Cümle gezinme */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={goPrev} disabled={curIndex === 0} style={{
                  ...ghostBtnStyle, flex: 1, padding: '10px', fontSize: '13px',
                  color: curIndex === 0 ? 'var(--muted)' : 'var(--muted-foreground)',
                  cursor: curIndex === 0 ? 'not-allowed' : 'pointer',
                }}>← Önceki</button>
                <button onClick={goNext} style={{ ...ghostBtnStyle, flex: 1, padding: '10px', fontSize: '13px' }}>Sonraki →</button>
              </div>

              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>
                <kbd>Enter</kbd> kontrol et · doğruysa tekrar <kbd>Enter</kbd> ile ileri &nbsp; <kbd>Ctrl+R</kbd> tekrar dinle &nbsp; <kbd>←</kbd>/<kbd>→</kbd> cümle değiştir
              </p>

              {/* SEGMENTLERİ .json İNDİR — şimdilik gizlendi. İleride lazım olursa
                  bu bloğu ve yukarıdaki exportSegments fonksiyonunu yorumdan
                  çıkarmak yeterli.

              <button onClick={exportSegments} style={ghostBtnStyle}>Segmentleri İndir (.json)</button>
              */}

              {/* Cevabı göster */}
              {revealed && currentSegment && (
                <div className="anim-slide-down" style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
                  <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Doğru cümle</p>
                  <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>{currentSegment.text}</p>
                </div>
              )}

              {/* Yanlış durumu */}
              {checked && !allCorrect && (
                <div className="anim-slide-down" style={{ background: '#FFF5F5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: '#B91C1C' }}>Bazı kelimeler düzeltilmeli</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: (hintOnWrong || fullOnWrong) ? '14px' : 0 }}>
                    {results.map((r, i) => (
                      <span key={i} style={{
                        padding: '3px 9px', borderRadius: '6px', fontSize: '15px', fontWeight: 500,
                        background: r.correct ? '#DCFCE7' : '#FEE2E2',
                        color: r.correct ? '#15803D' : '#B91C1C',
                        border: `1px solid ${r.correct ? 'rgba(21,128,61,0.2)' : 'rgba(185,28,28,0.25)'}`,
                        textDecoration: r.correct ? 'none' : 'underline wavy rgba(185,28,28,0.5)',
                      }}>{r.typed || '—'}</span>
                    ))}
                  </div>
                  {fullOnWrong && currentSegment && (
                    <div style={{ background: '#fff', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
                      <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Doğru cümle</p>
                      <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, color: '#374151' }}>{currentSegment.text}</p>
                    </div>
                  )}
                  {!fullOnWrong && hintOnWrong && hint && hint.parts.length > 0 && (
                    <div style={{ background: '#fff', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
                      <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>İpucu</p>
                      <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                        {hint.parts.map((p, i) => {
                          if (p.kind === 'ok') return <span key={i} style={{ color: '#374151' }}>{p.word} </span>
                          if (p.kind === 'hint') return <span key={i} style={{ color: '#15803D', fontWeight: 700 }}>{p.word} </span>
                          return <span key={i} style={{ color: 'var(--muted-foreground)' }}>{p.word} </span>
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Doğru durumu */}
              {checked && allCorrect && (
                <div className="anim-slide-down" style={{
                  background: '#ECFDF5', border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '14px', padding: '18px 22px',
                  display: 'flex', alignItems: 'center', gap: '14px',
                }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: '#065F46' }}>Doğru! 🎉</p>
                    <p style={{ margin: 0, fontSize: '13px', color: '#047857' }}>Devam etmek için Enter'a bas ya da İleri'ye tıkla.</p>
                  </div>
                </div>
              )}

              <button onClick={backToSetup} style={{ alignSelf: 'center', background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                Farklı ses/altyazı seç
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
