// ─── Konuşma tanıma (sesle cevap) ──────────────────────────────────────────────
// Tarayıcının kendi konuşma tanıması kullanılır (Web Speech API): yapay zekâ
// servisi, anahtar ya da ücret yok. Chrome sesi işlemek için Google'a gönderir
// (Edge'de Microsoft); ses hiçbir yerde SAKLANMAZ, yalnızca yazıya dönmüş hali
// kullanılır. Telaffuz değil dilbilgisi kontrolü içindir.
// Bu dosyada: destek kontrolü, tanıyıcı, renk vurgusu, Drill'deki mikrofon
// parçası, Drill tablosundaki "konusma" sütununun okunması ve öğretmenin
// "Konuşma tanıma denemesi" sayfası (hiçbir şey kaydetmez).

import { useEffect, useRef, useState } from 'react'

// ── Destek ───────────────────────────────────────────────────────────────────
function recognizerCtor(): any {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function isIOS(): boolean {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}

function isStandalone(): boolean {
  try {
    return (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  } catch { return false }
}

// iPhone/iPad'e yüklenen uygulamada (ana ekrana eklenmiş) tanıma güvenilir
// değil; orada ve tanımayı hiç bilmeyen tarayıcılarda (Firefox vb.) mikrofon
// düğmesi hiç gösterilmez, öğrenci yazarak devam eder.
export function speechSupported(): boolean {
  if (!recognizerCtor()) return false
  if (isIOS() && isStandalone()) return false
  return true
}

// ── Drill tablosundaki "konusma" sütunu ──────────────────────────────────────
export type SpeechStageKey = 'substitution' | 'transformation' | 'expansion' | 'cue_response' | 'question'
export const SPEECH_STAGE_KEYS: SpeechStageKey[] = ['substitution', 'transformation', 'expansion', 'cue_response', 'question']

function plain(s: string): string {
  return (s || '').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]/g, '')
}

const STAGE_ALIASES: Record<string, SpeechStageKey | 'all'> = {
  hepsi: 'all', tumu: 'all', tum: 'all', all: 'all',
  substitution: 'substitution', sub: 'substitution',
  transformation: 'transformation', trans: 'transformation',
  expansion: 'expansion', exp: 'expansion',
  cueresponse: 'cue_response', cue: 'cue_response',
  question: 'question', serbest: 'question', serbesturetim: 'question', free: 'question',
}

// Satırdaki sütunu ADIYLA bulur (konusma / konuşma / Konusma …; yeri önemsiz).
// Dönen: konuşmanın açık olduğu aşamalar ve tanınmayan değerler.
export function readSpeechColumn(row: Record<string, string>): { stages: SpeechStageKey[]; unknown: string[] } {
  const key = Object.keys(row).find(k => plain(k) === 'konusma')
  const raw = key ? (row[key] || '').trim() : ''
  if (!raw) return { stages: [], unknown: [] }
  const set = new Set<SpeechStageKey>()
  const unknown: string[] = []
  raw.split(/[,;|\n]/).map(s => s.trim()).filter(Boolean).forEach(part => {
    const hit = STAGE_ALIASES[plain(part)]
    if (hit === 'all') SPEECH_STAGE_KEYS.forEach(k => set.add(k))
    else if (hit) set.add(hit)
    else unknown.push(part)
  })
  return { stages: SPEECH_STAGE_KEYS.filter(k => set.has(k)), unknown }
}

// ── Tanıyıcı ─────────────────────────────────────────────────────────────────
export interface SpeechAlt { text: string; confidence: number }
type RecError = 'denied' | 'nospeech' | 'network' | 'nomic' | 'other'

const ERROR_TEXT: Record<RecError, string> = {
  denied: 'Mikrofon izni verilmedi. Tarayıcının site ayarlarından mikrofona izin verebilirsin. Şimdilik yazarak devam et.',
  nospeech: 'Ses duyulmadı. Mikrofona bas ve cümleni söyle.',
  network: 'Konuşma tanıma için internet gerekiyor. Bağlantını kontrol et ya da yazarak devam et.',
  nomic: 'Mikrofon bulunamadı. Yazarak devam et.',
  other: 'Konuşma tanınamadı. Bir daha dene ya da yazarak devam et.',
}

export function useRecognizer(opts: { onFinal: (alts: SpeechAlt[]) => void; local?: boolean }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<RecError | null>(null)
  const recRef = useRef<any>(null)
  const finalRef = useRef<SpeechAlt[] | null>(null)
  const onFinalRef = useRef(opts.onFinal)
  onFinalRef.current = opts.onFinal

  useEffect(() => () => { try { recRef.current?.abort() } catch { /* yok */ } recRef.current = null }, [])

  function start() {
    const Ctor = recognizerCtor()
    if (!Ctor || recRef.current) return
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 4
    if (opts.local) { try { rec.processLocally = true } catch { /* desteklenmiyor */ } }
    finalRef.current = null
    setInterim(''); setError(null)
    rec.onresult = (e: any) => {
      let live = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          const alts: SpeechAlt[] = []
          for (let j = 0; j < r.length; j++) {
            const t = String(r[j]?.transcript || '').trim()
            if (t && !alts.some(a => a.text === t)) alts.push({ text: t, confidence: Number(r[j]?.confidence) || 0 })
          }
          if (alts.length) {
            // Birden çok parça gelirse (uzun cümle) en iyi tahminler birleştirilir
            if (finalRef.current && finalRef.current.length) {
              finalRef.current = [{ text: `${finalRef.current[0].text} ${alts[0].text}`.trim(), confidence: alts[0].confidence }]
            } else finalRef.current = alts
          }
        } else live += String(r[0]?.transcript || '')
      }
      setInterim(live.trim())
    }
    rec.onerror = (e: any) => {
      const c = String(e?.error || '')
      if (c === 'aborted') return
      setError(c === 'not-allowed' || c === 'service-not-allowed' ? 'denied'
        : c === 'no-speech' ? 'nospeech'
        : c === 'network' ? 'network'
        : c === 'audio-capture' ? 'nomic'
        : 'other')
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      setInterim('')
      const f = finalRef.current
      finalRef.current = null
      if (f && f.length) onFinalRef.current(f)
    }
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch {
      setError('other')
    }
  }
  function stop() { try { recRef.current?.stop() } catch { /* yok */ } }
  // Sonucu bekletmeden kapatır (soru değişince eski cümle yeni soruya yazılmasın)
  function abort() { finalRef.current = null; try { recRef.current?.abort() } catch { /* yok */ } }
  function toggle() { if (recRef.current) stop(); else start() }

  return { listening, interim, error, errorText: error ? ERROR_TEXT[error] : null, start, stop, abort, toggle, clearError: () => setError(null) }
}

// ── Renk vurgusu ─────────────────────────────────────────────────────────────
// Tanıyıcı küçük kelimeleri ve ekleri bağlamdan tahmin edip öğrencinin
// hatasını gizleyebilir; öğrenci bunlara bir kez daha baksın diye renklenir.
// Kırmızı kullanılmaz.
const SMALL_WORDS = new Set([
  'a', 'an', 'the',
  'in', 'on', 'at', 'to', 'from', 'of', 'for', 'with', 'by', 'about', 'under', 'behind', 'near', 'into', 'onto',
  'over', 'between', 'next', 'after', 'before', 'up', 'down', 'off', 'out', 'around', 'through', 'across',
  'above', 'below', 'without', 'during', 'until', 'since', 'inside', 'outside', 'among', 'against', 'toward', 'towards',
])
const S_EXCEPT = new Set(['this', 'yes', 'us', 'bus', 'plus', 'thus', 'always', 'perhaps'])

export const HL_SMALL = { background: '#FEF3C7', color: '#92400E' }
export const HL_S = { background: '#E0F2FE', color: '#075985' }

function wordKind(w: string): 'small' | 's' | null {
  const core = w.toLowerCase().replace(/[^a-z']/g, '')
  if (!core) return null
  if (SMALL_WORDS.has(core)) return 'small'
  const bare = core.replace(/'/g, '')
  if (bare.length >= 2 && bare.endsWith('s') && !S_EXCEPT.has(bare)) return 's'
  return null
}

export function HighlightedSentence({ text, size = 17 }: { text: string; size?: number }) {
  const parts = text.split(/(\s+)/)
  return (
    <span style={{ fontSize: `${size}px`, lineHeight: 1.7, color: '#1E1B4B' }}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p) || !p) return <span key={i}>{p}</span>
        const k = wordKind(p)
        if (!k) return <span key={i}>{p}</span>
        const st = k === 'small' ? HL_SMALL : HL_S
        return <span key={i} style={{ ...st, borderRadius: '5px', padding: '1px 4px', fontWeight: 600 }}>{p}</span>
      })}
    </span>
  )
}

export function HighlightLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '11.5px', color: 'var(--muted-foreground)' }}>
      <span><span style={{ ...HL_SMALL, borderRadius: '4px', padding: '0 5px', fontWeight: 600 }}>a / the / in</span> küçük kelimeler</span>
      <span><span style={{ ...HL_S, borderRadius: '4px', padding: '0 5px', fontWeight: 600 }}>…s</span> -s ile biten kelimeler</span>
    </div>
  )
}

// ── Mikrofon düğmesi ─────────────────────────────────────────────────────────
const MIC_CSS = `
@keyframes nc-mic-pulse { 0% { box-shadow: 0 0 0 0 rgba(139,92,246,.45) } 70% { box-shadow: 0 0 0 12px rgba(139,92,246,0) } 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0) } }
.nc-mic { flex-shrink: 0; width: 44px; height: 42px; border-radius: 10px; border: 1.5px solid #8B5CF6; background: #F5F3FF; color: #6D28D9; display: grid; place-items: center; cursor: pointer; padding: 0; }
.nc-mic.on { background: #8B5CF6; color: #fff; animation: nc-mic-pulse 1.4s infinite; }
@media (prefers-reduced-motion: reduce) { .nc-mic.on { animation: none; } }
`

export function MicButton({ listening, onClick, big }: { listening: boolean; onClick: () => void; big?: boolean }) {
  const s = big ? { width: '72px', height: '72px', borderRadius: '50%' } : undefined
  return (
    <>
      <style>{MIC_CSS}</style>
      <button type="button" className={`nc-mic${listening ? ' on' : ''}`} style={s} onClick={onClick}
        aria-label={listening ? 'Dinlemeyi durdur' : 'Konuşarak cevapla'} title={listening ? 'Dinlemeyi durdur' : 'Konuşarak cevapla'}>
        {listening ? (
          <svg width={big ? 26 : 18} height={big ? 26 : 18} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
        ) : (
          <svg width={big ? 30 : 20} height={big ? 30 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
          </svg>
        )}
      </button>
    </>
  )
}

// ── Drill'de konuşmayla cevap ────────────────────────────────────────────────
// Mikrofon kutunun yanında; tanınan cümle kutuya yazılır ve üstte
// "Bunu mu demek istedin?" kutusu çıkar. Öğrenci doğruysa "Kontrol et"e basar
// (onaylar), değilse kutuda düzeltir.
export function useDrillSpeech(onText: (t: string) => void) {
  const [heard, setHeard] = useState<string | null>(null)
  const rec = useRecognizer({ onFinal: alts => { const t = alts[0].text; setHeard(t); onText(t) } })
  return { heard, reset: () => { setHeard(null); rec.abort(); rec.clearError() }, rec }
}

export function DrillSpeechNotice({ heard, listening, interim, errorText }: { heard: string | null; listening: boolean; interim: string; errorText: string | null }) {
  if (listening) {
    return (
      <div style={{ background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: '#6D28D9', fontWeight: 600 }}>Dinliyorum… Cümleni söyle. Bitince kendiliğinden durur ya da tekrar bas.</div>
        {interim && <div style={{ fontSize: '15px', color: '#4C1D95', marginTop: '4px' }}>{interim}</div>}
      </div>
    )
  }
  if (errorText) {
    return (
      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px', fontSize: '13px', lineHeight: 1.5 }}>{errorText}</div>
    )
  }
  if (!heard) return null
  return (
    <div style={{ background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#5B21B6', marginBottom: '2px' }}>Bunu mu demek istedin?</div>
      <div style={{ fontSize: '12px', color: '#6D28D9', marginBottom: '8px', lineHeight: 1.45 }}>Eklere ve küçük kelimelere dikkat: tanıyıcı onları kendisi düzeltmiş olabilir. Söylediğin gibiyse "Kontrol et"e bas, değilse kutuda düzelt.</div>
      <div style={{ marginBottom: '6px' }}><HighlightedSentence text={heard} /></div>
      <HighlightLegend />
    </div>
  )
}

// ── Öğretmen: Konuşma tanıma denemesi ────────────────────────────────────────
// Yalnızca öğretmen görür; HİÇBİR ŞEY KAYDEDİLMEZ.
interface TestResult { id: number; alts: SpeechAlt[]; local: boolean; at: string }

const EXAMPLES = ['he go to school', 'I have two cat', 'I live on Istanbul', 'I want a apple']

export function SpeechTestPage({ onBack }: { onBack: () => void }) {
  const supported = speechSupported()
  const hasApi = !!recognizerCtor()
  const [localState, setLocalState] = useState<string | null>(null)
  const [useLocal, setUseLocal] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const seq = useRef(0)
  const rec = useRecognizer({
    local: useLocal,
    onFinal: alts => setResults(r => [{ id: ++seq.current, alts, local: useLocal, at: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }, ...r].slice(0, 30)),
  })

  useEffect(() => {
    const C = recognizerCtor()
    if (!C || typeof C.available !== 'function') { setLocalState('yok'); return }
    Promise.resolve(C.available({ langs: ['en-US'], processLocally: true }))
      .then((s: any) => setLocalState(String(s)))
      .catch(() => setLocalState('yok'))
  }, [])

  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }
  const localText = localState === null ? 'kontrol ediliyor…'
    : localState === 'available' ? 'var (aşağıdan açabilirsin)'
    : localState === 'downloadable' || localState === 'downloading' ? 'bu cihazda indirilebilir, şu an kurulu değil'
    : 'bu cihazda yok (ses işlenmek üzere Google\'a gider, saklanmaz)'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 14px', fontSize: '14px', cursor: 'pointer', color: 'var(--foreground)', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>← Geri</button>
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', textAlign: 'center', lineHeight: 1.25 }}>Konuşma tanıma denemesi</h1>
          <span style={{ width: '72px', flexShrink: 0 }} />
        </div>

        <div style={{ ...card, marginBottom: '12px', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--foreground)' }}>
          <div>Bu sayfa yalnızca sende görünür. <b>Hiçbir şey kaydedilmez.</b></div>
          <div style={{ marginTop: '6px', color: 'var(--muted-foreground)' }}>
            Mikrofona bas, bir cümle söyle. Tanıyıcının ne yazdığını, varsa diğer tahminlerini ve öğrencinin göreceği renk vurgusunu görürsün.
          </div>
          <div style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--muted-foreground)' }}>
            Konuşma tanıma: <b style={{ color: supported ? '#166534' : '#92400E' }}>{supported ? 'bu tarayıcıda çalışıyor' : hasApi ? 'bu yüklü uygulamada kapalı (öğrenci de mikrofonu görmez)' : 'bu tarayıcıda yok (öğrenci de mikrofonu görmez)'}</b>
            {hasApi && <><br />Cihaz içi tanıma: {localText}</>}
          </div>
        </div>

        <div style={{ ...card, marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Söyleyebileceğin hatalı cümleler</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {EXAMPLES.map(e => <span key={e} style={{ background: 'var(--secondary)', borderRadius: '8px', padding: '4px 10px', fontSize: '14px', color: 'var(--foreground)' }}>{e}</span>)}
          </div>
        </div>

        {hasApi && supported && (
          <div style={{ ...card, marginBottom: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
            <MicButton big listening={rec.listening} onClick={rec.toggle} />
            <div style={{ fontSize: '13px', color: rec.listening ? '#6D28D9' : 'var(--muted-foreground)', fontWeight: rec.listening ? 600 : 400 }}>
              {rec.listening ? 'Dinliyorum… Bitince kendiliğinden durur ya da tekrar bas.' : 'Mikrofona bas ve söyle'}
            </div>
            {rec.listening && rec.interim && <div style={{ fontSize: '16px', color: '#4C1D95' }}>{rec.interim}</div>}
            {rec.errorText && !rec.listening && <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', lineHeight: 1.5 }}>{rec.errorText}</div>}
            {localState === 'available' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                <input type="checkbox" checked={useLocal} disabled={rec.listening} onChange={e => setUseLocal(e.target.checked)} />
                Cihaz içi tanımayı dene (ses cihazdan çıkmaz)
              </label>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map(r => (
              <div key={r.id} style={card}>
                <div style={{ fontSize: '11.5px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>{r.at}{r.local ? ' · cihaz içi' : ''}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tanıyıcının yazdığı</div>
                <div style={{ margin: '2px 0 8px' }}><HighlightedSentence text={r.alts[0].text} size={18} /></div>
                {r.alts.length > 1 && (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diğer tahminler</div>
                    <ul style={{ margin: '4px 0 8px', paddingLeft: '18px', fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.6 }}>
                      {r.alts.slice(1).map((a, i) => <li key={i}>{a.text}{a.confidence ? <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}> · %{Math.round(a.confidence * 100)}</span> : null}</li>)}
                    </ul>
                  </>
                )}
                {r.alts[0].confidence > 0 && <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Tanıyıcının eminliği: %{Math.round(r.alts[0].confidence * 100)}</div>}
              </div>
            ))}
            <HighlightLegend />
          </div>
        )}
      </div>
    </div>
  )
}

