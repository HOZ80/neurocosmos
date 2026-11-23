// ─── Konuşma tanıma (sesle cevap) ──────────────────────────────────────────────
// Tarayıcının kendi konuşma tanıması kullanılır (Web Speech API): yapay zekâ
// servisi, anahtar ya da ücret yok. Chrome sesi işlemek için Google'a gönderir
// (Edge'de Microsoft); ses hiçbir yerde SAKLANMAZ, yalnızca yazıya dönmüş hali
// kullanılır. Telaffuz değil dilbilgisi kontrolü içindir.
// Bu dosyada: destek kontrolü, tanıyıcı, renk vurgusu (karışan kelimeler
// listesi dahil), Drill'deki mikrofon parçası, tablolardaki konuşma
// sütunlarının okunması, Shadowing'de söylenen cümlenin karşılaştırılması ve
// öğretmenin "Konuşma tanıma denemesi" sayfası (hiçbir şey kaydetmez).

import { useEffect, useRef, useState } from 'react'
import { loadCachedThenFresh } from './sheetCache'

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

// ── Tablolardaki konuşma sütunları ───────────────────────────────────────────
// Kural her yerde aynı: sütun BOŞ (ya da hiç yok) = konuşma AÇIK; kapatmak için
// "kapalı" yazılır (kapali, false, hayır, 0, off, yok, no da olur).
export type SpeechStageKey = 'substitution' | 'transformation' | 'expansion' | 'cue_response' | 'question'
export const SPEECH_STAGE_KEYS: SpeechStageKey[] = ['substitution', 'transformation', 'expansion', 'cue_response', 'question']

function plain(s: string): string {
  return (s || '').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]/g, '')
}

const OFF_WORDS = new Set(['kapali', 'false', 'hayir', '0', 'off', 'yok', 'no'])

const STAGE_ALIASES: Record<string, SpeechStageKey | 'all'> = {
  hepsi: 'all', tumu: 'all', tum: 'all', all: 'all', acik: 'all', true: 'all', evet: 'all',
  substitution: 'substitution', sub: 'substitution',
  transformation: 'transformation', trans: 'transformation',
  expansion: 'expansion', exp: 'expansion',
  cueresponse: 'cue_response', cue: 'cue_response',
  question: 'question', serbest: 'question', serbesturetim: 'question', free: 'question',
}

function cellByName(row: Record<string, string>, name: string): string {
  const key = Object.keys(row).find(k => plain(k) === name)
  return key ? (row[key] || '').trim() : ''
}

// Drill tablosundaki "konusma" sütunu (adıyla bulunur; yeri önemsiz).
// Boş = beş aşamanın hepsinde açık; "kapalı" = kapalı; aşama adları = yalnızca
// o aşamalar; "hepsi" = beş aşama. Dönen: açık aşamalar ve tanınmayan değerler.
export function readSpeechColumn(row: Record<string, string>): { stages: SpeechStageKey[]; unknown: string[] } {
  const raw = cellByName(row, 'konusma')
  if (!raw) return { stages: [...SPEECH_STAGE_KEYS], unknown: [] }
  const parts = raw.split(/[,;|\n]/).map(s => s.trim()).filter(Boolean)
  if (parts.some(p => OFF_WORDS.has(plain(p)))) return { stages: [], unknown: [] }
  const set = new Set<SpeechStageKey>()
  const unknown: string[] = []
  parts.forEach(part => {
    const hit = STAGE_ALIASES[plain(part)]
    if (hit === 'all') SPEECH_STAGE_KEYS.forEach(k => set.add(k))
    else if (hit) set.add(hit)
    else unknown.push(part)
  })
  return { stages: SPEECH_STAGE_KEYS.filter(k => set.has(k)), unknown }
}

// Units tablosundaki açık/kapalı konuşma sütunları (ör. "shadowing_konusma").
// Boş ya da hiç yok = açık; "kapalı" vb. = kapalı.
export function readSpeechSwitch(row: Record<string, string>, column: string): boolean {
  const raw = cellByName(row, plain(column))
  if (!raw) return true
  return !OFF_WORDS.has(plain(raw))
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
export const HL_CONF = { background: '#FFEDD5', color: '#9A3412' }

// ── Karışan kelimeler (want / won't gibi) ────────────────────────────────────
// Liste kodda değil, Drill Google tablosundaki "Konuşma tanıma – Karışan
// kelimeler" sekmesinde: her satır bir grup, kelimeler virgülle ayrılmış.
// Öğretmen istediği an ekler; site bir sonraki açılışta (ya da uzun süre arka
// planda kalıp öne gelince) yeni listeyi alır. Liste yüklenemezse hiçbir şey
// bozulmaz, yalnızca turuncu vurgu çıkmaz. Kelime TAM haliyle eşleşir
// (walk ≠ walked); ' ve ’ aynı sayılır; büyük-küçük harf fark etmez.
const CONFUSABLES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSv3MoLyAe0-NNNRyTB5roJYgQ1p0jBt1RTc50HEUp-pSMGMqK8Ljr13rRonh_XxTvrAIIlT9a3aV_S/pub?gid=1675678809&single=true&output=csv'

type ConfMap = Map<string, string[]>   // kelime → karışabildiği kelimeler
let confMap: ConfMap | null = null
let confStarted = false
const confListeners = new Set<(m: ConfMap) => void>()

export function wordKey(w: string): string {
  return (w || '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
}

// Tek sütunlu basit CSV (tırnaklı hücreler dahil) → satırların ilk hücresi
function csvFirstCells(text: string): string[] {
  const out: string[] = []
  let cell = '', col = 0, q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { if (col === 0) out.push(cell); col++; cell = '' }
    else if (c === '\n') { if (col === 0) out.push(cell); col = 0; cell = '' }
    else if (c !== '\r') { if (col === 0) cell += c }
  }
  if (col === 0 && cell) out.push(cell)
  return out
}

export function parseConfusables(text: string): ConfMap {
  const cells = csvFirstCells(text)
  if (cells.length && plain(cells[0]) === 'kelimeler') cells.shift()
  const groups = new Map<string, Set<string>>()
  cells.forEach(line => {
    const words = Array.from(new Set(line.split(/[,;]/).map(wordKey).filter(Boolean)))
    if (words.length < 2) return
    words.forEach(w => {
      const g = groups.get(w) ?? new Set<string>()
      words.forEach(o => { if (o !== w) g.add(o) })
      groups.set(w, g)
    })
  })
  const m: ConfMap = new Map()
  groups.forEach((v, k) => m.set(k, Array.from(v)))
  return m
}

function ensureConfusables() {
  if (confStarted) return
  confStarted = true
  loadCachedThenFresh(CONFUSABLES_CSV_URL, text => {
    confMap = parseConfusables(text)
    const m = confMap
    confListeners.forEach(f => f(m))
  }, { accept: t => !/^\s*</.test(t) && csvFirstCells(t).length > 0 })
}

export function useConfusables(): ConfMap | null {
  const [m, setM] = useState<ConfMap | null>(confMap)
  useEffect(() => {
    ensureConfusables()
    confListeners.add(setM)
    if (confMap && confMap !== m) setM(confMap)
    return () => { confListeners.delete(setM) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return m
}

function orList(ws: string[]): string {
  if (ws.length <= 1) return ws[0] || ''
  return `${ws.slice(0, -1).join(', ')} ya da ${ws[ws.length - 1]}`
}

// Cümledeki karışabilen kelimeler ve notları (aynı kelime bir kez)
export function confusionsIn(text: string, m: ConfMap | null): { word: string; others: string[] }[] {
  if (!m || !text) return []
  const seen = new Set<string>()
  const out: { word: string; others: string[] }[] = []
  text.split(/\s+/).forEach(t => {
    const k = wordKey(t)
    if (!k || seen.has(k)) return
    const o = m.get(k)
    if (o && o.length) { seen.add(k); out.push({ word: k, others: o }) }
  })
  return out
}

function wordKind(w: string, m: ConfMap | null): 'conf' | 'small' | 's' | null {
  if (m && m.has(wordKey(w))) return 'conf'
  const core = w.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z']/g, '')
  if (!core) return null
  if (SMALL_WORDS.has(core)) return 'small'
  const bare = core.replace(/'/g, '')
  if (bare.length >= 2 && bare.endsWith('s') && !S_EXCEPT.has(bare)) return 's'
  return null
}

// Tek kelimenin vurgu stili (turuncu > sarı > mavi); vurgu yoksa null.
export function useWordHighlighter(): (w: string) => React.CSSProperties | null {
  const m = useConfusables()
  return (w: string) => {
    const k = wordKind(w, m)
    return k === 'conf' ? HL_CONF : k === 'small' ? HL_SMALL : k === 's' ? HL_S : null
  }
}

export function HighlightedSentence({ text, size = 17 }: { text: string; size?: number }) {
  const m = useConfusables()
  const parts = text.split(/(\s+)/)
  return (
    <span style={{ fontSize: `${size}px`, lineHeight: 1.7, color: '#1E1B4B' }}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p) || !p) return <span key={i}>{p}</span>
        const k = wordKind(p, m)
        if (!k) return <span key={i}>{p}</span>
        const st = k === 'conf' ? HL_CONF : k === 'small' ? HL_SMALL : HL_S
        return <span key={i} style={{ ...st, borderRadius: '5px', padding: '1px 4px', fontWeight: 600 }}>{p}</span>
      })}
    </span>
  )
}

// Turuncu kelimelerin altındaki not: "won't → want ya da will ile karışabilir."
export function ConfusionNote({ text, tail, size = 12.5 }: { text: string; tail?: string; size?: number }) {
  const m = useConfusables()
  const list = confusionsIn(text, m)
  if (!list.length) return null
  return (
    <div style={{ background: HL_CONF.background, color: HL_CONF.color, borderRadius: '8px', padding: '6px 10px', marginTop: '6px', fontSize: `${size}px`, lineHeight: 1.5 }}>
      {list.map(c => <div key={c.word}><b>{c.word}</b> → {orList(c.others)} ile karışabilir.</div>)}
      {tail && <div style={{ marginTop: '2px' }}>{tail}</div>}
    </div>
  )
}

export function HighlightLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '11.5px', color: 'var(--muted-foreground)' }}>
      <span><span style={{ ...HL_CONF, borderRadius: '4px', padding: '0 5px', fontWeight: 600 }}>turuncu</span> karışabilen kelime</span>
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
      <ConfusionNote text={heard} tail="Hangisini söylediysen kutuda öyle bırak." />
      <div style={{ marginTop: '6px' }}><HighlightLegend /></div>
    </div>
  )
}

// ── Shadowing: söylenen cümleyi hedef cümleyle karşılaştırma ─────────────────
// Ölçülen telaffuz değil, cümlenin EKSİKSİZ söylenip söylenmediği (tanıyıcı
// ekleri ve küçük kelimeleri kendisi düzeltebilir). Büyük-küçük harf, noktalama
// ve kesme işaretinin biçimi fark etmez; rakamla yazılan sayılar kelimeyle
// (13 = thirteen), kısaltmalar açık haliyle (I'm = I am, don't = do not) eşleşir.
const NUM_1 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function numberWords(n: number): string[] {
  if (n < 20) return [NUM_1[n]]
  if (n < 100) return n % 10 ? [NUM_10[Math.floor(n / 10)], NUM_1[n % 10]] : [NUM_10[n / 10]]
  if (n < 1000) {
    const rest = n % 100
    return [NUM_1[Math.floor(n / 100)], 'hundred', ...(rest ? numberWords(rest) : [])]
  }
  return [String(n)]
}
const S_IS = new Set(['it', 'he', 'she', 'that', 'what', 'where', 'there', 'here', 'who', 'how', 'this', 'let'])

function expandToken(raw: string): string[] {
  let t = raw.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '')
  if (!t) return []
  if (/^\d+$/.test(t)) return numberWords(Number(t))
  if (t === 'cannot') return ['can', 'not']
  if (t === "won't") return ['will', 'not']
  if (t === "can't") return ['can', 'not']
  if (t === "shan't") return ['shall', 'not']
  if (t.endsWith("n't")) return [t.slice(0, -3), 'not']
  if (t.endsWith("'m")) return [t.slice(0, -2), 'am']
  if (t.endsWith("'re")) return [t.slice(0, -3), 'are']
  if (t.endsWith("'ve")) return [t.slice(0, -3), 'have']
  if (t.endsWith("'ll")) return [t.slice(0, -3), 'will']
  if (t === "let's") return ['let', 'us']
  if (t.endsWith("'s") && S_IS.has(t.slice(0, -2))) return [t.slice(0, -2), 'is']
  t = t.replace(/'/g, '')
  return t ? [t] : []
}
function splitWords(s: string): string[] {
  return (s || '').replace(/[-–—/]/g, ' ').split(/\s+/).filter(Boolean)
}

export interface ShadowWord { text: string; said: boolean | null }   // null: sayılmayan işaret
export interface ShadowResult { words: ShadowWord[]; said: number; total: number; complete: boolean }

export function compareShadow(target: string, heard: string): ShadowResult {
  const shown = (target || '').split(/\s+/).filter(Boolean)
  const tNorm: { w: string; i: number }[] = []
  shown.forEach((tok, i) => splitWords(tok).forEach(p => expandToken(p).forEach(w => tNorm.push({ w, i }))))
  const hNorm: string[] = []
  splitWords(heard).forEach(p => hNorm.push(...expandToken(p)))
  // En uzun ortak sıra (kelime sırası korunur)
  const n = tNorm.length, m = hNorm.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let a = n - 1; a >= 0; a--) for (let b = m - 1; b >= 0; b--) {
    dp[a][b] = tNorm[a].w === hNorm[b] ? dp[a + 1][b + 1] + 1 : Math.max(dp[a + 1][b], dp[a][b + 1])
  }
  const matched = new Array(n).fill(false)
  for (let a = 0, b = 0; a < n && b < m;) {
    if (tNorm[a].w === hNorm[b]) { matched[a] = true; a++; b++ }
    else if (dp[a + 1][b] >= dp[a][b + 1]) a++
    else b++
  }
  const words: ShadowWord[] = shown.map((text, i) => {
    const parts = tNorm.map((x, k) => ({ x, k })).filter(o => o.x.i === i)
    return { text, said: parts.length ? parts.every(o => matched[o.k]) : null }
  })
  const counted = words.filter(w => w.said !== null)
  const said = counted.filter(w => w.said).length
  return { words, said, total: counted.length, complete: counted.length > 0 && said === counted.length }
}

// Shadowing'de mikrofon: hedef cümle değişince eski dinleme iptal edilir, eski
// sonuç temizlenir. onResult her denemede bir kez çağrılır (kayıt, kutlama).
export function useShadowSpeech(target: string, onResult: (heard: string, r: ShadowResult) => void) {
  const [heard, setHeard] = useState<string | null>(null)
  const [result, setResult] = useState<ShadowResult | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const rec = useRecognizer({
    onFinal: alts => {
      const t = alts[0].text
      const r = compareShadow(targetRef.current, t)
      setHeard(t); setResult(r)
      onResultRef.current(t, r)
    },
  })
  useEffect(() => {
    setHeard(null); setResult(null); rec.abort(); rec.clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return {
    heard, result, rec,
    start: () => { setHeard(null); setResult(null); rec.clearError(); rec.start() },
    toggle: () => { if (rec.listening) rec.stop(); else { setHeard(null); setResult(null); rec.clearError(); rec.start() } },
  }
}

const SH_SAID = { color: '#166534', background: '#DCFCE7' }
const SH_MISS = { color: '#94A3B8', textDecoration: 'underline dotted', textUnderlineOffset: '4px' }

export function ShadowWords({ words, size = 20 }: { words: ShadowWord[]; size?: number }) {
  return (
    <span style={{ fontSize: `${size}px`, lineHeight: 1.75, fontWeight: 600 }}>
      {words.map((w, i) => (
        <span key={i}>
          {i ? ' ' : ''}
          <span title={w.said === false ? 'söylenmedi' : undefined}
            style={w.said === true ? { ...SH_SAID, borderRadius: '6px', padding: '1px 4px' } : w.said === false ? SH_MISS : { color: '#334155' }}>{w.text}</span>
        </span>
      ))}
    </span>
  )
}

export const shadowMissed = (r: ShadowResult) => r.words.filter(w => w.said === false).map(w => w.text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))

// Yetişkin ünitelerinin Shadowing ekranındaki konuşma kutusu
export function ShadowSpeechBox({ sp, onBeforeListen }: { sp: ReturnType<typeof useShadowSpeech>; onBeforeListen: () => void }) {
  const { rec, result, heard } = sp
  const card: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }
  const missed = result ? shadowMissed(result) : []
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <MicButton listening={rec.listening} onClick={() => { if (!rec.listening) onBeforeListen(); sp.toggle() }} />
        <div style={{ fontSize: '13.5px', lineHeight: 1.45, color: rec.listening ? '#6D28D9' : '#475569', fontWeight: rec.listening ? 600 : 500 }}>
          {rec.listening ? 'Dinliyorum… Cümleyi söyle. Bitince kendiliğinden durur ya da tekrar bas.' : result ? 'Bir daha söylemek için mikrofona ya da "Tekrar dene"ye bas.' : 'Mikrofona bas, cümleyi sesli tekrar et. Söylediğin kelimeler yeşil olur.'}
        </div>
      </div>
      {rec.listening && rec.interim && <div style={{ fontSize: '15px', color: '#4C1D95' }}>{rec.interim}</div>}
      {rec.errorText && !rec.listening && <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', lineHeight: 1.5 }}>{rec.errorText}</div>}
      {result && heard !== null && !rec.listening && (
        <>
          <div style={{ textAlign: 'center' }}><ShadowWords words={result.words} /></div>
          <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, color: result.complete ? '#166534' : '#334155' }}>
            {shadowCountText(result)}
          </div>
          {missed.length > 0 && <div style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748B' }}>Söylenmedi: <span style={SH_MISS}>{missed.join(', ')}</span></div>}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tanıyıcının duyduğu</div>
            <HighlightedSentence text={heard} size={15} />
            <ConfusionNote text={heard} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '11.5px', color: 'var(--muted-foreground)' }}>
            <span><span style={{ ...SH_SAID, borderRadius: '4px', padding: '0 5px', fontWeight: 600 }}>yeşil</span> söyledin</span>
            <span><span style={{ ...SH_MISS, fontWeight: 600 }}>gri, altı noktalı</span> söylenmedi</span>
            <span><span style={{ ...HL_CONF, borderRadius: '4px', padding: '0 5px', fontWeight: 600 }}>turuncu</span> karışabilen kelime</span>
          </div>
          <button type="button" onClick={() => { onBeforeListen(); sp.start() }}
            style={{ alignSelf: 'center', padding: '10px 20px', borderRadius: '10px', border: '1.5px solid #8B5CF6', background: '#F5F3FF', color: '#6D28D9', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Tekrar dene</button>
        </>
      )}
    </div>
  )
}

export function shadowCountText(r: ShadowResult): string {
  if (r.complete) return `Tamamını söyledin! (${r.total} kelime)`
  if (r.said === 0) return 'Cümlenin kelimeleri duyulmadı. Bir daha dene.'
  return `Söylediğin: ${r.total} kelimeden ${r.said}'${turkishSuffix(r.said)}`
}

// "9 kelimeden 8'i": sayının iyelik eki (8'i, 9'u, 6'sı, 2'si, 3'ü …)
export function turkishSuffix(n: number): string {
  if (n % 100 === 0 && n > 0) return 'ü'
  const tens = n % 100, last = n % 10
  if (last === 0) return ({ 0: 'ı', 10: 'u', 20: 'si', 30: 'u', 40: 'ı', 50: 'si', 60: 'ı', 70: 'i', 80: 'i', 90: 'ı' } as Record<number, string>)[tens] || 'ı'
  return ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'][last]
}

// ── Öğretmen: Konuşma tanıma denemesi ────────────────────────────────────────
// Yalnızca öğretmen görür; HİÇBİR ŞEY KAYDEDİLMEZ.
interface TestResult { id: number; alts: SpeechAlt[]; local: boolean; at: string }

const EXAMPLES = ['he go to school', 'I have two cat', 'I live on Istanbul', 'I want a apple', "I won't a coffee", 'I want two cat']

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
                <div style={{ margin: '2px 0 8px' }}><HighlightedSentence text={r.alts[0].text} size={18} /><ConfusionNote text={r.alts[0].text} /></div>
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

