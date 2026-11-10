// ─── Okuyucu (Ömür ve Öztuğ'un çocuk paneli) ─────────────────────────────────
// Kitap listesi → okuma ekranı. İçerik Google Sheets'ten, ilerleme ve kelime
// işaretleri Supabase'ten gelir. Öğretmen hesabı "önizleme" olarak girer:
// bütün kitaplar açık görünür, hiçbir şey veritabanına yazılmaz.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Account } from './auth'
import { READER_CSS } from './readerStyles'
import InstallButton from './InstallButton'
import {
  type Book, type Content, type PageRow, type VocabEntry, type PageTiming, type Issue, type DemoPlan,
  type BalloonRow, matchBalloon,
  loadContent, loadCachedContent, refreshContent, fileUrl, fileUrlFallback, tokenize, buildFormIndex, findSpans, buildTiming, checkContent,
  buildDemoPlan, scalePlan, measureSpeechEnds,
} from './readerData'
import {
  type StudentData, loadStudentData, saveBookState, addReading, saveWordMark, deleteWordMark,
} from './readerStore'

type Mark = 'known' | 'learning'
const EMPTY_DATA: StudentData = { states: [], readings: [], marks: [] }
const LAYOUT_KEY = 'nc_reader_layout'

const SWIPE_KEY = 'nc_reader_swipe_hint_v1'
const LETTERS = 'ABCDEFGH'

// İkonlar (onaylı taslaktaki çizgi ikonlar)
const ICONS: Record<string, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20h14V9.5', 'M10 20v-6h4v6'],
  books: ['M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z', 'M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z'],
  check: ['M20 6 9 17l-5-5'],
  words: ['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  eyeOff: ['M3 3l18 18', 'M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1', 'M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6'],
  pen: ['M4 20h16', 'M6 16 14.5 7.5l3 3L9 19H6z'],
  lines: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-4.6A8.5 8.5 0 1 1 21 11.5z'],
  chatDots: ['M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20l1.3-4.6A8.5 8.5 0 1 1 21 11.5z', 'M8.5 11.5h.01', 'M12 11.5h.01', 'M15.5 11.5h.01'],
  tr: ['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'],
  single: ['M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'],
  double: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M12 4v16'],
  tap: ['M22 14a8 8 0 0 1-8 8', 'M18 11v-1a2 2 0 0 0-4 0', 'M14 10V9a2 2 0 0 0-4 0v1', 'M10 9.5V4a2 2 0 0 0-4 0v10', 'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  spk: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7'],
  spk2: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  back5: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  fwd5: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  arrowR: ['M5 12h14', 'm12 5 7 7-7 7'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  star: ['m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'],
  prevS: ['M19 20 9 12l10-8z', 'M5 19V5'],
  nextS: ['m5 4 10 8-10 8z', 'M19 5v14'],
  chevL: ['m15 18-6-6 6-6'],
  chevR: ['m9 18 6-6-6-6'],
  swipe: ['M19 12H5', 'm9 8-4 4 4 4'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5z'],
  upload: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 21h14'],
  wave: ['M3 10v4', 'M7 7v10', 'M11 4v16', 'M15 8v8', 'M19 10v4'],
  image: ['M4 4h16v16H4z', 'm4 16 5-5 4 4 3-3 4 4', 'M15.5 8.5h.01'],
  pin: ['M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z', 'M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'],
  q: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
}
function Ic({ n }: { n: string }) {
  return <svg className="rd-i" viewBox="0 0 24 24" aria-hidden="true">{(ICONS[n] ?? []).map((d, i) => <path key={i} d={d} />)}</svg>
}
const ICON_PLAY = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.8v14.4L19.5 12z" fill="currentColor" /></svg>
const ICON_PAUSE = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" /></svg>
const STAR_FULL = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="#FFD54A" stroke="#E3B11E" strokeWidth="1.2" /></svg>

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

// Demo sesi: ses dosyası olmayan sayfada tarayıcının ücretsiz sesi cümleyi okur.
function speakSentence(text: string, rate: number) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''))
    u.lang = 'en-US'; u.rate = rate
    window.speechSynthesis.speak(u)
  } catch {}
}
function stopSpeech() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel() } catch {}
}

// Resim: düz dosya adı önce Supabase'ten, bulunamazsa sitenin kitaplar klasöründen yüklenir.
function SmartImg({ name, className, alt }: { name: string; className?: string; alt?: string }) {
  const [stage, setStage] = useState(0) // 0 Supabase, 1 site klasörü, 2 bulunamadı
  useEffect(() => { setStage(0) }, [name])
  const fb = fileUrlFallback(name)
  if (stage >= 2) return null
  return <img className={className} alt={alt ?? ''} src={stage === 0 ? fileUrl(name) : (fb as string)}
    onError={() => setStage(s => (s === 0 && fb ? 1 : 2))} />
}

// Sahne resmi: resim kırpılmadan tam görünür, kenarlardaki boşluğu aynı
// resmin bulanık bir kopyası doldurur. Dosya bulma sırası SmartImg ile aynı.
function SceneImg({ name, onAspect }: { name: string; onAspect?: (a: number) => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [name])
  const fb = fileUrlFallback(name)
  if (stage >= 2) return <div className="rd-ph"><Ic n="image" />Resim açılamadı</div>
  const src = stage === 0 ? fileUrl(name) : (fb as string)
  const onError = () => setStage(s => (s === 0 && fb ? 1 : 2))
  return (
    <>
      <img className="bg" src={src} alt="" aria-hidden="true" />
      <img className="fg" src={src} alt="Sayfa resmi" onError={onError}
        onLoad={e => { const im = e.currentTarget; if (onAspect && im.naturalWidth > 0 && im.naturalHeight > 0) onAspect(im.naturalWidth / im.naturalHeight) }} />
    </>
  )
}

// ─── Konuşma balonları ─────────────────────────────────────────────────────
// Resmin üstünde ayrı katman. Katman, resmin sahnede gerçekten göründüğü
// dikdörtgene oturur (telefonda sahne daha yayvan, resim ortada), böylece
// x/y yüzdeleri her ekranda resmin aynı noktasına düşer. Balon, cümlesi ilk
// kez okunmaya başlayınca patlayarak çıkar ve sayfa değişene kadar kalır.
const BL_PUFF: [number, number][] = [[-1, -1], [1, -1.2], [1.3, 0.2], [-1.3, 0.3], [0, -1.5], [0.6, 1]]

function SceneBalloons({ items, sentences, reached, active, wordMode, aspect }: {
  items: BalloonRow[]
  sentences: string[]
  reached: { si: number; wi: number } // bu sayfada okunmaya başlanmış en ileri cümle ve kelime
  active: { si: number; wi: number }
  wordMode: boolean
  aspect: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const read = () => setBox(b => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    read()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Resmin sahnedeki gerçek yeri (object-fit: contain)
  const a = aspect > 0 ? aspect : 4 / 3
  let iw = box.w, ih = box.w / a
  if (ih > box.h) { ih = box.h; iw = box.h * a }
  const il = (box.w - iw) / 2, it = (box.h - ih) / 2
  const maps = useMemo(() => items.map(b => matchBalloon(b.text, sentences[b.sentence - 1] || '')), [items, sentences])

  // Yerleşim: kuyruğun ucu tablodaki x/y noktasına gelir, balon resmin içinde kalır
  const layerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer || iw <= 0) return
    const els = Array.from(layer.querySelectorAll<HTMLElement>('.rd-bl'))
    els.forEach((el, i) => {
      const b = items[i]
      const body = el.querySelector<HTMLElement>('.body')
      if (!b || !body) return
      const bw = body.offsetWidth, bh = body.offsetHeight
      const fs = parseFloat(getComputedStyle(body).fontSize) || 14
      const tipX = 1.5 * 1.35 * fs / 26, tipY = 20.5 * 1.2 * fs / 22
      const TX = (b.x / 100) * iw, TY = (b.y / 100) * ih
      const right = b.tail.startsWith('sag'), up = b.tail.endsWith('ust')
      const off = fs * 1.3
      let inside = right ? bw - off : off
      let left = Math.max(4, Math.min(iw - bw - 4, TX - inside))
      inside = Math.max(fs * 0.9, Math.min(bw - fs * 0.9, TX - left))
      left = TX - inside
      let top = up ? TY - 4 + tipY : TY - (bh - 4 + tipY)
      top = Math.max(4, Math.min(ih - bh - 4, top))
      el.style.left = left + 'px'
      el.style.top = top + 'px'
      el.style.setProperty('--ox', inside + 'px')
      if (right) el.style.setProperty('--tr', (bw - inside - tipX + 7) + 'px')
      else el.style.setProperty('--tx', (inside - tipX + 7) + 'px')
    })
  })
  // Yazı tipi geç yüklenirse balon genişliği değişir; bir kez daha yerleştir
  const [, bump] = useState(0)
  useEffect(() => {
    const f = (document as any).fonts
    if (f && f.ready) f.ready.then(() => bump(n => n + 1)).catch(() => {})
  }, [])

  return (
    <div ref={wrapRef} className="rd-bls-wrap" aria-hidden={reached.si < 0 ? true : undefined}>
      <div ref={layerRef} className="rd-bls" style={{ left: il, top: it, width: iw, height: ih }}>
        {items.map((b, i) => {
          const si = b.sentence - 1
          const shown = reached.si >= si
          const map = maps[i]
          const toks = tokenize(b.text)
          const cur = active.si === si
          return (
            <div key={i} className={'rd-bl t-' + b.tail + (shown ? ' show' : '') + (cur && !wordMode ? ' cur' : '') + (i % 2 ? ' b2' : '')}>
              <div className="in">
                <div className="body">
                  {toks.map((w, k) => {
                    let c = ''
                    if (map && wordMode) {
                      if (active.si === si && active.wi === map[k]) c = ' on'
                      else if (reached.si > si || (reached.si === si && reached.wi >= map[k])) c = ' done'
                    }
                    return <Fragment key={k}><span className={'w' + c}>{w}</span>{k < toks.length - 1 ? ' ' : ''}</Fragment>
                  })}
                </div>
                <svg className="tail" viewBox="0 0 26 22" aria-hidden="true"><path d="M7 0 Q9 11 1.5 20.5 Q15 14 21 0 Z" /><rect x="6" y="-3" width="16.5" height="5" /></svg>
                <div className="puff">{BL_PUFF.map((d, k) => <i key={k} style={{ '--dx': d[0] * 2.2 + 'em', '--dy': d[1] * 1.6 + 'em' } as React.CSSProperties} />)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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
  // Kitap listesi bekletmeden açılır: bu cihazdaki son kopya hemen gösterilir, tablo
  // arkada okunur, değişiklik varsa sessizce güncellenir. Öğrencinin kendi verisi
  // (kilitler, kaldığı yer) her açılışta beklenir; liste o gelmeden çizilmez.
  const [content, setContent] = useState<Content | null>(() => loadCachedContent())
  const [sd, setSd] = useState<StudentData>(EMPTY_DATA)
  const [sdReady, setSdReady] = useState(false)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState<{ kind: 'list' } | { kind: 'book'; code: string } | { kind: 'check' }>({ kind: 'list' })
  const screenRef = useRef(screen)
  screenRef.current = screen
  // Kitap açıkken gelen yeni içerik bekletilir; okuma sırasında sayfa yerinden oynamaz.
  const pending = useRef<Content | null>(null)
  useEffect(() => {
    if (screen.kind !== 'book' && pending.current) { setContent(pending.current); pending.current = null }
  }, [screen])

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
    setError('')
    const failed = () => { if (mounted.current) setError('Kitaplar yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.') }
    const shown = !!loadCachedContent()
    // İkisi aynı anda istenir (eskiden tablo bitince öğrenci verisi isteniyordu).
    const sdP = preview ? Promise.resolve(EMPTY_DATA) : loadStudentData(account.id)
    const contentP = refreshContent()
    contentP.then(({ content: c, changed }) => {
      if (!mounted.current || (shown && !changed)) return
      if (screenRef.current.kind === 'book') pending.current = c
      else setContent(c)
    }).catch(() => { if (!shown) failed() })
    try {
      const data = await sdP
      if (mounted.current) { setSd(data); setSdReady(true) }
    } catch {
      failed()
    }
  }, [account.id, preview])

  useEffect(() => { load() }, [load])

  const books = useMemo(() => {
    if (!content) return []
    return content.books
      .filter(b => b.group === group)
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
  }, [content, group])

  const ready = !!content && sdReady
  let body: React.ReactNode
  if (error && !ready) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <div className="rd-warn">{error}</div>
        <button className="rd-btn pri" onClick={load}>Tekrar dene</button>
      </div>
    )
  } else if (!ready) {
    body = <p className="rd-muted" style={{ padding: 20 }}>Kitaplar yükleniyor…</p>
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
          <div className="rd-note">Şimdilik burada kitap yok.</div>
        ) : (
          <div className="rd-shelf">
            {books.map((b, i) => {
              const pages = content.pages.filter(p => p.book === b.code)
              const secCount = new Set(pages.map(p => p.section)).size
              const st = stateOf.get(b.code)
              const reads = sd.readings.filter(r => r.book_code === b.code).length
              const open = preview || i === 0 || !!st?.unlocked
              const canOpen = open && pages.length > 0
              const started = !!st && (st.current_page > 1 || st.current_section > 1 || st.visited_pages.length > 0)
              return (
                <button key={b.code} className={'rd-bk' + (open ? '' : ' locked')} disabled={!canOpen}
                  onClick={() => openScreen({ kind: 'book', code: b.code })}
                  aria-label={b.title + (open ? (started ? ', kaldığın yerden devam et' : '') : ' (kilitli)')}>
                  <span className="rd-bkw">
                    <span className="rd-cover" style={{ background: coverColor(b.code) }}>
                      {b.cover ? <SmartImg name={b.cover} /> : b.title[0]}
                    </span>
                    {!open && <span className="rd-lock"><Ic n="lock" /></span>}
                  </span>
                  <span className="bd">
                    <span className="h">{b.title}</span>
                    <span className="meta">{secCount} bölüm{reads > 0 ? ` · ${reads} okuma tamamlandı` : ''}</span>
                    {!open ? (
                      <span className="rd-cta off"><Ic n="lock" />Kilitli</span>
                    ) : pages.length === 0 ? (
                      <span className="rd-cta off">Henüz sayfa yok</span>
                    ) : started ? (
                      <>
                        <span className="rd-cta">Kaldığın yerden devam et<Ic n="arrowR" /></span>
                        <span className="rd-where"><Ic n="pin" />Bölüm {st!.current_section}, Sayfa {st!.current_page}</span>
                      </>
                    ) : (
                      <span className="rd-cta">Okumaya başla<Ic n="arrowR" /></span>
                    )}
                  </span>
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
        <header className="rd-lhd">
          <button className="rd-btn pri" onClick={goHome} aria-label="Ana sayfaya dön"><Ic n="home" />Ana sayfa</button>
          {!onList && <button className="rd-btn" onClick={backToList}><Ic n="books" />Kitaplar</button>}
          <div className="hi" style={{ flex: '1 1 120px' }}>
            <b>{onList ? `Merhaba ${childName}` : 'İçerik kontrolü'}</b>
            {onList && <span>Bir kitap seç, okumaya başla</span>}
          </div>
          <div className="rd-grow" />
          {onList && preview && content && <button className="rd-btn" onClick={() => openScreen({ kind: 'check' })}>İçerik kontrolü</button>}
          <InstallButton variant="round" bg="#FFFFFF" fg="var(--ac)" style={{ width: '44px', height: '44px', boxShadow: 'var(--sh1)' }} />
        </header>
        <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{body}</main>
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
        <button className="rd-btn" onClick={onBack}><Ic n="chevL" />Geri</button>
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
  const [textMode, setTextMode] = useState<'show' | 'hide'>('show')
  const [hl, setHl] = useState<'word' | 'sent'>('word')
  const [shadow, setShadow] = useState(false)
  const [rate, setRate] = useState(1)
  const [showTr, setShowTr] = useState(false)
  const [trPage, setTrPage] = useState(false)
  // Sayfa düzeni artık hatırlanmaz: webde her açılışta çift sayfa başlar.
  const [layout, setLayout] = useState<'single' | 'double' | null>(null)
  useEffect(() => { try { localStorage.removeItem(LAYOUT_KEY) } catch {} }, [])
  const [vw, setVw] = useState(() => window.innerWidth)
  useEffect(() => {
    const f = () => setVw(window.innerWidth)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const wide = vw >= 700
  const double = wide && (layout ? layout === 'double' : vw >= 860)

  const [sel, setSel] = useState<VocabEntry | null>(null)
  // Kelime paneli varsayılan kapalı; geniş ekranda kitabın yanında, dar ekranda sağdan kayarak açılır.
  const [panel, setPanel] = useState(false)
  const [filter, setFilter] = useState<'page' | 'all' | 'learning'>('page')
  // Telefonda bir kerelik "Kaydırarak sayfa çevir" ipucu
  const [swipeHint, setSwipeHint] = useState(() => { try { return localStorage.getItem(SWIPE_KEY) !== '1' } catch { return true } })
  const hideSwipeHint = () => { setSwipeHint(false); try { localStorage.setItem(SWIPE_KEY, '1') } catch {} }
  // "Kaydedildi" rozeti: her başarılı kayıtta yeniden belirir
  const [savedN, setSaved] = useState(0)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const notify = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])
  const [notice, setNotice] = useState('')
  // Bölüm sonu soruları: bölümü bitirince tek tek gösterilir, hiçbir yere kaydedilmez.
  const [quiz, setQuiz] = useState<{ qi: number; picked: string | null; res: boolean[]; done: boolean } | null>(null)
  // Soruyu dinle: -1 soru okunuyor, 0.. o seçenek okunuyor, null sessiz
  const [qSpeak, setQSpeak] = useState<number | null>(null)

  const secPages = useMemo(() => pagesOf(pos.section), [pagesOf, pos.section])
  const page: PageRow | undefined = pos.bitti ? undefined : secPages[pos.idx]
  const pageKey = page ? `${page.section}:${page.page}` : 'bitti'
  // Sahne resminin en/boy oranı (balon katmanı için) ve bu sayfada okunmaya
  // başlanmış en ileri cümle (balonlar sayfa değişene kadar kalır)
  const [sceneAspect, setSceneAspect] = useState<{ img: string; a: number }>({ img: '', a: 0 })
  const [reached, setReached] = useState<{ key: string; si: number; wi: number }>({ key: '', si: -1, wi: -1 })
  const sectionQs = useMemo(
    () => content.questions.filter(q =>
      q.book === book.code && q.section === pos.section && q.question.trim() &&
      q.options.length >= 2 && q.options.some(o => o.trim() === q.answer.trim())),
    [content.questions, book.code, pos.section])
  const startQuiz = () => setQuiz(sectionQs.length ? { qi: 0, picked: null, res: [], done: false } : null)

  // ── Kayıt ───────────────────────────────────────────────────────────────
  const persistState = useCallback((section: number, pageNo: number, vis: number[]) => {
    setSd(prev => {
      const others = prev.states.filter(s => s.book_code !== book.code)
      const old = prev.states.find(s => s.book_code === book.code)
      return { ...prev, states: [...others, { book_code: book.code, unlocked: old?.unlocked ?? false, current_section: section, current_page: pageNo, visited_pages: vis }] }
    })
    if (preview) return
    saveBookState(studentId, book.code, section, pageNo, vis)
      .then(() => setSaved(n => n + 1))
      .catch(() => { setSaved(0); notify('Kaldığın yer kaydedilemedi. İnternetini kontrol et.') })
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
  // Sayfada ses dosyası varsa o çalar. Yoksa Demo sesi (tarayıcının ücretsiz sesi)
  // cümleleri okur ve kelime vurgusu tahmini zamanlamayla yürür. Öğretmen
  // önizlemesinde "MP3 dene" ile geçici bir dosya da denenebilir.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Bütün sayfalarda aynı ses öğesi kullanılır: iPhone/iPad'de çocuk bir kez
  // oynata bastıktan sonra sonraki sayfalar da kendiliğinden başlayabilsin.
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [time, setTime] = useState(0)
  const [active, setActive] = useState({ si: -1, wi: -1 })
  const [waiting, setWaiting] = useState(-1)
  // Tek cümle dinleme ("Dinle" düğmesi): o cümle bitince ses durur
  const [once, setOnce] = useState(-1)
  const onceRef = useRef(-1)
  const setOnceBoth = (v: number) => { onceRef.current = v; setOnce(v) }
  // Ses dosyasında her cümlenin gerçekten bittiği an (gölgeleme kısa beklesin diye)
  const [speechEnds, setSpeechEnds] = useState<{ key: string; ends: number[] } | null>(null)
  const [audioReady, setAudioReady] = useState('')
  const [voiceOn, setVoiceOn] = useState(true)
  const [override, setOverride] = useState<{ key: string; url: string } | null>(null)
  const ovRef = useRef(override)
  ovRef.current = override
  useEffect(() => () => { if (ovRef.current) URL.revokeObjectURL(ovRef.current.url); stopSpeech() }, [])
  const prevSi = useRef(-1)
  const demo = useRef({ t: 0, last: 0, spoken: -1 })
  // Sayfa değişince önceki sayfanın etkin cümlesi yeni sayfaya sayılmasın
  const reachKey = useRef(pageKey)
  useEffect(() => {
    if (reachKey.current !== pageKey) { reachKey.current = pageKey; return }
    if (active.si < 0) return
    setReached(r => {
      const nx = { key: pageKey, si: active.si, wi: active.wi }
      if (r.key !== pageKey) return nx
      return r.si > active.si || (r.si === active.si && r.wi >= active.wi) ? r : nx
    })
  }, [active.si, active.wi, pageKey])
  const overrideActive = !!override && override.key === pageKey
  const realSrc = !page ? '' : overrideActive ? override!.url : page.audio ? fileUrl(page.audio) : ''
  const hasReal = !!realSrc
  const plan: DemoPlan | null = useMemo(() => {
    if (!page) return null
    const d = buildDemoPlan(page)
    if (!hasReal) return d
    return overrideActive ? scalePlan(d, duration) : null
  }, [page, hasReal, overrideActive, duration])
  const timing: PageTiming = useMemo(
    () => (plan ? plan.timing : page ? buildTiming(page, duration) : { exact: false, starts: [], words: [] }),
    [plan, page, duration])
  const measuredEnds = !plan && speechEnds && speechEnds.key === pageKey + '|' + realSrc ? speechEnds.ends : undefined
  const ends: number[] | undefined = plan ? plan.ends : measuredEnds
  const live = useRef({ shadow, timing, duration, rate, nSent: 0, ends: undefined as number[] | undefined, demo: false, voice: true, sentences: [] as string[] })
  live.current = { shadow, timing, duration, rate, nSent: page ? page.sentences.length : 0, ends, demo: !hasReal, voice: voiceOn, sentences: page ? page.sentences : [] }
  // Bir cümlenin bittiği an: ölçülmüşse gerçek bitiş, yoksa sıradaki cümlenin başı
  const endOf = (L: typeof live.current, si: number, dur: number) =>
    L.ends && L.ends[si] != null ? L.ends[si] : si + 1 < L.timing.starts.length ? L.timing.starts[si + 1] : dur

  useEffect(() => {
    stopSpeech()
    demo.current = { t: 0, last: 0, spoken: -1 }
    setPlaying(false); setTime(0); setDuration(0); setAudioError(false)
    setActive({ si: -1, wi: -1 }); setWaiting(-1); setSel(null); setTrPage(false); prevSi.current = -1
    setOnceBoth(-1); setAudioReady('')
    if (!page) return
    if (!realSrc) { setDuration(buildDemoPlan(page).duration); return }
    // Düz dosya adı Supabase'te bulunamazsa sitenin kitaplar klasörüne bakılır
    const fb = !overrideActive && page.audio ? fileUrlFallback(page.audio) : null
    let usedFb = false
    const a = audioEl.current ?? (audioEl.current = new Audio())
    a.preload = 'auto'
    a.src = realSrc
    a.playbackRate = live.current.rate
    a.onloadedmetadata = () => {
      setDuration(isFinite(a.duration) ? a.duration : 0)
      setAudioReady(a.currentSrc || a.src)
    }
    a.onerror = () => {
      if (!usedFb && fb) { usedFb = true; a.src = fb; a.load(); return }
      setAudioError(true)
    }
    a.onended = () => {
      setPlaying(false)
      setActive({ si: -1, wi: -1 })
      const o = onceRef.current
      setOnceBoth(-1)
      if (live.current.shadow && live.current.nSent > 0) setWaiting(o >= 0 ? o : live.current.nSent - 1)
    }
    audioRef.current = a
    return () => {
      a.onloadedmetadata = null; a.onerror = null; a.onended = null
      a.pause(); a.removeAttribute('src'); a.load(); audioRef.current = null
    }
  }, [pageKey, realSrc])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate])

  // ── Sayfa açılınca okuma kendiliğinden başlar ─────────────────────────
  // Kitap açıldığında, sayfa çevrildiğinde ya da yeni bölüme geçildiğinde: ses
  // hazır olunca ve sayfa çevirme hareketi bitince ilk cümleden başlar. Çocuk
  // durdurursa aynı sayfada yeniden kendiliğinden başlamaz.
  const autoKey = useRef('')
  const autoSeen = useRef('')
  if (autoSeen.current !== pageKey) { autoSeen.current = pageKey; autoKey.current = page ? pageKey : '' }
  const playingRef = useRef(playing)
  playingRef.current = playing
  const pageKeyRef = useRef(pageKey)
  pageKeyRef.current = pageKey
  useEffect(() => {
    if (!page || autoKey.current !== pageKey) return
    if (audioError) { autoKey.current = ''; return }
    const ready = live.current.demo ? duration > 0 : audioReady !== '' && !!audioRef.current
    if (!ready) return
    const key = pageKey
    const t = window.setTimeout(() => {
      if (autoKey.current !== key || pageKeyRef.current !== key) return
      autoKey.current = ''
      if (playingRef.current) return
      seekTo(0, true)
    }, canAnimate() ? 650 : 50)
    return () => window.clearTimeout(t)
  }, [pageKey, duration, audioReady, audioError])  // eslint-disable-line react-hooks/exhaustive-deps

  // Ses dosyası açılınca cümle bitişlerini ölç (yalnızca gerçek ses dosyasında)
  useEffect(() => {
    if (!audioReady || !hasReal || overrideActive || !page) return
    const starts = timing.starts
    if (!starts.length || !(duration > 0)) return
    const key = pageKey + '|' + realSrc
    if (speechEnds && speechEnds.key === key) return
    let alive = true
    measureSpeechEnds(audioReady, starts, timing.exact ? timing.words : null).then(e => {
      if (alive && e) setSpeechEnds({ key, ends: e })
    })
    return () => { alive = false }
  }, [audioReady, timing, duration])  // eslint-disable-line react-hooks/exhaustive-deps

  // Oynarken: konumu izle, kelime/cümle vurgusu, gölgeleme duraklaması, demo sesi
  useEffect(() => {
    if (!playing) return
    if (live.current.demo) demo.current.last = performance.now()
    let raf = 0
    let lastShown = -1
    const loop = (ts: number) => {
      const L = live.current
      const a = audioRef.current
      const d = demo.current
      let t: number
      if (L.demo) {
        const dt = Math.min(0.25, Math.max(0, (ts - d.last) / 1000))
        d.last = ts
        t = d.t + dt * L.rate
        d.t = t
      } else {
        if (!a) return
        t = a.currentTime
      }
      const dur = L.duration || (a ? a.duration : 0) || 0
      if (L.demo && dur > 0 && t >= dur) {
        d.t = dur
        const o = onceRef.current
        setTime(dur); setPlaying(false); setActive({ si: -1, wi: -1 }); setOnceBoth(-1)
        if (L.shadow && L.nSent > 0) setWaiting(o >= 0 ? o : L.nSent - 1)
        return
      }
      const { si, wi } = locate(L.timing, t, dur)
      // Tek cümle dinleme: o cümlenin sonunda dur (gölgeleme açıksa sıra çocuğa gelir)
      const o = onceRef.current
      if (o >= 0) {
        const end = endOf(L, o, dur)
        if ((end > 0 && t >= end - (L.demo ? 0.05 : 0)) || (si > o)) {
          if (a) a.pause()
          setPlaying(false); setTime(t); setOnceBoth(-1)
          setActive({ si: -1, wi: -1 })
          if (L.shadow) setWaiting(o)
          prevSi.current = -1
          return
        }
      }
      setActive(prev => (prev.si === si && prev.wi === wi ? prev : { si, wi }))
      if (Math.abs(t - lastShown) > 0.2) { lastShown = t; setTime(t) }
      // Gölgeleme: bazı tarayıcılar sesin konumunu seyrek günceller; cümle sınırı
      // bir karede atlanırsa yine de bitmiş cümlenin sonunda dur.
      const before = prevSi.current
      prevSi.current = si
      if (L.shadow && before >= 0 && si > before) {
        if (a) a.pause()
        setPlaying(false); setTime(t); setWaiting(before)
        prevSi.current = -1
        return
      }
      if (L.shadow && si >= 0) {
        const end = endOf(L, si, dur)
        if (end > 0 && t >= end - (L.demo ? 0.05 : 0)) {
          if (a) a.pause()
          setPlaying(false); setTime(t); setWaiting(si)
          return
        }
      }
      // Demo sesi: yeni cümleye girildiğinde tarayıcının sesi o cümleyi okur
      if (L.demo && L.voice && si >= 0 && si !== d.spoken && (!L.ends || t < L.ends[si])) {
        d.spoken = si
        speakSentence(L.sentences[si] ?? '', Math.min(1.6, 0.85 * L.rate))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const startPlay = useCallback(() => {
    if (live.current.demo) { demo.current.last = performance.now(); setPlaying(true); return }
    const a = audioRef.current
    if (a) a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [])

  const seekTo = useCallback((t: number, play: boolean, keepOnce = false) => {
    if (!keepOnce) setOnceBoth(-1)
    const L = live.current
    const a = audioRef.current
    const dur = L.duration || (a ? a.duration : 0) || 0
    const nt = Math.max(0, dur > 0 ? Math.min(t, dur) : t)
    if (L.demo) { demo.current.t = nt; demo.current.spoken = -1; stopSpeech() }
    else if (a) a.currentTime = nt
    else return
    setTime(nt)
    setWaiting(-1)
    const loc = locate(L.timing, nt, dur)
    setActive(loc)
    prevSi.current = loc.si
    if (play) startPlay()
  }, [startPlay])

  const togglePlay = () => {
    const L = live.current
    const a = audioRef.current
    if (playing) {
      if (a) a.pause()
      if (L.demo) stopSpeech()
      setPlaying(false)
      return
    }
    // "Şimdi sen söyle" açıkken oynat düğmesi "Devam et" ile aynı işi yapar.
    if (waiting >= 0) { continueShadow(); return }
    const dur = L.duration || (a ? a.duration : 0) || 0
    setOnceBoth(-1)
    // Gölgeleme: bir cümlenin sonunda durmuşken oynata basılırsa sıradaki
    // cümleden devam et (yoksa aynı yerde hemen yeniden durur).
    if (L.shadow) {
      const now = L.demo ? demo.current.t : a ? a.currentTime : 0
      const cur = locate(L.timing, now, dur).si
      const n = L.timing.starts.length
      if (cur >= 0 && cur + 1 < n) {
        const end = endOf(L, cur, dur)
        if (end > 0 && now >= end - 0.05) { seekTo(L.timing.starts[cur + 1] + 0.01, true); return }
      }
    }
    if (L.demo) {
      if (dur > 0 && demo.current.t >= dur - 0.3) demo.current.t = 0
      demo.current.spoken = -1
      prevSi.current = locate(L.timing, demo.current.t, dur).si
      startPlay()
      return
    }
    if (!a) return
    if (dur > 0 && a.currentTime >= dur - 0.2) a.currentTime = 0
    prevSi.current = locate(L.timing, a.currentTime, dur).si
    startPlay()
  }

  const stopAudio = () => {
    const a = audioRef.current
    if (a) a.pause()
    stopSpeech()
    setPlaying(false)
  }

  // Öğretmen önizlemesi: kendi ses dosyanla dene (yalnızca bu sayfa için, kaydedilmez)
  const onPickAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f || !page) return
    stopAudio()
    if (override) URL.revokeObjectURL(override.url)
    setOverride({ key: pageKey, url: URL.createObjectURL(f) })
    notify('Ses yüklendi. Zamanlama bu sayfaya tahmini olarak uyarlandı.')
  }

  const sentStart = (i: number) => timing.starts[i] ?? 0
  const listenOne = (i: number) => {
    if (!canPlayNow()) return
    seekTo(sentStart(i) + 0.01, true)
    setOnceBoth(i)
  }
  const continueShadow = () => {
    if (!page) return
    const w = waiting
    setWaiting(-1)
    if (w >= page.sentences.length - 1) goNext()
    else seekTo(sentStart(w + 1) + 0.01, true)
  }
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
  // Son görünen kitap sayfasının yüksekliği: soru ve bölüm sonu ekranları aynı
  // boyutta açılsın, kutu büyükten küçüğe zıplamasın.
  const spreadH = useRef(0)
  const ctrlRef = useRef<HTMLElement | null>(null)
  const ctrlH = useRef(0)
  useLayoutEffect(() => {
    const el = bookRef.current?.querySelector('.rd-spread') as HTMLElement | null
    if (el) spreadH.current = el.getBoundingClientRect().height
    if (ctrlRef.current && !pos.bitti) ctrlH.current = ctrlRef.current.getBoundingClientRect().height
  })
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
    if (justDone.current.has(pos.section)) { startQuiz(); startFlip(1); setPos(p => ({ ...p, bitti: true })); return }
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
    startQuiz()
    startFlip(1)
    setPos(p => ({ ...p, bitti: true }))
  }

  const stopQSpeak = () => { stopSpeech(); setQSpeak(null) }
  const pickAnswer = (o: string) => {
    stopQSpeak()
    setQuiz(p => {
      if (!p || p.picked !== null) return p
      const res = p.res.slice()
      res[p.qi] = o.trim() === (sectionQs[p.qi]?.answer.trim() ?? '')
      return { ...p, picked: o, res }
    })
  }
  const nextQuestion = () => {
    stopQSpeak()
    setQuiz(p => {
      if (!p) return p
      return p.qi + 1 < sectionQs.length ? { ...p, qi: p.qi + 1, picked: null, done: false } : { ...p, done: true }
    })
    window.scrollTo({ top: 0 })
  }
  const restartQuiz = () => { stopQSpeak(); startQuiz() }
  // Soruyu dinle: önce soru, sonra seçenekler sırayla (tarayıcının ücretsiz sesi)
  const readQuestion = () => {
    if (!quiz || quiz.done) return
    const q = sectionQs[quiz.qi]
    if (!q || !('speechSynthesis' in window)) return
    const syn = window.speechSynthesis
    syn.cancel()
    const parts: { text: string; idx: number }[] = [{ text: q.question, idx: -1 }]
    q.options.forEach((o, k) => parts.push({ text: `${LETTERS[k] ?? ''}. ${o}`, idx: k }))
    parts.forEach((p, n) => {
      const u = new SpeechSynthesisUtterance(p.text.replace(/[“”]/g, ''))
      u.lang = 'en-US'; u.rate = 0.85
      u.onstart = () => setQSpeak(p.idx)
      if (n === parts.length - 1) { u.onend = () => setQSpeak(null); u.onerror = () => setQSpeak(null) }
      syn.speak(u)
    })
    setQSpeak(-1)
  }
  useEffect(() => () => { stopSpeech() }, [])

  const goNext = () => {
    setNotice('')
    stopQSpeak()
    if (pos.idx < secPages.length - 1) { startFlip(1); commit(pos.section, pos.idx + 1, visited) }
    else enterBitti()
    window.scrollTo({ top: 0 })
  }
  const goPrev = () => {
    setNotice('')
    stopQSpeak()
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
    if (swipeHint) hideSwipeHint()
    if (dx < 0) goNext(); else if (pos.idx > 0) goPrev()
  }
  const keyNav = useRef({ next: () => {}, prev: () => {} })
  keyNav.current = { next: () => { if (!pos.bitti) goNext() }, prev: () => { if (pos.bitti || pos.idx > 0) goPrev() } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && el.closest && el.closest('input,textarea')) return
      if (e.key === 'Escape') { setSel(null); setPanel(false); return }
      if (e.key === 'ArrowRight') keyNav.current.next()
      else if (e.key === 'ArrowLeft') keyNav.current.prev()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const canPlay = !!page
  function canPlayNow() { return !!page && !audioError }
  const effHl = timing.exact && hl === 'word' ? 'word' : 'sent'
  // Bu sayfanın balonları (tablodaki hatalı satırlar gösterilmez; kontrol ekranında listelenir)
  const pageBalloons = useMemo(() => !page ? [] : content.balloons.filter(b =>
    b.book === book.code && b.section === page.section && b.page === page.page && b.text.trim() &&
    b.sentence >= 1 && b.sentence <= page.sentences.length &&
    b.x >= 0 && b.x <= 100 && b.y >= 0 && b.y <= 100), [content.balloons, book.code, page])

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
  // Kelimenin bu sayfada ilk geçtiği cümle ("Cümle 2" etiketi)
  const firstSent = useMemo(() => {
    const m = new Map<string, number>()
    sentSpans.forEach((sp, i) => sp.forEach(x => { if (!m.has(x.entry.key)) m.set(x.entry.key, i) }))
    return m
  }, [sentSpans])
  const drawerItems = vocab.filter(v => {
    const m = marks.get(v.key)
    if (filter === 'page') return pageVocabKeys.has(v.key)
    if (filter === 'learning') return m === 'learning'
    return true
  })

  const setLayoutPref = (v: 'single' | 'double') => setLayout(v)

  // ── Ekran yardımcıları ────────────────────────────────────────────────
  const appRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  // Telefonda soru ve bölüm sonu ekranı kitapla aynı boyda kalsın: alttaki çubuk okuma çubuğu kadar yer tutar
  const readBarH = useRef(0)
  // Telefonda "Şimdi sen söyle" ve kelime kartı ses çubuğunun hemen üstünde dursun
  useLayoutEffect(() => {
    const app = appRef.current, bar = barRef.current
    if (!app) return
    if (!bar) { app.style.removeProperty('--rd-barh'); document.documentElement.style.removeProperty('--rd-barh'); return }
    const set = () => {
      const h = bar.getBoundingClientRect().height
      app.style.setProperty('--rd-barh', h + 'px')
      // Sayfanın kökünde de dursun: canlı ders şeridi ses çubuğunun üstüne yerleşsin
      document.documentElement.style.setProperty('--rd-barh', h + 'px')
      if (!pos.bitti) readBarH.current = h
    }
    set()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [pos.bitti, wide, audioError, canPlay, quiz ? 1 : 0])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { document.documentElement.style.removeProperty('--rd-barh') }, [])
  const stopAll = () => { stopAudio(); stopQSpeak() }
  const hasTTS = typeof window !== 'undefined' && 'speechSynthesis' in window
  const sideBySide = vw >= 1050
  const nSent = page ? page.sentences.length : 0
  const actIdx = waiting >= 0 ? waiting : active.si
  const sectionName = secPages.find(p => p.sectionName)?.sectionName ?? ''
  const chapLabel = 'BÖLÜM ' + pos.section + (sectionName ? ' · ' + sectionName.toLocaleUpperCase('en') : '') + (wide ? ' · SAYFA ' + (pos.idx + 1) : '')
  const inQuiz = pos.bitti && !!quiz && !quiz.done && !!sectionQs[quiz.qi]
  const lastPage = pos.idx === secPages.length - 1

  // ── Cümleleri çiz ──────────────────────────────────────────────────────
  const renderSentence = (i: number) => {
    if (!page) return null
    const toks = sentTokens[i]
    const spans = sentSpans[i]
    const isAct = actIdx === i
    const els: React.ReactNode[] = []
    const wordCls = (from: number, to: number) => {
      if (waiting === i) return ' done'
      if (!(effHl === 'word' && active.si === i && timing.exact)) return ''
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
          <span key={k} className={'rd-w v' + (st ? ' ' + (st === 'learning' ? 'learn' : 'known') : '') + wordCls(sp.from, sp.to)}
            role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); stopAudio(); setSel(sp.entry) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); stopAudio(); setSel(sp.entry) } }}>
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
      <div key={i} className={'rd-sc' + (isAct ? ' act' : '')}>
        <div className="rd-sb" onClick={() => { if (canPlayNow()) seekTo(sentStart(i) + 0.01, true) }}>
          <span className="rd-num">{i + 1}</span>
          <span>
            <span className="rd-line">{els}</span>
            {showTrLine ? <span className="rd-tr">{page.translations[i]}</span> : null}
          </span>
        </div>
        {canPlay && !audioError && (
          <button className={'rd-lis' + (once === i ? ' on' : '')} onClick={() => listenOne(i)} aria-label="Bu cümleyi dinle">
            <Ic n="spk" /><span>Dinle</span>
          </button>
        )}
      </div>
    )
  }

  const selMark = sel ? marks.get(sel.key) : undefined

  // ── Ses çubuğu parçaları ───────────────────────────────────────────────
  const segs = page ? page.sentences.map((_, i) => {
    const st = sentStart(i)
    const en = ends && ends[i] != null ? ends[i] : i + 1 < timing.starts.length ? timing.starts[i + 1] : duration
    let f = 0
    if (waiting >= 0 && i <= waiting) f = 100
    else if (time >= en && en > 0) f = 100
    else if (time > st && en > st) f = Math.min(100, ((time - st) / (en - st)) * 100)
    return { flex: Math.max(1, sentTokens[i]?.length ?? 1), fill: f, act: actIdx === i }
  }) : []
  const restIdx = actIdx >= 0 ? actIdx : locate(timing, time, duration).si
  const curLabel = duration > 0 && time >= duration - 0.3 && actIdx < 0 ? 'Sayfa sonu'
    : `Cümle ${Math.max(0, restIdx) + 1} / ${nSent}`
  const segsEl = (
    <div className="rd-segs">
      {segs.map((g, i) => (
        <button key={i} className={'rd-sg' + (g.act ? ' act' : '')} style={{ flex: g.flex }}
          onClick={() => { if (canPlayNow()) seekTo(sentStart(i) + 0.01, true) }} aria-label={`Cümle ${i + 1}`}>
          <i style={{ width: g.fill + '%' }} />
        </button>
      ))}
    </div>
  )
  const tmrEl = (
    <div className="rd-tmr">
      <span>{wide && <span className={'rd-eq' + (playing ? ' on' : '')} aria-hidden="true"><span /><span /><span /><span /></span>}{fmt(time)}</span>
      <span>{curLabel}</span>
      <span>{fmt(duration)}</span>
    </div>
  )
  const playBtn = (
    <button className={'rd-play' + (playing ? ' on' : '')} onClick={togglePlay} aria-label={playing ? 'Duraklat' : 'Oynat'}>
      {playing ? ICON_PAUSE : ICON_PLAY}
    </button>
  )

  // ── Kelime paneli ──────────────────────────────────────────────────────
  const emptyMsg = filter === 'page' ? 'Bu sayfada işaretlenecek kelime yok.'
    : filter === 'learning' ? 'Henüz "Öğreneceğim" dediğin kelime yok.' : 'Bu kitabın kelime listesi henüz boş.'
  const panelEl = (
    <aside className={'rd-pan' + (sideBySide ? '' : ' drawer')} aria-label="Kelimeler">
      <h3><Ic n="words" />Kelimelerim
        <button className="rd-x" onClick={() => setPanel(false)} aria-label="Kelime panelini kapat"><Ic n="x" /></button>
      </h3>
      <div className="rd-seg">
        {([['page', 'Bu sayfa'], ['all', 'Tümü'], ['learning', 'Öğreneceğim']] as const).map(([v, l]) =>
          <button key={v} className={filter === v ? 'on' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      <div className="rd-vlist">
        {drawerItems.length === 0 ? <div className="rd-empty">{emptyMsg}</div> : drawerItems.map(v => {
          const m = marks.get(v.key)
          const here = !pos.bitti && pageVocabKeys.has(v.key)
          const ref = firstSent.get(v.key)
          return (
            <div key={v.key} className={'rd-vw' + (here ? ' here' : '')}>
              <div className="rd-vt1">
                <button className="rd-spk" onClick={() => speakWord(v.word)} aria-label="Telaffuzu dinle"><Ic n="spk2" /></button>
                <div className="t"><b>{v.word}</b>{v.phonetic && <span>{v.phonetic}</span>}</div>
                {here && ref != null && <span className="rd-ref">Cümle {ref + 1}</span>}
              </div>
              {v.meaning && <div className="rd-mean">{v.meaning}</div>}
              <div className="rd-vb">
                <button className={'rd-mk k' + (m === 'known' ? ' on' : '')} aria-pressed={m === 'known'}
                  onClick={() => markWord(v, m === 'known' ? null : 'known')}><Ic n="check" />Biliyorum</button>
                <button className={'rd-mk l' + (m === 'learning' ? ' on' : '')} aria-pressed={m === 'learning'}
                  onClick={() => markWord(v, m === 'learning' ? null : 'learning')}><Ic n="star" />Öğreneceğim</button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="rd-legend"><span><i className="k" />Biliyorum</span><span><i className="l" />Öğreneceğim</span></div>
    </aside>
  )

  // ── Bölüm sonu ve sorular ──────────────────────────────────────────────
  // Soru ve bölüm sonu ekranı, kitabın son görünen boyutunda açılır (kutu zıplamasın)
  const soloStyle = wide && spreadH.current ? { height: spreadH.current, overflowY: 'auto' as const } : undefined
  const trUnlocked = !preview && readCount(pos.section) === 1 && !book.noTranslation
  const moreLinks = (
    <div className="more">
      <button className="rd-link" onClick={() => { stopQSpeak(); rereadSection() }}>Bu bölümü tekrar oku</button>
      <button className="rd-link" onClick={goPrev}>Son sayfaya dön</button>
      {nextSection != null && <button className="rd-link" onClick={() => { stopAll(); onClose() }}>Kitaplara dön</button>}
    </div>
  )
  const mainAction = nextSection != null
    ? <button className="rd-btn pri lg" onClick={() => { stopQSpeak(); goNextSection() }}>Sonraki bölüm<Ic n="arrowR" /></button>
    : <button className="rd-btn pri lg" onClick={() => { stopAll(); onClose() }}><Ic n="books" />Kitaplara dön</button>

  let stage: React.ReactNode
  if (inQuiz && quiz) {
    const q = sectionQs[quiz.qi]
    const answered = quiz.picked !== null
    const right = answered && quiz.picked!.trim() === q.answer.trim()
    stage = (
      <div className="rd-solo" style={soloStyle}>
        <div className="rd-qbox">
          <div className="rd-qh">
            <span>Soru {quiz.qi + 1} / {sectionQs.length}</span>
            <div className="rd-qdots" aria-hidden="true">
              {sectionQs.map((_, i) => <i key={i} className={i === quiz.qi ? 'on' : i < quiz.qi ? (quiz.res[i] ? 'ok' : 'no') : ''} />)}
            </div>
          </div>
          <div className="rd-badge" aria-hidden="true">{book.cover ? <SmartImg name={book.cover} /> : <Ic n="q" />}</div>
          <h2 className="rd-qt" key={quiz.qi}>{q.question}</h2>
          <div className="rd-opts">
            {q.options.map((o, k) => {
              const isAns = o.trim() === q.answer.trim()
              const cls = !answered ? (qSpeak === k ? ' reading' : '') : isAns ? ' good' : o === quiz.picked ? ' bad' : ' dim'
              return (
                <button key={k} className={'rd-op' + cls} disabled={answered} onClick={() => pickAnswer(o)}>
                  <span className="lt">{LETTERS[k]}</span>{o}
                  {answered && isAns && <span className="mk"><Ic n="check" /></span>}
                  {answered && !isAns && o === quiz.picked && <span className="mk"><Ic n="x" /></span>}
                </button>
              )
            })}
          </div>
          {answered && (
            <>
              <div className="rd-exp" role="status">
                <b>{right ? 'Doğru!' : `Doğru cevap: ${q.answer}`}</b>
                {q.explanation}
              </div>
              <button className="rd-btn pri lg" onClick={nextQuestion}>
                {quiz.qi + 1 < sectionQs.length ? 'Sonraki soru' : 'Sonucu gör'}<Ic n="arrowR" />
              </button>
            </>
          )}
        </div>
      </div>
    )
  } else if (pos.bitti) {
    const scored = !!quiz && quiz.done
    const score = quiz ? quiz.res.filter(Boolean).length : 0
    stage = (
      <div className="rd-solo" style={soloStyle}>
        {scored && (
          <div className="rd-conf" aria-hidden="true">
            {CONFETTI.map((c, i) => <i key={i} style={{ left: c[0], background: c[1], animationDelay: c[2] }} />)}
          </div>
        )}
        <div className="rd-res">
          <h2>{nextSection == null ? 'Kitap bitti!' : 'Bölüm bitti!'}</h2>
          {scored && <div className="big">{score} / {sectionQs.length}</div>}
          {scored && <div className="rd-stars" aria-hidden="true">{STAR_FULL}{STAR_FULL}{STAR_FULL}</div>}
          {scored ? <p>Soruların {score} tanesini doğru bildin.</p> : <p>Bu bölümü okudun.</p>}
          {trUnlocked && <p>Artık istersen Türkçesini görebilirsin.</p>}
          <p>{counts.k} kelimeyi biliyorsun, {counts.l} kelimeyi öğreneceksin.</p>
          <div className="acts">
            {mainAction}
            {scored && <button className="rd-btn lg" onClick={restartQuiz}><Ic n="back5" />Soruları tekrar çöz</button>}
          </div>
          {moreLinks}
        </div>
      </div>
    )
  } else if (page) {
    stage = (
      <div className={'rd-spread' + (double ? ' dbl' : '')}>
        <div className="rd-art">
          <div className="rd-scene">
            {page.image ? <SceneImg name={page.image} onAspect={a => setSceneAspect({ img: page.image, a })} /> : <div className="rd-ph"><Ic n="image" />Resim yakında</div>}
            {page.image && pageBalloons.length > 0 && (
              <SceneBalloons key={pageKey} items={pageBalloons} sentences={page.sentences}
                reached={reached.key === pageKey ? reached : { si: -1, wi: -1 }} active={active}
                wordMode={effHl === 'word'} aspect={sceneAspect.img === page.image ? sceneAspect.a : 0} />
            )}
            <div className="rd-sweep" />
            {wide ? (page.place || page.characters.length > 0) && (
              <div className="rd-strip info">
                {page.place && <><Ic n="pin" /><span className="pl">{page.place}</span></>}
                {page.characters.length > 0 && <span className="who">{page.characters.map((c, i) => <span key={i}>{c}</span>)}</span>}
              </div>
            ) : (
              <div className={'rd-strip' + (page.place ? ' info' : '')} aria-label={`Sayfa ${pos.idx + 1} / ${secPages.length}`}>
                {page.place && <><Ic n="pin" /><span className="pl">{page.place}</span></>}
                <span className="pg">{secPages.map((_, i) => <i key={i} className={i === pos.idx ? 'on' : ''} />)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="rd-text">
          <div className="rd-rph">
            <span className="rd-chap">{chapLabel}</span>
            {wide ? (
              canPlay && !audioError && <span className="tap"><Ic n="tap" />Cümleye dokun, ses oradan başlar</span>
            ) : swipeHint ? (
              <span className="rd-hintw">
                <span className="rd-hint"><Ic n="swipe" />Kaydırarak sayfa çevir</span>
                <button className="rd-hx" onClick={hideSwipeHint} aria-label="İpucunu kapat"><Ic n="x" /></button>
              </span>
            ) : null}
          </div>
          {textMode === 'hide' ? (
            <div className="rd-hid">
              <Ic n="spk2" />Metin gizli. Dinle ve resmi takip et.
              <button className="rd-btn pri" onClick={() => setTextMode('show')}>Metni göster</button>
            </div>
          ) : (
            <div className="rd-sents">{page.sentences.map((_, i) => renderSentence(i))}</div>
          )}
          {trState === 'hint' && !book.noTranslation && textMode === 'show' && !trPage && page.translations.length > 0 && (
            <button className="rd-btn rd-trhint" onClick={() => setTrPage(true)}><Ic n="tr" />İstersen Türkçesini görebilirsin</button>
          )}
          <div className="rd-pnav">
            <button className="rd-btn" onClick={goPrev} disabled={pos.idx === 0}><Ic n="chevL" />Önceki sayfa</button>
            <button className="rd-btn pri" onClick={goNext}>{lastPage ? 'Bitir' : 'Sonraki sayfa'}<Ic n="chevR" /></button>
          </div>
          {waiting >= 0 && (
            <div className="rd-say" role="status">
              <div className="top">
                <div className="ic"><Ic n="chat" /></div>
                <div style={{ minWidth: 0 }}><b>Şimdi sen söyle!</b><small>Cümleyi yüksek sesle tekrar et.</small></div>
              </div>
              <div className="acts">
                <button className="rd-btn ghost" onClick={() => seekTo(sentStart(waiting) + 0.01, true)}><Ic n="back5" />Tekrar dinle</button>
                <button className="rd-btn pri" onClick={continueShadow}>
                  {waiting >= page.sentences.length - 1 ? 'Sonraki sayfa' : 'Devam et'}<Ic n="arrowR" />
                </button>
              </div>
            </div>
          )}
          {sel && (
            <div className="rd-wcard" role="dialog" aria-label={sel.word}>
              <div className="t1">
                <button className="rd-spk" onClick={() => speakWord(sel.word)} aria-label="Telaffuzu dinle"><Ic n="spk2" /></button>
                <div style={{ minWidth: 0 }}><b>{sel.word}</b>{sel.phonetic && <span>{sel.phonetic}</span>}</div>
                <button className="rd-x" onClick={() => setSel(null)} aria-label="Kapat"><Ic n="x" /></button>
              </div>
              {sel.meaning && <div className="mean">{sel.meaning}</div>}
              {sel.image && <SmartImg name={sel.image} />}
              {sel.example && <div className="ex">“{sel.example}”</div>}
              <div className="rd-vb">
                <button className={'rd-mk k' + (selMark === 'known' ? ' on' : '')} onClick={() => markWord(sel, 'known')}><Ic n="check" />Biliyorum</button>
                <button className={'rd-mk l' + (selMark === 'learning' ? ' on' : '')} onClick={() => markWord(sel, 'learning')}><Ic n="star" />Öğreneceğim</button>
                {selMark && <button className="rd-mk ghost" onClick={() => markWord(sel, null)}>Sıfırla</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  } else {
    stage = <div className="rd-note">Bu bölümde sayfa yok.</div>
  }

  const sub = pos.bitti
    ? `Bölüm ${pos.section} · ${inQuiz ? 'Sorular' : 'Bitti'}`
    : wide ? `Bölüm ${pos.section} · Sayfa ${pos.idx + 1} / ${secPages.length}` : `Sayfa ${pos.idx + 1}/${secPages.length}`
  const showTab = !panel && wide && !pos.bitti && !!page
  const shadowTg = canPlay ? (
    <button className={'rd-tg' + (shadow ? ' on' : '')} aria-pressed={shadow} onClick={() => { setShadow(s => !s); setWaiting(-1) }}
      title="Her cümleden sonra durur, sıra sana gelir"><Ic n="chatDots" />Gölgeleme<span className="sw" /></button>
  ) : null

  return (
    <div className="rd-app reading" ref={appRef}>
      <header className="rd-hd">
        {wide ? (
          <>
            <button className="rd-btn pri" onClick={() => { stopAll(); onHome() }} aria-label="Ana sayfaya dön"><Ic n="home" />Ana sayfa</button>
            <button className="rd-btn" onClick={() => { stopAll(); onClose() }} aria-label="Kitap listesine dön"><Ic n="books" />Kitaplar</button>
          </>
        ) : (
          <>
            <button className="rd-sq pri" onClick={() => { stopAll(); onHome() }} aria-label="Ana sayfaya dön"><Ic n="home" /></button>
            <button className="rd-sq" onClick={() => { stopAll(); onClose() }} aria-label="Kitap listesine dön"><Ic n="books" /></button>
          </>
        )}
        <div className="rd-ttl">
          <b>{book.title}</b>
          <span>
            {!wide && !pos.bitti && (preview ? 'Önizleme · ' : savedN > 0 ? <><span className="sv" key={savedN}><Ic n="check" />Kaydedildi</span>{' · '}</> : null)}
            {sub}
          </span>
        </div>
        {wide && (preview ? <span className="rd-saved pv">Önizleme</span>
          : savedN > 0 ? <span className="rd-saved" key={savedN}><Ic n="check" />Kaydedildi</span> : null)}
        {wide && !pos.bitti && (
          <div className="rd-pgd" aria-hidden="true">
            {secPages.map((_, i) => <i key={i} className={i === pos.idx ? 'on' : i < pos.idx ? 'past' : ''} />)}
          </div>
        )}
        {wide && <div className="rd-grow" />}
        <button className={'rd-btn wb' + (panel ? ' on' : '')} onClick={() => setPanel(p => !p)} aria-pressed={panel} aria-label="Kelimeler">
          <Ic n="words" />{wide ? 'Kelimeler' : null}<span className="rd-cnt k">{counts.k}</span><span className="rd-cnt l">{counts.l}</span>
        </button>
      </header>

      <section className="rd-ctl" aria-label="Okuma ayarları" ref={ctrlRef}
        style={pos.bitti ? { visibility: 'hidden', minHeight: ctrlH.current || undefined } : undefined}
        aria-hidden={pos.bitti || undefined} inert={pos.bitti || undefined}>
        {!wide && shadowTg}
        <div className="rd-seg"><span className="lbl">Metin</span>
          <button className={textMode === 'show' ? 'on' : ''} aria-pressed={textMode === 'show'} onClick={() => setTextMode('show')}><Ic n="eye" />Açık</button>
          <button className={textMode === 'hide' ? 'on' : ''} aria-pressed={textMode === 'hide'} onClick={() => setTextMode('hide')}><Ic n="eyeOff" />Gizli</button>
        </div>
        {canPlay && timing.exact && (
          <div className="rd-seg"><span className="lbl">Vurgu</span>
            <button className={hl === 'word' ? 'on' : ''} aria-pressed={hl === 'word'} onClick={() => setHl('word')}><Ic n="pen" />Kelime</button>
            <button className={hl === 'sent' ? 'on' : ''} aria-pressed={hl === 'sent'} onClick={() => setHl('sent')}><Ic n="lines" />Cümle</button>
          </div>
        )}
        {wide && shadowTg}
        {trState === 'free' && !book.noTranslation && (
          <button className={'rd-tg' + (showTr ? ' on' : '')} aria-pressed={showTr} onClick={() => setShowTr(s => !s)}><Ic n="tr" />Türkçe<span className="sw" /></button>
        )}
        {wide && (
          <div className="rd-seg"><span className="lbl">Sayfa</span>
            <button className={!double ? 'on' : ''} aria-pressed={!double} onClick={() => setLayoutPref('single')}><Ic n="single" />Tek</button>
            <button className={double ? 'on' : ''} aria-pressed={double} onClick={() => setLayoutPref('double')}><Ic n="double" />Çift</button>
          </div>
        )}
        {canPlay && !hasReal && (
          <button className={'rd-tg' + (voiceOn ? ' on' : '')} aria-pressed={voiceOn}
            title="Gerçek ses dosyası gelene kadar tarayıcının yedek sesi"
            onClick={() => { if (voiceOn) stopSpeech(); demo.current.spoken = -1; setVoiceOn(v => !v) }}><Ic n="wave" />Demo sesi<span className="sw" /></button>
        )}
        {preview && canPlay && (
          <label className="rd-btn rd-file" title="Kendi ses dosyanla dene: bu sayfanın süresine uyarlanır"><Ic n="upload" />MP3 dene
            <input type="file" accept="audio/*" onChange={onPickAudio} />
          </label>
        )}
      </section>

      {notice && <div className="rd-note">{notice}</div>}

      <div className={'rd-main' + (panel && sideBySide ? ' open' : '')}>
        <div className={'rd-book' + (showTab ? ' tabbed' : '')} ref={bookRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {stage}
          {showTab && (
            <button className="rd-etab" onClick={() => setPanel(true)} aria-label="Kelime panelini aç">
              <Ic n="words" /><span className="vt">Kelimeler</span><span className="rd-cnt l">{counts.l}</span>
            </button>
          )}
        </div>
        {panel && sideBySide && panelEl}
      </div>

      {pos.bitti ? (
        <nav className="rd-bar q" ref={barRef} aria-label="Soru kontrolleri"
          style={!wide && readBarH.current ? { minHeight: readBarH.current } : undefined}>
          {inQuiz && hasTTS && (
            <button className={'rd-ib lbl' + (qSpeak !== null ? ' on' : '')} onClick={qSpeak !== null ? stopQSpeak : readQuestion}>
              <Ic n="spk2" />{qSpeak !== null ? 'Durdur' : 'Soruyu dinle'}
            </button>
          )}
          <span className="qlbl">{inQuiz && quiz ? `Soru ${quiz.qi + 1} / ${sectionQs.length}` : quiz ? 'Sorular bitti' : 'Bölüm bitti'}</span>
        </nav>
      ) : canPlay ? (
        <nav className="rd-bar" ref={barRef} aria-label="Ses kontrolleri">
          {audioError ? (
            <span className="msg">Bu sayfanın sesi açılamadı.</span>
          ) : wide ? (
            <>
              <button className="rd-ib" onClick={() => seekTo(time - 5, playing)} aria-label="5 saniye geri"><Ic n="back5" />5</button>
              <button className="rd-ib" onClick={prevSentence} aria-label="Önceki cümle"><Ic n="prevS" /></button>
              {playBtn}
              <button className="rd-ib" onClick={nextSentence} aria-label="Sonraki cümle"><Ic n="nextS" /></button>
              <button className="rd-ib" onClick={() => seekTo(time + 5, playing)} aria-label="5 saniye ileri">5<Ic n="fwd5" /></button>
              <div className="rd-trk">{segsEl}{tmrEl}</div>
              {shadow && <span className="rd-chip"><Ic n="chat" />Gölgeleme açık</span>}
              <div className="rd-spd" role="group" aria-label="Hız">
                {[0.75, 1, 1.25].map(r => <button key={r} className={rate === r ? 'on' : ''} aria-pressed={rate === r} onClick={() => setRate(r)}>{r}×</button>)}
              </div>
            </>
          ) : (
            <>
              {segsEl}
              {tmrEl}
              <div className="rd-ctr">
                <button className="rd-ib" onClick={() => seekTo(time - 5, playing)} aria-label="5 saniye geri"><Ic n="back5" />5</button>
                <button className="rd-ib" onClick={prevSentence} aria-label="Önceki cümle"><Ic n="prevS" /></button>
                {playBtn}
                <button className="rd-ib" onClick={nextSentence} aria-label="Sonraki cümle"><Ic n="nextS" /></button>
                <button className="rd-ib" onClick={() => setRate(r => (r === 0.75 ? 1 : r === 1 ? 1.25 : 0.75))} aria-label="Hız">{rate}×</button>
              </div>
            </>
          )}
        </nav>
      ) : null}

      {panel && !sideBySide && (
        <>
          <div className="rd-scrim" onClick={() => setPanel(false)} />
          {panelEl}
        </>
      )}

      <div className={'rd-toast' + (toast ? ' on' : '')} role="status">{toast}</div>
    </div>
  )
}

const CONFETTI: [string, string, string][] = [
  ['8%', '#FFD54A', '0s'], ['22%', '#8B6CFF', '-.8s'], ['38%', '#22A57B', '-1.6s'],
  ['55%', '#FF8FB8', '-.4s'], ['70%', '#FFD54A', '-1.2s'], ['86%', '#8B6CFF', '-2s'],
]
