// ─── Okuyucu (Ömür ve Öztuğ'un çocuk paneli) ─────────────────────────────────
// Kitap listesi → okuma ekranı. İçerik Google Sheets'ten, ilerleme ve kelime
// işaretleri Supabase'ten gelir. Öğretmen hesabı "önizleme" olarak girer:
// bütün kitaplar açık görünür, hiçbir şey veritabanına yazılmaz.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Account } from './auth'
import { READER_CSS } from './readerStyles'
import {
  type Book, type Content, type PageRow, type VocabEntry, type PageTiming, type Issue,
  loadContent, fileUrl, tokenize, buildFormIndex, findSpans, buildTiming, checkContent,
} from './readerData'
import {
  type StudentData, loadStudentData, saveBookState, addReading, saveWordMark, deleteWordMark,
} from './readerStore'

type Mark = 'known' | 'learning'
const EMPTY_DATA: StudentData = { states: [], readings: [], marks: [] }
const LAYOUT_KEY = 'nc_reader_layout'

const ICON_PLAY = <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
const ICON_PAUSE = <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.2" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.2" /></svg>
const ICON_HOME = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></svg>
const ICON_SPK = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 010 7" /></svg>

// Tarayıcının kendi sesi (ücretsiz, hesap gerektirmez). Yalnızca kelime kartında.
function speakWord(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'; u.rate = 0.8
    window.speechSynthesis.speak(u)
  } catch {}
}

function fmt(x: number) {
  const s = Math.max(0, Math.floor(x))
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2)
}

function coverColor(code: string) {
  const colors = ['#6B46E5', '#E86FA7', '#1FB5A3', '#F59A3C', '#2D7DF0', '#D9503F']
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function sortedBookPages(content: Content, code: string): PageRow[] {
  return content.pages
    .filter(p => p.book === code)
    .sort((a, b) => a.section - b.section || a.page - b.page)
}

// ═══════════════════════════════════════════════════════════════════════════
// Ana bileşen: liste / okuma / içerik kontrolü arasında gezinir
// ═══════════════════════════════════════════════════════════════════════════
export default function ChildReaderApp({ account, childName, group, onExit }: {
  account: Account
  childName: string
  group: string
  onExit: () => void
}) {
  const preview = account.role === 'teacher'
  const [content, setContent] = useState<Content | null>(null)
  const [sd, setSd] = useState<StudentData>(EMPTY_DATA)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<{ kind: 'list' } | { kind: 'book'; code: string } | { kind: 'check' }>({ kind: 'list' })

  // Telefonun/tarayıcının geri tuşu: kitaptan listeye, listeden ana sayfaya.
  const depth = useRef(0)
  const mounted = useRef(true)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const leaving = useRef(false)
  useEffect(() => {
    mounted.current = true
    // Sitenin kendi adres takibi açılışta adres kaydını yeniler; kendi geri
    // adımımızı ondan sonra ekleyelim ki üzerine yazılmasın.
    const t = window.setTimeout(() => {
      try { window.history.pushState({ ncReader: 'list' }, ''); depth.current = 1 } catch {}
    }, 0)
    const onPop = () => {
      if (!mounted.current) return
      if (leaving.current || depth.current <= 1) { depth.current = 0; onExitRef.current(); return }
      depth.current = 1
      setScreen({ kind: 'list' })
    }
    window.addEventListener('popstate', onPop)
    return () => { window.clearTimeout(t); mounted.current = false; window.removeEventListener('popstate', onPop) }
  }, [])
  const openScreen = (sc: { kind: 'book'; code: string } | { kind: 'check' }) => {
    try { window.history.pushState({ ncReader: sc.kind }, ''); depth.current = 2 } catch {}
    setScreen(sc)
  }
  const backToList = () => {
    if (depth.current >= 2) { try { window.history.back(); return } catch {} }
    setScreen({ kind: 'list' })
  }
  const goHome = () => {
    const n = depth.current
    if (n > 0) {
      leaving.current = true
      try { window.history.go(-n) } catch {}
      // Tarayıcı geri adımı tetiklemezse yine de ana sayfaya dön.
      window.setTimeout(() => { if (mounted.current) { depth.current = 0; onExitRef.current() } }, 450)
    } else onExit()
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const c = await loadContent()
      let data = EMPTY_DATA
      if (!preview) data = await loadStudentData(account.id)
      setContent(c); setSd(data)
    } catch {
      setError('Kitaplar yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.')
    } finally {
      setLoading(false)
    }
  }, [account.id, preview])

  useEffect(() => { load() }, [load])

  const books = useMemo(() => {
    if (!content) return []
    return content.books
      .filter(b => b.group === group)
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
  }, [content, group])

  let body: React.ReactNode
  if (loading && !content) {
    body = <p className="rd-muted" style={{ padding: 20 }}>Kitaplar yükleniyor…</p>
  } else if (error && !content) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <div className="rd-warn">{error}</div>
        <button className="rd-btn primary" onClick={load}>Tekrar dene</button>
      </div>
    )
  } else if (content && screen.kind === 'book' && content.books.some(b => b.code === screen.code)) {
    const book = content.books.find(b => b.code === screen.code) as Book
    return (
      <div className="rd">
        <style>{READER_CSS}</style>
        <BookReader
          key={book.code}
          book={book}
          content={content}
          account={account}
          preview={preview}
          sd={sd}
          setSd={setSd}
          onClose={backToList}
          onHome={goHome}
        />
      </div>
    )
  } else if (content && screen.kind === 'check') {
    body = <ContentCheck content={content} onBack={backToList} />
  } else if (content && screen.kind !== 'check') {
    const stateOf = new Map(sd.states.map(s => [s.book_code, s]))
    body = (
      <>
        {content.stale && <div className="rd-warn">İnternet yok gibi görünüyor. En son kaydedilen kitap listesi gösteriliyor.</div>}
        {preview && <div className="rd-note">Öğretmen önizlemesi: bütün kitaplar açık görünür, çeviriler serbesttir, hiçbir şey kaydedilmez.</div>}
        {books.length === 0 ? (
          <div className="rd-note" style={{ marginTop: 12 }}>Şimdilik burada kitap yok.</div>
        ) : (
          <div className="rd-list" style={{ marginTop: 12 }}>
            {books.map((b, i) => {
              const pages = content.pages.filter(p => p.book === b.code)
              const secCount = new Set(pages.map(p => p.section)).size
              const st = stateOf.get(b.code)
              const reads = sd.readings.filter(r => r.book_code === b.code).length
              const open = preview || i === 0 || !!st?.unlocked
              const canOpen = open && pages.length > 0
              return (
                <button key={b.code} className={'rd-card' + (open ? '' : ' locked')} disabled={!canOpen}
                  onClick={() => openScreen({ kind: 'book', code: b.code })}
                  aria-label={b.title + (open ? '' : ' (kilitli)')}>
                  <div className="rd-cover" style={{ background: coverColor(b.code) }}>
                    {b.cover ? <img src={fileUrl(b.cover)} alt="" onError={e => { e.currentTarget.style.display = 'none' }} /> : null}
                    {!b.cover && (open ? b.title[0] : '🔒')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2>{b.title}</h2>
                    <p>
                      {!open ? 'Kilitli' : pages.length === 0 ? 'Henüz sayfa yok'
                        : st && (st.current_page > 1 || st.current_section > 1 || st.visited_pages.length > 0)
                          ? `Kaldığın yer: bölüm ${st.current_section}, sayfa ${st.current_page}`
                          : 'Başlamak için dokun'}
                    </p>
                    <p className="rd-sec">{secCount} bölüm{reads > 0 ? ` · ${reads} okuma tamamlandı` : ''}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </>
    )
  }

  const onList = screen.kind !== 'check'
  return (
    <div className="rd">
      <style>{READER_CSS}</style>
      <div className="rd-app">
        <header className="rd-top">
          <div className="rd-brand">
            <button className="rd-home" onClick={goHome} aria-label="Ana sayfaya dön">{ICON_HOME}<span>Ana sayfa</span></button>
            {!onList && <button className="rd-btn" onClick={backToList}>‹ Kitaplar</button>}
            <div style={{ minWidth: 0 }}>
              <h1>{onList ? `Merhaba ${childName}` : 'İçerik kontrolü'}</h1>
              {onList && <p>Bir kitap seç, okumaya başla</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {onList && preview && content && <button className="rd-btn" onClick={() => openScreen({ kind: 'check' })}>İçerik kontrolü</button>}
          </div>
        </header>
        <main className="rd-stage">{body}</main>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// İçerik kontrolü (yalnızca öğretmen)
// ═══════════════════════════════════════════════════════════════════════════
function ContentCheck({ content, onBack }: { content: Content; onBack: () => void }) {
  const [issues, setIssues] = useState<Issue[]>(() => checkContent(content))
  const errors = issues.filter(i => i.level === 'hata').length
  const warns = issues.length - errors
  const [busy, setBusy] = useState(false)
  const refresh = async () => {
    setBusy(true)
    try { setIssues(checkContent(await loadContent())) } catch {}
    setBusy(false)
  }
  return (
    <div className="rd-issues" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="rd-btn" onClick={onBack}>‹ Geri</button>
        <button className="rd-btn" onClick={refresh} disabled={busy}>{busy ? 'Okunuyor…' : 'Tabloyu yeniden oku'}</button>
      </div>
      {issues.length === 0
        ? <div className="rd-ok">Sorun bulunmadı. Tablolar tutarlı görünüyor.</div>
        : <div className="rd-note">{errors} hata, {warns} uyarı bulundu.</div>}
      {issues.map((it, i) => (
        <div key={i} className={'rd-issue ' + it.level}>
          <small>{it.book} · {it.where}</small>
          <span className="tag">{it.level === 'hata' ? 'Hata' : 'Uyarı'}</span>{it.text}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Okuma ekranı
// ═══════════════════════════════════════════════════════════════════════════
interface Pos { section: number; idx: number; bitti: boolean }

function locate(tm: PageTiming, t: number, duration: number): { si: number; wi: number } {
  if (!tm.starts.length) return { si: -1, wi: -1 }
  if (!tm.exact && duration <= 0) return { si: -1, wi: -1 }
  let si = -1
  for (let i = 0; i < tm.starts.length; i++) if (t >= tm.starts[i] - 0.02) si = i
  let wi = -1
  if (tm.exact && si >= 0) {
    const w = tm.words[si]
    for (let k = 0; k < w.length; k++) if (t >= w[k] - 0.02) wi = k
  }
  return { si, wi }
}

function BookReader({ book, content, account, preview, sd, setSd, onClose, onHome }: {
  book: Book
  content: Content
  account: Account
  preview: boolean
  sd: StudentData
  setSd: React.Dispatch<React.SetStateAction<StudentData>>
  onClose: () => void
  onHome: () => void
}) {
  const studentId = account.id
  const allPages = useMemo(() => sortedBookPages(content, book.code), [content, book.code])
  const sections = useMemo(() => Array.from(new Set(allPages.map(p => p.section))).sort((a, b) => a - b), [allPages])
  const pagesOf = useCallback((sec: number) => allPages.filter(p => p.section === sec), [allPages])
  const vocab = useMemo(() => content.vocab.filter(v => v.book === book.code), [content, book.code])
  const formIndex = useMemo(() => buildFormIndex(vocab), [vocab])

  // Başlangıç konumu: kaydedilmiş yer (geçerliyse), yoksa ilk bölümün ilk sayfası
  const saved = sd.states.find(s => s.book_code === book.code)
  const initial = useMemo(() => {
    let sec = saved && sections.includes(saved.current_section) ? saved.current_section : sections[0]
    const list = allPages.filter(p => p.section === sec)
    let idx = saved && saved.current_section === sec ? list.findIndex(p => p.page === saved.current_page) : 0
    if (idx < 0) idx = 0
    const vis = saved && saved.current_section === sec ? saved.visited_pages : []
    return { sec, idx, vis }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [pos, setPos] = useState<Pos>({ section: initial.sec, idx: initial.idx, bitti: false })
  const [visited, setVisited] = useState<number[]>(initial.vis)
  const justDone = useRef<Set<number>>(new Set())

  // Ekran ayarları
  const [textMode, setTextMode] = useState<'show' | 'blur' | 'hide'>('show')
  const [hl, setHl] = useState<'word' | 'sent'>('word')
  const [shadow, setShadow] = useState(false)
  const [rate, setRate] = useState(1)
  const [showTr, setShowTr] = useState(true)
  const [trPage, setTrPage] = useState(false)
  const [layout, setLayout] = useState<'single' | 'double' | null>(() => {
    try { const v = localStorage.getItem(LAYOUT_KEY); return v === 'single' || v === 'double' ? v : null } catch { return null }
  })
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const wide = vw >= 700
  const double = wide && (layout ? layout === 'double' : vw >= 860)

  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<VocabEntry | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [filter, setFilter] = useState<'all' | 'page' | 'learning' | 'known'>('all')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const notify = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])
  const [notice, setNotice] = useState('')

  const secPages = useMemo(() => pagesOf(pos.section), [pagesOf, pos.section])
  const page: PageRow | undefined = pos.bitti ? undefined : secPages[pos.idx]
  const pageKey = page ? `${page.section}:${page.page}` : 'bitti'

  // ── Kayıt ───────────────────────────────────────────────────────────────
  const persistState = useCallback((section: number, pageNo: number, vis: number[]) => {
    setSd(prev => {
      const others = prev.states.filter(s => s.book_code !== book.code)
      const old = prev.states.find(s => s.book_code === book.code)
      return { ...prev, states: [...others, { book_code: book.code, unlocked: old?.unlocked ?? false, current_section: section, current_page: pageNo, visited_pages: vis }] }
    })
    if (preview) return
    saveBookState(studentId, book.code, section, pageNo, vis).catch(() => notify('Kaldığın yer kaydedilemedi. İnternetini kontrol et.'))
  }, [book.code, notify, preview, setSd, studentId])

  const commit = useCallback((section: number, idx: number, vis: number[]) => {
    const list = pagesOf(section)
    const p = list[idx]
    if (!p) return
    const nv = vis.includes(p.page) ? vis : [...vis, p.page].sort((a, b) => a - b)
    setPos({ section, idx, bitti: false })
    setVisited(nv)
    persistState(section, p.page, nv)
  }, [pagesOf, persistState])

  // Açılışta görülen sayfayı işaretle
  useEffect(() => { commit(initial.sec, initial.idx, initial.vis) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const readCount = useCallback((sec: number) => {
    if (preview) return 99
    return sd.readings.filter(r => r.book_code === book.code && r.section_no === sec).length
  }, [sd.readings, book.code, preview])

  // Çeviri durumu: kapalı / ipucu (1 okuma) / serbest (2+)
  const trState: 'none' | 'hint' | 'free' = useMemo(() => {
    if (book.noTranslation) return 'none'
    const n = readCount(pos.section)
    if (n >= 2) return 'free'
    if (n === 1) return 'hint'
    return 'none'
  }, [book.noTranslation, readCount, pos.section])

  // ── Kelime işaretleri ──────────────────────────────────────────────────
  const marks = useMemo(() => new Map(sd.marks.map(m => [m.word_key, m.status as Mark])), [sd.marks])
  const markWord = useCallback((entry: VocabEntry, status: Mark | null) => {
    const prev = sd.marks
    setSd(p => {
      const rest = p.marks.filter(m => m.word_key !== entry.key)
      const old = p.marks.find(m => m.word_key === entry.key)
      return { ...p, marks: status ? [...rest, { word_key: entry.key, status, first_book_code: old?.first_book_code ?? book.code }] : rest }
    })
    if (preview) return
    const req = status ? saveWordMark(studentId, entry.key, status, book.code) : deleteWordMark(studentId, entry.key)
    req.catch(() => {
      setSd(p => ({ ...p, marks: prev }))
      notify('İşaret kaydedilemedi. İnternetini kontrol edip tekrar dene.')
    })
  }, [book.code, notify, preview, sd.marks, setSd, studentId])

  // ── Sayfa içeriği (cümleler, kelime kalıpları, zamanlama) ──────────────
  const sentTokens = useMemo(() => (page ? page.sentences.map(tokenize) : []), [page])
  const sentSpans = useMemo(() => sentTokens.map(t => findSpans(t, formIndex)), [sentTokens, formIndex])

  // ── Ses ────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [time, setTime] = useState(0)
  const [active, setActive] = useState({ si: -1, wi: -1 })
  const [waiting, setWaiting] = useState(-1)
  const prevSi = useRef(-1)
  const timing = useMemo(() => (page ? buildTiming(page, duration) : { exact: false, starts: [], words: [] }), [page, duration])
  const live = useRef({ shadow, timing, duration, rate, nSent: 0 })
  live.current = { shadow, timing, duration, rate, nSent: page ? page.sentences.length : 0 }

  useEffect(() => {
    setPlaying(false); setTime(0); setDuration(0); setAudioError(false)
    setActive({ si: -1, wi: -1 }); setWaiting(-1); setSel(null); setTrPage(false); prevSi.current = -1
    if (!page || !page.audio) return
    const a = new Audio()
    a.preload = 'auto'
    a.src = fileUrl(page.audio)
    a.playbackRate = live.current.rate
    a.onloadedmetadata = () => setDuration(isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => setAudioError(true)
    a.onended = () => {
      setPlaying(false)
      setActive({ si: -1, wi: -1 })
      if (live.current.shadow && live.current.nSent > 0) setWaiting(live.current.nSent - 1)
    }
    audioRef.current = a
    return () => {
      a.onloadedmetadata = null; a.onerror = null; a.onended = null
      a.pause(); a.removeAttribute('src'); a.load(); audioRef.current = null
    }
  }, [pageKey])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate])

  // Oynarken: konumu izle, kelime/cümle vurgusu, gölgeleme duraklaması
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let lastShown = -1
    const loop = () => {
      const a = audioRef.current
      if (!a) return
      const L = live.current
      const t = a.currentTime
      const dur = L.duration || a.duration || 0
      const { si, wi } = locate(L.timing, t, dur)
      setActive(prev => (prev.si === si && prev.wi === wi ? prev : { si, wi }))
      if (Math.abs(t - lastShown) > 0.2) { lastShown = t; setTime(t) }
      // Gölgeleme: bazı tarayıcılar sesin konumunu seyrek günceller; cümle sınırı
      // bir karede atlanırsa yine de bitmiş cümlenin sonunda dur.
      const before = prevSi.current
      prevSi.current = si
      if (L.shadow && before >= 0 && si > before) {
        a.pause()
        setPlaying(false); setTime(t); setWaiting(before)
        prevSi.current = -1
        return
      }
      if (L.shadow && si >= 0) {
        const end = si + 1 < L.timing.starts.length ? L.timing.starts[si + 1] : dur
        if (end > 0 && t >= end - 0.05) {
          a.pause()
          setPlaying(false); setTime(t); setWaiting(si)
          return
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const seekTo = useCallback((t: number, play: boolean) => {
    const a = audioRef.current
    if (!a) return
    const dur = live.current.duration || a.duration || 0
    const nt = Math.max(0, dur > 0 ? Math.min(t, dur) : t)
    a.currentTime = nt
    setTime(nt)
    setWaiting(-1)
    const loc = locate(live.current.timing, nt, dur)
    setActive(loc)
    prevSi.current = loc.si
    if (play) a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false); return }
    const dur = live.current.duration || a.duration || 0
    setWaiting(-1)
    if (dur > 0 && a.currentTime >= dur - 0.2) a.currentTime = 0
    prevSi.current = locate(live.current.timing, a.currentTime, dur).si
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  const stopAudio = () => { const a = audioRef.current; if (a) a.pause(); setPlaying(false) }

  const sentStart = (i: number) => timing.starts[i] ?? 0
  const currentSent = () => Math.max(0, locate(timing, time, duration).si)
  const prevSentence = () => {
    const cs = currentSent()
    const back = time - sentStart(cs) > 1.2 ? cs : Math.max(0, cs - 1)
    seekTo(sentStart(back) + 0.01, playing)
  }
  const nextSentence = () => {
    const n = Math.min((page?.sentences.length ?? 1) - 1, currentSent() + 1)
    seekTo(sentStart(n) + 0.01, playing)
  }

  // ── Sayfa çevirme efekti ──────────────────────────────────────────────
  // Giden sayfanın kopyası cilt çizgisi etrafında döner; çift sayfada ardından
  // yeni sayfa diğer taraftan inerek yerine oturur.
  const bookRef = useRef<HTMLDivElement | null>(null)
  const flip = useRef<{ dir: 1 | -1; clone: HTMLElement; timer: number } | null>(null)
  const canAnimate = () => typeof Element !== 'undefined' && typeof (Element.prototype as any).animate === 'function' &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const placeClone = (el: HTMLElement, book: HTMLElement) => {
    const r = el.getBoundingClientRect(), br = book.getBoundingClientRect()
    const c = el.cloneNode(true) as HTMLElement
    c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'))
    c.classList.add('rd-flipclone')
    c.style.left = (r.left - br.left) + 'px'; c.style.top = (r.top - br.top) + 'px'
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px'
    book.appendChild(c)
    return c
  }
  const cancelFlip = () => {
    if (!flip.current) return
    window.clearTimeout(flip.current.timer)
    flip.current.clone.remove()
    flip.current = null
  }
  const startFlip = (dir: 1 | -1) => {
    cancelFlip()
    const book = bookRef.current
    if (!book || !canAnimate()) return
    const spread = book.querySelector('.rd-spread, .rd-solo') as HTMLElement | null
    if (!spread) return
    const isSpread = spread.classList.contains('rd-spread') && double
    const target = isSpread ? (spread.querySelector(dir > 0 ? '.rd-text' : '.rd-art') as HTMLElement | null) : spread
    if (!target) return
    const clone = placeClone(target, book)
    // Bir şey ters giderse kopya ekranda kalmasın
    const timer = window.setTimeout(() => { clone.remove(); if (flip.current?.clone === clone) flip.current = null }, 2000)
    flip.current = { dir, clone, timer }
  }
  useLayoutEffect(() => {
    const f = flip.current
    const book = bookRef.current
    if (!f || !book) return
    flip.current = null
    const { dir, clone } = f
    const spread = book.querySelector(':scope > .rd-spread, :scope > .rd-solo') as HTMLElement | null
    const twoPhase = !!spread && spread.classList.contains('rd-spread') && double
    const incoming = twoPhase ? (spread!.querySelector(dir > 0 ? '.rd-art' : '.rd-text') as HTMLElement | null) : null
    if (incoming) incoming.style.visibility = 'hidden'
    const origin1 = twoPhase ? (dir > 0 ? 'left center' : 'right center') : (dir > 0 ? 'left center' : 'right center')
    clone.style.transformOrigin = origin1
    const a1 = clone.animate(
      [{ transform: 'perspective(1600px) rotateY(0deg)', filter: 'brightness(1)' },
       { transform: `perspective(1600px) rotateY(${dir > 0 ? -90 : 90}deg)`, filter: 'brightness(.72)' }],
      { duration: twoPhase ? 300 : 420, easing: 'cubic-bezier(.45,0,.75,.4)', fill: 'forwards' })
    const done1 = () => {
      window.clearTimeout(f.timer)
      clone.remove()
      if (!incoming) return
      const c2 = placeClone(incoming, book)
      incoming.style.visibility = ''
      c2.style.transformOrigin = dir > 0 ? 'right center' : 'left center'
      const a2 = c2.animate(
        [{ transform: `perspective(1600px) rotateY(${dir > 0 ? 90 : -90}deg)`, filter: 'brightness(.72)' },
         { transform: 'perspective(1600px) rotateY(0deg)', filter: 'brightness(1)' }],
        { duration: 300, easing: 'cubic-bezier(.25,.6,.55,1)', fill: 'forwards' })
      const done2 = () => c2.remove()
      a2.onfinish = done2; a2.oncancel = done2
    }
    a1.onfinish = done1; a1.oncancel = done1
  }, [pageKey, pos.bitti])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sayfa gezintisi ───────────────────────────────────────────────────
  const firstPageNo = (sec: number) => pagesOf(sec)[0]?.page ?? 1

  const enterBitti = async () => {
    stopAudio()
    if (justDone.current.has(pos.section)) { startFlip(1); setPos(p => ({ ...p, bitti: true })); return }
    const missing = secPages.filter(p => !visited.includes(p.page))
    if (missing.length) {
      setNotice('Atladığın bir sayfa var. Oradan devam edelim.')
      startFlip(-1)
      commit(pos.section, secPages.indexOf(missing[0]), visited)
      return
    }
    if (!preview) {
      try { await addReading(studentId, book.code, pos.section) }
      catch { cancelFlip(); notify('Okuma kaydedilemedi. İnternetini kontrol edip tekrar dene.'); return }
    }
    setSd(p => ({ ...p, readings: preview ? p.readings : [...p.readings, { book_code: book.code, section_no: pos.section }] }))
    justDone.current.add(pos.section)
    const ns = sections[sections.indexOf(pos.section) + 1]
    const target = ns ?? pos.section
    setVisited([])
    persistState(target, firstPageNo(target), [])
    startFlip(1)
    setPos(p => ({ ...p, bitti: true }))
  }

  const goNext = () => {
    setNotice('')
    if (pos.idx < secPages.length - 1) { startFlip(1); commit(pos.section, pos.idx + 1, visited) }
    else enterBitti()
    window.scrollTo({ top: 0 })
  }
  const goPrev = () => {
    setNotice('')
    if (pos.bitti) { startFlip(-1); commit(pos.section, secPages.length - 1, visited); return }
    if (pos.idx > 0) { startFlip(-1); commit(pos.section, pos.idx - 1, visited) }
    window.scrollTo({ top: 0 })
  }
  const nextSection = sections[sections.indexOf(pos.section) + 1]
  const goNextSection = () => {
    if (nextSection == null) return
    setNotice('')
    startFlip(1)
    commit(nextSection, 0, [])
    window.scrollTo({ top: 0 })
  }
  const rereadSection = () => {
    justDone.current.delete(pos.section)
    setNotice('')
    startFlip(1)
    commit(pos.section, 0, [])
    window.scrollTo({ top: 0 })
  }

  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = touch.current; touch.current = null
    if (!s0 || pos.bitti) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s0.x, dy = t.clientY - s0.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) goNext(); else if (pos.idx > 0) goPrev()
  }
  const keyNav = useRef({ next: () => {}, prev: () => {} })
  keyNav.current = { next: () => { if (!pos.bitti) goNext() }, prev: () => { if (pos.bitti || pos.idx > 0) goPrev() } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && el.closest && el.closest('input,textarea')) return
      if (e.key === 'ArrowRight') keyNav.current.next()
      else if (e.key === 'ArrowLeft') keyNav.current.prev()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const hasAudio = !!page?.audio
  const effHl = timing.exact && hl === 'word' ? 'word' : 'sent'

  // ── Kelime sayıları ve çekmece ─────────────────────────────────────────
  const counts = useMemo(() => {
    let k = 0, l = 0
    for (const v of vocab) { const m = marks.get(v.key); if (m === 'known') k++; else if (m === 'learning') l++ }
    return { k, l }
  }, [vocab, marks])
  const pageVocabKeys = useMemo(() => {
    const s = new Set<string>()
    sentSpans.forEach(sp => sp.forEach(x => s.add(x.entry.key)))
    return s
  }, [sentSpans])
  const drawerItems = vocab.filter(v => {
    const m = marks.get(v.key)
    if (filter === 'page') return pageVocabKeys.has(v.key)
    if (filter === 'learning') return m === 'learning'
    if (filter === 'known') return m === 'known'
    return true
  })

  const setLayoutPref = (v: 'single' | 'double') => {
    setLayout(v)
    try { localStorage.setItem(LAYOUT_KEY, v) } catch {}
  }

  // ── Cümleleri çiz ──────────────────────────────────────────────────────
  const renderSentence = (i: number) => {
    if (!page) return null
    const toks = sentTokens[i]
    const spans = sentSpans[i]
    const isActive = active.si === i
    const key = `${pageKey}:${i}`
    const blurred = textMode === 'blur'
    const isRev = !!revealed[key]
    const els: React.ReactNode[] = []
    const wordCls = (from: number, to: number) => {
      if (!(effHl === 'word' && isActive && timing.exact)) return ''
      if (active.wi >= from && active.wi <= to) return ' on'
      if (active.wi > to) return ' done'
      return ''
    }
    let k = 0
    while (k < toks.length) {
      const sp = spans.find(x => x.from === k)
      if (sp) {
        const st = marks.get(sp.entry.key)
        els.push(
          <span key={k} className={'rd-w v' + (st ? ' ' + st : '') + wordCls(sp.from, sp.to)}
            role="button" tabIndex={0}
            onClick={e => {
              e.stopPropagation()
              if (blurred && !isRev) { setRevealed(r => ({ ...r, [key]: true })); return }
              stopAudio(); setSel(sp.entry)
            }}
            onKeyDown={e => { if (e.key === 'Enter') { stopAudio(); setSel(sp.entry) } }}>
            {toks.slice(sp.from, sp.to + 1).join(' ')}
          </span>,
        )
        k = sp.to + 1
      } else {
        els.push(<span key={k} className={'rd-w' + wordCls(k, k)}>{toks[k]}</span>)
        k++
      }
      els.push(' ')
    }
    const showTrLine = !book.noTranslation && textMode === 'show' && page.translations[i] &&
      ((trState === 'free' && showTr) || (trState === 'hint' && trPage))
    return (
      <div key={i} className={'rd-sent' + (isActive ? ' act' : '') + (blurred ? ' blur' : '') + (blurred && isRev ? ' rev' : '')}
        onClick={() => {
          if (blurred && !isRev) { setRevealed(r => ({ ...r, [key]: true })); return }
          if (hasAudio && !audioError) seekTo(sentStart(i) + 0.01, true)
        }}>
        <div className="rd-line">{els}</div>
        {showTrLine ? <div className="rd-tr">{page.translations[i]}</div> : null}
      </div>
    )
  }

  const selMark = sel ? marks.get(sel.key) : undefined

  return (
    <div className="rd-app">
      <header className="rd-top">
        <div className="rd-brand">
          <button className="rd-home" onClick={() => { stopAudio(); onHome() }} aria-label="Ana sayfaya dön">{ICON_HOME}<span>Ana sayfa</span></button>
          <button className="rd-btn rd-nowrap" onClick={() => { stopAudio(); onClose() }} aria-label="Kitap listesine dön">‹ Kitaplar</button>
        </div>
        <div className="rd-titlebox">
          <h1 className="rd-title">{book.title}</h1>
          <p>Bölüm {pos.section}{sections.length > 1 ? ` / ${sections.length}` : ''}{preview ? ' · önizleme' : ''}</p>
        </div>
        <button className="rd-btn rd-vocabbtn" onClick={() => setDrawer(true)} aria-label="Kelime listesini aç">
          <span className="rd-vicon" aria-hidden="true">📖</span><span className="rd-vlabel">Kelimeler</span> <span className="rd-cnt k">{counts.k}</span><span className="rd-cnt l">{counts.l}</span>
        </button>
      </header>

      {!pos.bitti && (
        <section className="rd-controls" aria-label="Okuma ayarları">
          <div className="rd-grp"><span>Metin</span>
            <div className="rd-seg">
              {([['show', 'Açık'], ['blur', 'Buzlu'], ['hide', 'Gizli']] as const).map(([v, l]) =>
                <button key={v} aria-pressed={textMode === v} onClick={() => setTextMode(v)}>{l}</button>)}
            </div>
          </div>
          {hasAudio && timing.exact && (
            <div className="rd-grp"><span>Vurgu</span>
              <div className="rd-seg">
                <button aria-pressed={hl === 'word'} onClick={() => setHl('word')}>Kelime</button>
                <button aria-pressed={hl === 'sent'} onClick={() => setHl('sent')}>Cümle</button>
              </div>
            </div>
          )}
          {hasAudio && (
            <button className="rd-tgl" aria-pressed={shadow} onClick={() => { setShadow(s => !s); setWaiting(-1) }}
              title="Her cümleden sonra durur, sıra sana gelir"><i />Gölgeleme modu</button>
          )}
          {trState === 'free' && !book.noTranslation && (
            <button className="rd-tgl" aria-pressed={showTr} onClick={() => setShowTr(s => !s)}><i />Türkçe</button>
          )}
          <div className="rd-grp rd-wide"><span>Sayfa</span>
            <div className="rd-seg">
              <button aria-pressed={!double} onClick={() => setLayoutPref('single')}>Tek</button>
              <button aria-pressed={double} onClick={() => setLayoutPref('double')}>Çift</button>
            </div>
          </div>
        </section>
      )}

      {notice && <div className="rd-note">{notice}</div>}

      <main className="rd-stage">
        <div className="rd-book" ref={bookRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {pos.bitti ? (
          <div className="rd-solo">
            <h2>{nextSection == null ? 'Kitap bitti!' : 'Bölüm bitti!'}</h2>
            <p>Bu bölümü okudun.{!preview && readCount(pos.section) === 1 && !book.noTranslation ? ' Artık istersen Türkçesini görebilirsin.' : ''}</p>
            <p className="rd-muted">{counts.k} kelimeyi biliyorsun, {counts.l} kelimeyi öğreneceksin.</p>
            <div className="row">
              {nextSection != null && <button className="rd-btn primary" onClick={goNextSection}>Sonraki bölüm ›</button>}
              <button className="rd-btn" onClick={rereadSection}>Bu bölümü tekrar oku</button>
              <button className="rd-btn" onClick={goPrev}>‹ Son sayfaya dön</button>
              <button className="rd-btn" onClick={onClose}>Kitaplara dön</button>
            </div>
          </div>
        ) : page ? (
          <div className={'rd-spread' + (double ? ' dbl' : '')}>
            <div className="rd-art">
              <div className="rd-frame">
                {page.image
                  ? <img src={fileUrl(page.image)} alt="Sayfa resmi" onError={e => { e.currentTarget.style.display = 'none' }} />
                  : <div className="rd-ph"><span>🖼️</span>Resim yakında</div>}
              </div>
            </div>
            <div className="rd-text">
              <div className="rd-pghead">
                <span className="rd-dots" aria-label={`Sayfa ${pos.idx + 1} / ${secPages.length}`}>
                  {secPages.map((_, i) => <i key={i} className={i === pos.idx ? 'on' : i < pos.idx ? 'past' : ''} />)}
                  <b>Sayfa {pos.idx + 1} / {secPages.length}</b>
                </span>
                {hasAudio && !audioError && <span className="rd-muted rd-hint">Cümleye dokun: ses oradan başlar</span>}
              </div>
              <div className="rd-body">
                {textMode === 'hide' ? (
                  <div className="rd-hide">
                    <b>Dinleme modu</b><span>Sadece sese ve resme odaklan. Hazır olunca metni aç.</span>
                    <button className="rd-btn primary" onClick={() => setTextMode('show')}>Metni göster</button>
                  </div>
                ) : page.sentences.map((_, i) => renderSentence(i))}
                {trState === 'hint' && !book.noTranslation && textMode === 'show' && !trPage && page.translations.length > 0 && (
                  <button className="rd-btn rd-trhint" onClick={() => setTrPage(true)}>İstersen Türkçesini görebilirsin</button>
                )}
              </div>
              {waiting >= 0 && (
                <div className="rd-shadow">
                  <b>Şimdi sen söyle: cümleyi yüksek sesle tekrar et.</b>
                  <button className="rd-btn" onClick={() => seekTo(sentStart(waiting) + 0.01, true)}>Tekrar dinle</button>
                  <button className="rd-btn primary" onClick={() => {
                    if (waiting >= page.sentences.length - 1) { setWaiting(-1); goNext() }
                    else seekTo(sentStart(waiting + 1) + 0.01, true)
                  }}>{waiting >= page.sentences.length - 1 ? 'Sonraki sayfa' : 'Devam et'}</button>
                </div>
              )}
              {sel && (
                <div className="rd-wcard">
                  <div className="rd-wc-top">
                    <button className="rd-round" onClick={() => speakWord(sel.word)} aria-label="Telaffuzu dinle">{ICON_SPK}</button>
                    <div><div className="wd">{sel.word}</div>{sel.phonetic && <div className="ph">{sel.phonetic}</div>}</div>
                    <button className="rd-x" onClick={() => setSel(null)} aria-label="Kapat">×</button>
                  </div>
                  {sel.image && <img className="rd-wc-img" src={fileUrl(sel.image)} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />}
                  {sel.example && <div className="rd-wc-ex">“{sel.example}”</div>}
                  <div className="rd-wc-act">
                    <button className="rd-b-known" onClick={() => markWord(sel, 'known')}>{selMark === 'known' ? '✓ ' : ''}Biliyorum</button>
                    <button className="rd-b-learn" onClick={() => markWord(sel, 'learning')}>{selMark === 'learning' ? '✓ ' : ''}Öğreneceğim</button>
                    {selMark && <button className="rd-b-ghost" onClick={() => markWord(sel, null)}>Sıfırla</button>}
                  </div>
                </div>
              )}
              <div className="rd-foot">
                <button className="rd-btn" onClick={goPrev} disabled={pos.idx === 0}>‹ Önceki sayfa</button>
                <button className="rd-btn primary" onClick={goNext}>{pos.idx === secPages.length - 1 ? 'Bitir ›' : 'Sonraki sayfa ›'}</button>
              </div>
              <button className="rd-curl" onClick={goNext} aria-label="Sayfayı çevir" title="Sayfayı çevir" />
            </div>
          </div>
        ) : <div className="rd-note">Bu bölümde sayfa yok.</div>}
        </div>
      </main>

      {hasAudio && !pos.bitti && (
        <nav className="rd-bar" aria-label="Ses kontrolleri">
          {audioError ? (
            <span className="rd-muted">Bu sayfanın sesi açılamadı.</span>
          ) : (
            <>
              <div className="rd-tp">
                <button className="rd-btn rd-skip" onClick={() => seekTo(time - 5, playing)} aria-label="5 saniye geri">−5</button>
                <button className="rd-btn" onClick={prevSentence} aria-label="Önceki cümle">‹ Cümle</button>
                <button className="rd-play" onClick={togglePlay} aria-label={playing ? 'Duraklat' : 'Oynat'}>{playing ? ICON_PAUSE : ICON_PLAY}</button>
                <button className="rd-btn" onClick={nextSentence} aria-label="Sonraki cümle">Cümle ›</button>
                <button className="rd-btn rd-skip" onClick={() => seekTo(time + 5, playing)} aria-label="5 saniye ileri">+5</button>
              </div>
              <div className="rd-scrub">
                <span>{fmt(time)}</span>
                <input type="range" min={0} max={duration || 1} step={0.05} value={Math.min(time, duration || 1)}
                  onChange={e => seekTo(parseFloat(e.target.value), playing)} aria-label="Ses konumu" />
                <span>{fmt(duration)}</span>
              </div>
              <div className="rd-seg rd-rate" aria-label="Hız">
                {[0.75, 1, 1.25].map(r => <button key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>{r}×</button>)}
              </div>
            </>
          )}
        </nav>
      )}

      <div className={'rd-scrim' + (drawer ? ' open' : '')} onClick={() => setDrawer(false)} />
      <aside className={'rd-drawer' + (drawer ? ' open' : '')} aria-label="Kelime listesi">
        <div className="rd-dh"><h3>Kitabın kelimeleri</h3><button className="rd-btn" onClick={() => setDrawer(false)}>Kapat</button></div>
        <p className="rd-muted" style={{ margin: 0 }}>Seçtiğin kelimeler metinde renklenir.</p>
        <div className="rd-seg" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          {([['all', 'Tümü'], ['page', 'Bu sayfa'], ['learning', 'Öğreneceğim'], ['known', 'Biliyorum']] as const).map(([v, l]) =>
            <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <div className="rd-vlist">
          {drawerItems.length === 0 ? <div className="rd-empty">Bu filtrede henüz kelime yok.</div> : drawerItems.map(v => {
            const m = marks.get(v.key)
            return (
              <div key={v.key} className={'rd-vi ' + (m ?? '')}>
                <div className="r">
                  <button className="rd-sp" onClick={() => speakWord(v.word)} aria-label="Dinle">{ICON_SPK}</button>
                  <b>{v.word}</b><span className="ph">{v.phonetic}</span>
                </div>
                {v.example && <div className="ex">{v.example}</div>}
                <div className="act">
                  <button className={m === 'known' ? 'on-k' : ''} onClick={() => markWord(v, m === 'known' ? null : 'known')}>Biliyorum</button>
                  <button className={m === 'learning' ? 'on-l' : ''} onClick={() => markWord(v, m === 'learning' ? null : 'learning')}>Öğreneceğim</button>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      <div className={'rd-toast' + (toast ? ' on' : '')} role="status">{toast}</div>
    </div>
  )
}
