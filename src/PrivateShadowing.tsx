import { useState, useRef, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Kişisel (P) sekmesine özel Shadowing modülü.
//
// Bu dosya bilerek App.tsx'ten hiçbir şey almaz — kendi altyazı okuyucusunu,
// kendi tiplerini ve kendi stillerini içinde taşır. Böylece App.tsx'te bir şey
// değiştiğinde burası etkilenmez, burada bir şey değiştiğinde de sitenin geri
// kalanı etkilenmez.
//
// Stiller `.ncsp-root` altına hapsedilmiştir; CSS değişkenleri de :root yerine
// bu sınıfın üzerinde tanımlıdır. Dolayısıyla öğrenci sekmelerindeki hiçbir
// buton/kart bu dosyadan etkilenmez.
// ─────────────────────────────────────────────────────────────────────────────

interface Segment {
  start: number
  end: number
  text: string
}

const SRT_TIME_RE =
  /(\d{1,2}):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d\d):(\d\d)[,.](\d{1,3})/

function parseSRT(text: string): Segment[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
  const result: Segment[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(SRT_TIME_RE)
    if (m) {
      const start =
        +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / Math.pow(10, m[4].length)
      const end =
        +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / Math.pow(10, m[8].length)
      i++
      const textLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        if (/^\d+$/.test(lines[i].trim()) && SRT_TIME_RE.test(lines[i + 1] || '')) break
        textLines.push(lines[i])
        i++
      }
      const body = textLines.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (body) result.push({ start, end, text: body })
    } else {
      i++
    }
  }
  return result
}

const STYLES = `
.ncsp-root {
  --ncsp-bg: #0f172a;
  --ncsp-card: #1e293b;
  --ncsp-accent: #6366f1;
  --ncsp-accent-light: #818cf8;
  --ncsp-text: #f1f5f9;
  --ncsp-text-dim: #94a3b8;
  --ncsp-border: #334155;
  background: var(--ncsp-bg);
  color: var(--ncsp-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  border-radius: 16px;
  padding: 20px 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ncsp-root * { box-sizing: border-box; }
.ncsp-root .ncsp-back {
  align-self: flex-start; background: none; border: none; cursor: pointer;
  color: var(--ncsp-text-dim); font-size: 13px; font-family: inherit; padding: 0 0 8px;
}
.ncsp-root h1 { font-size: 20px; font-weight: 700; margin: 8px 0 2px; text-align: center; }
.ncsp-root .ncsp-sub { font-size: 13px; color: var(--ncsp-text-dim); margin: 0 0 20px; text-align: center; }
.ncsp-root .ncsp-card {
  background: var(--ncsp-card); border-radius: 16px; padding: 24px;
  width: 100%; max-width: 480px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.ncsp-root .ncsp-btn { cursor: pointer; border: none; font-family: inherit; }
.ncsp-root .ncsp-btn:active { transform: scale(0.97); }

.ncsp-root .ncsp-upload-row { display: flex; flex-direction: column; gap: 14px; margin-bottom: 10px; }
.ncsp-root .ncsp-upload-box {
  background: var(--ncsp-bg); border: 2px dashed var(--ncsp-border); border-radius: 12px;
  padding: 18px; text-align: center; cursor: pointer; transition: border-color 0.2s; display: block;
}
.ncsp-root .ncsp-upload-box.filled { border-color: var(--ncsp-accent-light); border-style: solid; }
.ncsp-root .ncsp-upload-box .ncsp-lbl { display: block; font-size: 14px; color: var(--ncsp-text-dim); margin-bottom: 6px; }
.ncsp-root .ncsp-upload-box .ncsp-filename { font-size: 13px; color: var(--ncsp-accent-light); word-break: break-all; margin-top: 6px; }
.ncsp-root .ncsp-upload-box input[type=file] { display: none; }
.ncsp-root .ncsp-upload-btn {
  background: var(--ncsp-accent); color: #fff; border: none; padding: 10px 18px;
  border-radius: 8px; font-size: 14px; font-weight: 600;
}

.ncsp-root details.ncsp-paste { font-size: 13px; color: var(--ncsp-text-dim); margin-top: 4px; }
.ncsp-root details.ncsp-paste summary { cursor: pointer; }
.ncsp-root textarea.ncsp-srt {
  width: 100%; min-height: 80px; margin-top: 8px; border-radius: 10px;
  border: 1px solid var(--ncsp-border); background: var(--ncsp-bg); color: var(--ncsp-text);
  padding: 10px 12px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
}
.ncsp-root .ncsp-paste-use {
  margin-top: 8px; padding: 8px 16px; border-radius: 8px; background: #312e81;
  color: #c7d2fe; font-size: 13px; font-weight: 600;
}

.ncsp-root .ncsp-start {
  width: 100%; background: var(--ncsp-accent); color: #fff; border: none; padding: 14px;
  border-radius: 10px; font-size: 16px; font-weight: 700; margin-top: 14px; cursor: pointer;
  opacity: 0.4; pointer-events: none; transition: opacity 0.2s; font-family: inherit;
}
.ncsp-root .ncsp-start.active { opacity: 1; pointer-events: auto; }
.ncsp-root .ncsp-status { font-size: 12px; color: var(--ncsp-text-dim); margin: 10px 0 0; min-height: 16px; text-align: center; }

.ncsp-root .ncsp-player { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
.ncsp-root .ncsp-progress { text-align: center; color: var(--ncsp-text-dim); font-size: 14px; }
.ncsp-root .ncsp-sentence {
  background: var(--ncsp-card); border-radius: 16px; padding: 32px 24px; min-height: 140px;
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 22px; line-height: 1.5; font-weight: 500;
}

.ncsp-root .ncsp-rowctl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
.ncsp-root .ncsp-loop {
  padding: 8px 14px; border-radius: 9px; border: 1px solid var(--ncsp-border);
  background: #1e293b; color: var(--ncsp-text); font-size: 13px; font-weight: 600;
  display: flex; align-items: center; gap: 6px;
}
.ncsp-root .ncsp-loop.on { background: #312e81; color: #c7d2fe; border-color: var(--ncsp-accent-light); }
.ncsp-root .ncsp-speedgroup { display: flex; border: 1px solid var(--ncsp-border); border-radius: 9px; overflow: hidden; }
.ncsp-root .ncsp-speed { padding: 8px 12px; border: none; font-size: 12px; font-weight: 700; background: #1e293b; color: var(--ncsp-text-dim); }
.ncsp-root .ncsp-speed.on { background: var(--ncsp-accent); color: #fff; }

.ncsp-root .ncsp-play {
  width: 72px; height: 72px; border-radius: 50%; border: none; background: var(--ncsp-accent);
  color: #fff; font-size: 26px; display: flex; align-items: center; justify-content: center; align-self: center;
}

.ncsp-root .ncsp-controls { display: flex; gap: 12px; }
.ncsp-root .ncsp-controls button {
  flex: 1; padding: 16px 0; border-radius: 12px; border: none; font-size: 15px; font-weight: 700;
  cursor: pointer; background: #334155; color: var(--ncsp-text); font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.ncsp-root .ncsp-controls button:disabled { opacity: 0.3; cursor: default; }

.ncsp-root .ncsp-list-toggle {
  background: none; border: none; color: var(--ncsp-text-dim); font-size: 13px; font-weight: 600;
  padding: 6px 0; text-align: left; cursor: pointer; width: 100%; font-family: inherit;
}
.ncsp-root .ncsp-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; margin-top: 4px; }
.ncsp-root .ncsp-item {
  text-align: left; padding: 12px 16px; border-radius: 12px; border: 1.5px solid var(--ncsp-border);
  background: var(--ncsp-bg); display: flex; gap: 10px; align-items: flex-start; width: 100%;
  cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.ncsp-root .ncsp-item.current { border-color: var(--ncsp-accent-light); background: #26243f; }
.ncsp-root .ncsp-item .ncsp-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px; color: var(--ncsp-text-dim); min-width: 16px; padding-top: 2px;
}
.ncsp-root .ncsp-item.current .ncsp-num { color: var(--ncsp-accent-light); }
.ncsp-root .ncsp-item .ncsp-txt { font-size: 14px; line-height: 1.5; color: var(--ncsp-text); }
.ncsp-root .ncsp-item.current .ncsp-txt { color: #e0e7ff; font-weight: 600; }

.ncsp-root .ncsp-hint {
  font-size: 11px; color: var(--ncsp-text-dim); text-align: center; line-height: 1.6;
  border-top: 1px solid var(--ncsp-border); padding-top: 10px; margin-top: 4px;
}
.ncsp-root .ncsp-reset {
  display: block; text-align: center; margin-top: 8px; color: var(--ncsp-text-dim);
  font-size: 13px; text-decoration: underline; cursor: pointer; background: none;
  border: none; font-family: inherit; align-self: center;
}
`

export default function PrivateShadowing({
  unitTitle,
  onBack,
}: {
  unitTitle?: string
  onBack: () => void
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [srtCount, setSrtCount] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [started, setStarted] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const [current, setCurrent] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const playTokenRef = useRef(0)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const speedRef = useRef(speed)
  speedRef.current = speed
  const objectUrlRef = useRef<string | null>(null)

  const ready = !!audioUrl && segments.length > 0

  // Modülden çıkarken sesi durdur ve geçici dosya adresini serbest bırak.
  useEffect(
    () => () => {
      playTokenRef.current++
      audioRef.current?.pause()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    [],
  )

  useEffect(() => {
    if (listOpen) itemRefs.current[current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current, listOpen])

  function handleAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setAudioUrl(url)
    setAudioName(file.name)
    setStatus('')
  }

  function loadSrtText(text: string) {
    const parsed = parseSRT(text)
    if (parsed.length === 0) {
      setStatus('Altyazı okunamadı, formatı kontrol et.')
      return
    }
    setSegments(parsed)
    setSrtCount(parsed.length)
    setStatus('')
  }

  function handleSrtFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => loadSrtText(String(reader.result))
    reader.readAsText(file)
  }

  function playSegment(index: number) {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    const seg = segments[index]
    if (!seg) return
    playTokenRef.current++
    const token = playTokenRef.current
    audio.pause()
    audio.playbackRate = speedRef.current

    const onTime = () => {
      if (token !== playTokenRef.current) {
        audio.removeEventListener('timeupdate', onTime)
        return
      }
      if (audio.currentTime >= seg.end) {
        audio.pause()
        audio.removeEventListener('timeupdate', onTime)
        setIsPlaying(false)
        if (loopRef.current) {
          setTimeout(() => {
            if (token === playTokenRef.current) playSegment(index)
          }, 400)
        }
      }
    }

    // Yeni seçilen yerel dosyada süre bilgisi henüz gelmemiş olabilir; bu
    // durumda konumlandırma sessizce yok sayılıyor, o yüzden bekliyoruz.
    if (audio.readyState >= 1) {
      audio.currentTime = seg.start
    } else {
      setStatus('Ses yükleniyor…')
      const onMeta = () => {
        audio.removeEventListener('loadedmetadata', onMeta)
        if (token === playTokenRef.current) audio.currentTime = seg.start
      }
      audio.addEventListener('loadedmetadata', onMeta)
    }

    audio.addEventListener('timeupdate', onTime)
    const p = audio.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (token === playTokenRef.current) setStatus('')
      }).catch(() => {
        if (token === playTokenRef.current) {
          setIsPlaying(false)
          setStatus('Oynatma başlamadı, tekrar dene.')
        }
      })
    }
    setIsPlaying(true)
  }

  function goTo(index: number) {
    if (index < 0 || index >= segments.length) return
    setCurrent(index)
    playSegment(index)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      playSegment(current)
    }
  }

  function changeSpeed(val: number) {
    setSpeed(val)
    if (audioRef.current && isPlaying) audioRef.current.playbackRate = val
  }

  function reset() {
    playTokenRef.current++
    audioRef.current?.pause()
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setIsPlaying(false)
    setStarted(false)
    setAudioUrl(null)
    setAudioName(null)
    setSegments([])
    setSrtCount(null)
    setCurrent(0)
    setListOpen(false)
    setStatus('')
  }

  // Klavye kısayolları — yalnızca oynatıcı açıkken ve bir yazı alanına
  // yazılmıyorken çalışır. Modülden çıkıldığında dinleyici kaldırılır.
  useEffect(() => {
    if (!started) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goTo(current - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          goTo(current + 1)
          break
        case 'r':
        case 'R':
          playSegment(current)
          break
        case 'l':
        case 'L':
          setLoop(l => !l)
          break
        case '1':
          changeSpeed(0.75)
          break
        case '2':
          changeSpeed(1)
          break
        case '3':
          changeSpeed(1.25)
          break
        case 'h':
        case 'H':
          setListOpen(o => !o)
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div className="ncsp-root">
      <style>{STYLES}</style>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" style={{ display: 'none' }} />}

      <button className="ncsp-back" onClick={onBack}>← {unitTitle || 'Geri'}</button>

      <h1>🎧 Shadowing</h1>
      <p className="ncsp-sub">Tamamen cihazında çalışır, internet gerekmez</p>

      {!started ? (
        <div className="ncsp-card">
          <div className="ncsp-upload-row">
            <label className={`ncsp-upload-box${audioName ? ' filled' : ''}`}>
              <span className="ncsp-lbl">1. Ses dosyasını yükle (mp3, m4a, wav)</span>
              <span className="ncsp-upload-btn">Dosya Seç</span>
              {audioName && <span className="ncsp-filename">✓ {audioName}</span>}
              <input type="file" accept="audio/*" onChange={handleAudioFile} />
            </label>

            <label className={`ncsp-upload-box${srtCount ? ' filled' : ''}`}>
              <span className="ncsp-lbl">2. Altyazı dosyasını yükle (.srt)</span>
              <span className="ncsp-upload-btn">Dosya Seç</span>
              {srtCount && <span className="ncsp-filename">✓ {srtCount} cümle yüklendi</span>}
              <input type="file" accept="*/*" onChange={handleSrtFile} />
            </label>
          </div>

          <details className="ncsp-paste">
            <summary>ya da .srt içeriğini buraya yapıştır</summary>
            <textarea
              className="ncsp-srt"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"1\n00:00:00,480 --> 00:00:04,000\nJessica's first day of school."}
            />
            <button
              className="ncsp-paste-use ncsp-btn"
              onClick={() => { if (pasteText.trim()) loadSrtText(pasteText) }}
            >
              Bu metni kullan
            </button>
          </details>

          <button
            className={`ncsp-start${ready ? ' active' : ''}`}
            onClick={() => { if (ready) { setCurrent(0); setStarted(true) } }}
          >
            Başla
          </button>
          <p className="ncsp-status">{status}</p>
        </div>
      ) : (
        <div className="ncsp-player">
          <div className="ncsp-progress">Cümle {current + 1} / {segments.length}</div>
          <div className="ncsp-sentence">{segments[current]?.text}</div>

          <div className="ncsp-rowctl">
            <button
              className={`ncsp-loop ncsp-btn${loop ? ' on' : ''}`}
              onClick={() => setLoop(l => !l)}
            >
              🔁 Loop
            </button>
            <div className="ncsp-speedgroup">
              {[0.75, 1, 1.25].map(r => (
                <button
                  key={r}
                  className={`ncsp-speed ncsp-btn${speed === r ? ' on' : ''}`}
                  onClick={() => changeSpeed(r)}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          <button className="ncsp-play ncsp-btn" onClick={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div className="ncsp-controls">
            <button onClick={() => goTo(current - 1)} disabled={current === 0}>⏮ Önceki</button>
            <button onClick={() => goTo(current + 1)} disabled={current === segments.length - 1}>Sonraki ⏭</button>
          </div>

          <div className="ncsp-card" style={{ padding: '12px 16px' }}>
            <button className="ncsp-list-toggle" onClick={() => setListOpen(o => !o)}>
              Cümle listesi {listOpen ? '▴' : '▾'}
            </button>
            {listOpen && (
              <div className="ncsp-list">
                {segments.map((seg, i) => (
                  <button
                    key={i}
                    ref={el => { itemRefs.current[i] = el }}
                    className={`ncsp-item${i === current ? ' current' : ''}`}
                    onClick={() => goTo(i)}
                  >
                    <span className="ncsp-num">{i + 1}</span>
                    <span className="ncsp-txt">{seg.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ncsp-hint">
            Space: oynat/durdur &nbsp;·&nbsp; ← →: cümle &nbsp;·&nbsp; R: tekrar &nbsp;·&nbsp; L: loop &nbsp;·&nbsp; 1/2/3: hız &nbsp;·&nbsp; H: liste
          </div>

          <p className="ncsp-status">{status}</p>

          <button className="ncsp-reset" onClick={reset}>Farklı bir ses/altyazı seç</button>
        </div>
      )}
    </div>
  )
}
