// ─── Okuyucu: içerik (Google Sheets) ve metin işleme ─────────────────────────
// Dört sekme ayrı ayrı yayınlanmış CSV olarak okunur. Yeni kitap eklemek için
// aynı sekmelere yeni satır yazmak yeterli, yeni bağlantı gerekmez.
// Beşinci sekme (Balonlar) isteğe bağlıdır: okunamazsa okuyucu balonsuz açılır.

import { SUPABASE_URL } from './auth'

const SHEET_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTLGWOSYwvYAuXQRmMGKy7mGaaV9bWXYzaLk-eTOxa4dQWorXUp57woLMrSkQhxHu8SxfS_VwPF5RRk/pub?single=true&output=csv&gid='
const SHEET_GID = {
  books: '178233925',
  pages: '1667609147',
  vocab: '1368443294',
  questions: '374318237',
  balloons: '1340620273',
}

const CACHE_KEY = 'nc_reader_content_v1'

export interface Book {
  code: string
  title: string
  order: number
  group: string
  noTranslation: boolean
  cover: string
}

export interface PageRow {
  book: string
  section: number
  page: number
  sentences: string[]
  translations: string[]
  audio: string
  image: string
  timing: string
  sectionName: string // bolum_adi: bölümün yalnızca ilk sayfa satırına yazılır
}

export interface VocabEntry {
  book: string
  word: string // kelime ya da kalıp, olduğu gibi
  key: string // saklama anahtarı: küçük harf
  forms: string[] // kendisi + çekimli halleri
  phonetic: string
  meaning: string // Türkçe anlam (Kelimeler sekmesindeki "anlam" sütunu)
  example: string
  image: string
}

export interface QuestionRow {
  book: string
  section: number
  question: string
  options: string[]
  answer: string
  explanation: string
}

// Balonlar sekmesi: kitap_kodu, bolum, sayfa, cumle_no, metin, x, y, kuyruk, konusan
// x, y: kuyruğun ucunun resimdeki yeri (soldan ve yukarıdan yüzde, 0-100).
// kuyruk: kuyruğun balonun hangi köşesinden çıktığı: sol-alt, sag-alt, sol-ust, sag-ust.
export type TailDir = 'sol-alt' | 'sag-alt' | 'sol-ust' | 'sag-ust'
export interface BalloonRow {
  book: string
  section: number
  page: number
  sentence: number // 1'den başlar
  text: string
  x: number // NaN = sayı değil
  y: number
  tail: TailDir
  tailRaw: string // tabloda yazan (kontrol ekranı için)
  speaker: string
}

export interface Content {
  books: Book[]
  pages: PageRow[]
  vocab: VocabEntry[]
  questions: QuestionRow[]
  balloons: BalloonRow[]
  balloonsUnread: boolean // Balonlar sekmesi okunamadı (yayında değil ya da bağlantı yanlış)
  // Kontrol ekranı için: tablodaki ham satır sayıları ve çift kitap kodları
  dupBookCodes: string[]
  stale: boolean // internet yokken kayıtlı kopya kullanıldı
}

// ─── CSV ayrıştırıcı (tırnak, çift tırnak, satır içi satır sonu) ──────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ } else inQ = false
      } else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

function toObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const head = rows[0].map(h => h.trim().toLowerCase())
  return rows.slice(1).map(r => {
    const o: Record<string, string> = {}
    head.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
}

const asInt = (v: string, d: number) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : d
}
const splitBar = (v: string) => (v ? v.split('|').map(x => x.trim()) : [])
const isTrue = (v: string) => /^(true|evet|1|yes)$/i.test(v.trim())

function normGroup(v: string): string {
  return v.trim().toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
}

const asNum = (v: string) => {
  const t = (v || '').trim().replace('%', '').replace(',', '.')
  return t === '' ? NaN : Number(t)
}

export function normTail(v: string): TailDir | null {
  const t = normGroup(v || '').replace(/[\s_]+/g, '-')
  if (!t) return 'sol-alt'
  if (t === 'sol-alt' || t === 'sag-alt' || t === 'sol-ust' || t === 'sag-ust') return t
  return null
}

function build(t: { books: string; pages: string; vocab: string; questions: string; balloons?: string | null }): Content {
  const bookRows = toObjects(t.books)
  const seen = new Set<string>()
  const dup = new Set<string>()
  const books: Book[] = []
  for (const r of bookRows) {
    const code = r['kitap_kodu']
    if (!code) continue
    if (seen.has(code)) { dup.add(code); continue }
    seen.add(code)
    books.push({
      code,
      title: r['kitap_adi'] || code,
      order: asInt(r['sira'], 9999),
      group: normGroup(r['grup'] || ''),
      noTranslation: isTrue(r['ceviri_kapali'] || ''),
      cover: r['kapak'] || '',
    })
  }
  const pages: PageRow[] = toObjects(t.pages)
    .filter(r => r['kitap_kodu'])
    .map(r => ({
      book: r['kitap_kodu'],
      section: asInt(r['bolum'], 1),
      page: asInt(r['sayfa'], 1),
      sentences: splitBar(r['cumleler']),
      translations: splitBar(r['ceviriler']),
      audio: r['ses'] || '',
      image: r['gorsel'] || '',
      timing: r['kelime_zamanlama'] || '',
      sectionName: r['bolum_adi'] || '',
    }))
  const vocab: VocabEntry[] = toObjects(t.vocab)
    .filter(r => r['kitap_kodu'] && r['kelime'])
    .map(r => ({
      book: r['kitap_kodu'],
      word: r['kelime'],
      key: r['kelime'].trim().toLowerCase(),
      forms: [r['kelime'], ...splitBar(r['cekimli_haller'])].filter(Boolean),
      phonetic: r['okunus'] || '',
      meaning: r['anlam'] || '',
      example: r['ornek_cumle'] || '',
      image: r['gorsel'] || '',
    }))
  const questions: QuestionRow[] = toObjects(t.questions)
    .filter(r => r['kitap_kodu'])
    .map(r => ({
      book: r['kitap_kodu'],
      section: asInt(r['bolum'], 1),
      question: r['soru'] || '',
      options: splitBar(r['secenekler']),
      answer: r['dogru_cevap'] || '',
      explanation: r['aciklama'] || '',
    }))
  const balloons: BalloonRow[] = toObjects(t.balloons || '')
    .filter(r => r['kitap_kodu'])
    .map(r => ({
      book: r['kitap_kodu'],
      section: asInt(r['bolum'], 1),
      page: asInt(r['sayfa'], 1),
      sentence: asInt(r['cumle_no'], 0),
      text: r['metin'] || '',
      x: asNum(r['x']),
      y: asNum(r['y']),
      tail: normTail(r['kuyruk'] || '') || 'sol-alt',
      tailRaw: r['kuyruk'] || '',
      speaker: r['konusan'] || '',
    }))
  return { books, pages, vocab, questions, balloons, balloonsUnread: t.balloons == null, dupBookCodes: Array.from(dup), stale: false }
}

async function fetchText(gid: string): Promise<string> {
  // Sitenin diğer tablo okumaları gibi: önbelleğe takılmasın diye zaman damgası eklenir.
  const res = await fetch(`${SHEET_BASE}${gid}&t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('sheet ' + res.status)
  return res.text()
}

// İçeriği çeker. İnternet yoksa en son başarıyla çekilen kopyayı kullanır.
export async function loadContent(): Promise<Content> {
  try {
    const [books, pages, vocab, questions, balloons] = await Promise.all([
      fetchText(SHEET_GID.books), fetchText(SHEET_GID.pages),
      fetchText(SHEET_GID.vocab), fetchText(SHEET_GID.questions),
      // Balonlar okunamazsa boş geçer; okuyucunun geri kalanı etkilenmez
      fetchText(SHEET_GID.balloons).catch(() => null),
    ])
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ books, pages, vocab, questions, balloons })) } catch {}
    return build({ books, pages, vocab, questions, balloons })
  } catch (e) {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const c = build(JSON.parse(raw))
        c.stale = true
        return c
      }
    } catch {}
    throw e
  }
}

export function fileUrl(name: string): string {
  // "/kitaplar/..." gibi site içi yol ya da tam adres verilmişse olduğu gibi kullan
  if (name.startsWith('/') || /^https?:\/\//i.test(name)) return name
  return `${SUPABASE_URL}/storage/v1/object/public/kitaplar/${encodeURIComponent(name)}`
}

// Düz dosya adı (ör. k001-1.mp3) Supabase'te bulunamazsa sitenin kendi kitaplar
// klasörüne bakılır. "/" ya da "http" ile başlayan değerlerin yedeği yoktur.
export function fileUrlFallback(name: string): string | null {
  if (name.startsWith('/') || /^https?:\/\//i.test(name)) return null
  return `/kitaplar/${encodeURIComponent(name)}`
}

// ─── Metin işleme ────────────────────────────────────────────────────────────
// Bir belirteci (boşlukla ayrılmış parça) karşılaştırma için sadeleştirir.
export function normToken(t: string): string {
  return t.toLowerCase().replace(/[’‘`]/g, "'").replace(/^[^a-z0-9ğüşöçıâîû]+|[^a-z0-9ğüşöçıâîû]+$/gi, '')
}

export function tokenize(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean)
}

export interface Span {
  from: number // ilk belirteç
  to: number // son belirteç (dahil)
  entry: VocabEntry
}

interface FormIndex { toks: string[]; entry: VocabEntry }

export function buildFormIndex(vocab: VocabEntry[]): FormIndex[] {
  const list: FormIndex[] = []
  for (const v of vocab) {
    for (const f of v.forms) {
      const toks = tokenize(f).map(normToken).filter(Boolean)
      if (toks.length) list.push({ toks, entry: v })
    }
  }
  // Uzun kalıplar önce denensin (look for, tek başına look'tan önce)
  list.sort((a, b) => b.toks.length - a.toks.length)
  return list
}

// Cümledeki hedef kelime ve kalıpları bulur (çakışma yok, soldan sağa).
export function findSpans(tokens: string[], index: FormIndex[]): Span[] {
  const norm = tokens.map(normToken)
  const spans: Span[] = []
  let i = 0
  while (i < tokens.length) {
    let hit: Span | null = null
    for (const f of index) {
      const n = f.toks.length
      if (i + n > tokens.length) continue
      let ok = true
      for (let k = 0; k < n; k++) if (norm[i + k] !== f.toks[k]) { ok = false; break }
      if (ok) { hit = { from: i, to: i + n - 1, entry: f.entry }; break }
    }
    if (hit) { spans.push(hit); i = hit.to + 1 } else i++
  }
  return spans
}

// ─── Zamanlama ───────────────────────────────────────────────────────────────
// Balon yazısının kelimelerini cümledeki kelimelerle eşleştirir (yan yana, aynı
// sırayla). Bulunursa balonun her kelimesi için cümledeki sıra numarası döner;
// bulunamazsa null (balon yine görünür, yalnızca içinde kelime vurgusu yürümez).
export function matchBalloon(text: string, sentence: string): number[] | null {
  const bw = tokenize(text).map(normToken)
  const sw = tokenize(sentence).map(normToken)
  if (!bw.length || bw.some(w => !w)) return null
  for (let k = 0; k + bw.length <= sw.length; k++) {
    let ok = true
    for (let j = 0; j < bw.length; j++) if (bw[j] !== sw[k + j]) { ok = false; break }
    if (ok) return bw.map((_, j) => k + j)
  }
  return null
}

export interface PageTiming {
  exact: boolean // kelime zamanlaması geçerli mi
  starts: number[] // cümle başlangıçları (saniye)
  words: number[][] // exact ise: her cümlede her belirtecin başlangıcı
}

// kelime_zamanlama: "0 0.4 0.9|2.1 2.6" (cümleler "|" ile)
export function parseWordTiming(raw: string, sentenceTokens: string[][]): number[][] | null {
  if (!raw.trim()) return null
  const parts = raw.split('|').map(p => p.trim())
  if (parts.length !== sentenceTokens.length) return null
  const out: number[][] = []
  for (let i = 0; i < parts.length; i++) {
    const nums = parts[i].split(/\s+/).filter(Boolean).map(Number)
    if (nums.length !== sentenceTokens[i].length) return null
    if (nums.some(n => !Number.isFinite(n) || n < 0)) return null
    for (let k = 1; k < nums.length; k++) if (nums[k] < nums[k - 1]) return null
    out.push(nums)
  }
  for (let i = 1; i < out.length; i++) if (out[i][0] < out[i - 1][0]) return null
  return out
}

// Kelime zamanlaması yoksa cümle başlangıçları sesin süresine harf sayısıyla
// orantılı olarak tahmin edilir.
export function buildTiming(page: PageRow, duration: number): PageTiming {
  const toks = page.sentences.map(tokenize)
  const exactWords = parseWordTiming(page.timing, toks)
  if (exactWords) {
    return { exact: true, starts: exactWords.map(w => w[0] ?? 0), words: exactWords }
  }
  const lens = page.sentences.map(s => Math.max(1, s.length))
  const total = lens.reduce((a, b) => a + b, 0)
  const dur = duration > 0 ? duration : 0
  let acc = 0
  const starts = lens.map(l => { const s = dur * (acc / total); acc += l; return s })
  return { exact: false, starts, words: [] }
}

// ─── Demo sesi için tahmini zamanlama ───────────────────────────────────────
// Ses dosyası yokken tarayıcının sesi cümleleri okur; süreler kelime sayısı ve
// harf uzunluğundan tahmin edilir (prototipteki hesapla aynı).
export interface DemoPlan {
  timing: PageTiming // exact: true (tahmini kelime başlangıçları)
  ends: number[] // her cümlenin tahmini bitişi
  duration: number // toplam süre
}

export function buildDemoPlan(page: PageRow): DemoPlan {
  let t = 0.5
  const starts: number[] = []
  const ends: number[] = []
  const words: number[][] = []
  for (const sentence of page.sentences) {
    const toks = tokenize(sentence)
    const n = Math.max(1, toks.length)
    const wt = toks.map(k => Math.max(2, normToken(k).length) + 1.5)
    const sum = wt.reduce((a, b) => a + b, 0) || 1
    const dur = 0.42 * n + 0.7
    const start = t
    const end = t + dur
    let c = start + 0.05
    const ws = toks.map((_, i) => { const s = c; c += ((dur - 0.2) * wt[i]) / sum; return s })
    starts.push(start); ends.push(end); words.push(ws)
    t = end + 0.35
  }
  return { timing: { exact: true, starts, words }, ends, duration: t }
}

// Öğretmenin "MP3 dene" ile yüklediği dosyanın süresine göre ölçekler
export function scalePlan(p: DemoPlan, duration: number): DemoPlan {
  if (!(duration > 0) || !(p.duration > 0)) return p
  const k = duration / p.duration
  return {
    timing: { exact: true, starts: p.timing.starts.map(x => x * k), words: p.timing.words.map(w => w.map(x => x * k)) },
    ends: p.ends.map(x => x * k),
    duration,
  }
}

// ─── Gölgeleme: sesin cümle içinde gerçekten bittiği yer ────────────────────
// Ses dosyası çözülür, her cümlenin başlangıcı ile sıradakinin başlangıcı
// arasında sesin son duyulduğu an bulunur; üstüne küçük bir güvenlik payı
// eklenir. Böylece gölgeleme cümle arasındaki boş beklemeyi atlar ama son
// kelimenin ucunu kırpmaz. Bir şey ters giderse null döner ve eski davranış
// (sıradaki cümlenin başında durmak) sürer.
export async function measureSpeechEnds(url: string, starts: number[], words: number[][] | null): Promise<number[] | null> {
  try {
    if (!starts.length) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const raw = await res.arrayBuffer()
    const W = window as any
    const Ctx = W.OfflineAudioContext || W.webkitOfflineAudioContext
    if (!Ctx) return null
    const ctx = new Ctx(1, 22050, 22050)
    const audio: AudioBuffer = await new Promise((ok, bad) => {
      const p = ctx.decodeAudioData(raw, ok, bad)
      if (p && typeof p.then === 'function') p.then(ok, bad)
    })
    const data = audio.getChannelData(0)
    const win = Math.max(1, Math.round(audio.sampleRate * 0.01))
    const frame = win / audio.sampleRate
    const n = Math.ceil(data.length / win)
    const peaks = new Float32Array(n)
    let max = 0
    for (let i = 0; i < n; i++) {
      let pk = 0
      const e = Math.min(data.length, (i + 1) * win)
      for (let k = i * win; k < e; k++) { const v = Math.abs(data[k]); if (v > pk) pk = v }
      peaks[i] = pk
      if (pk > max) max = pk
    }
    if (!(max > 0)) return null
    const thr = Math.max(0.006, max * 0.02)
    const dur = audio.duration
    return starts.map((s, i) => {
      const next = i + 1 < starts.length ? starts[i + 1] : dur
      let last = -1
      for (let f = Math.min(n, Math.floor(next / frame)) - 1; f >= Math.ceil(s / frame); f--) {
        if (peaks[f] > thr) { last = f; break }
      }
      if (last < 0) return next
      let end = (last + 1) * frame + 0.15
      const w = words && words[i]
      if (w && w.length) end = Math.max(end, w[w.length - 1] + 0.15)
      return Math.min(end, i + 1 < starts.length ? next - 0.05 : dur)
    })
  } catch {
    return null
  }
}

// ─── İçerik kontrolü (yalnızca öğretmen ekranı) ─────────────────────────────
export interface Issue {
  level: 'hata' | 'uyari'
  book: string
  where: string
  text: string
}

export function checkContent(c: Content): Issue[] {
  const out: Issue[] = []
  const bookCodes = new Set(c.books.map(b => b.code))
  const bookById = new Map(c.books.map(b => [b.code, b]))
  const add = (level: Issue['level'], book: string, where: string, text: string) =>
    out.push({ level, book, where, text })

  for (const code of c.dupBookCodes) add('hata', code, 'Kitaplar', 'Bu kitap kodu tabloda birden fazla kez yazılmış. Yalnızca ilk satır kullanılıyor.')

  // Aynı grupta aynı sıra numarası
  const orderSeen = new Map<string, string>()
  for (const b of c.books) {
    if (!b.group) add('uyari', b.code, 'Kitaplar', 'Grup boş. Bu kitap hiçbir öğrenciye görünmez.')
    if (b.order === 9999) add('uyari', b.code, 'Kitaplar', 'Sıra numarası yok ya da sayı değil.')
    const k = b.group + '#' + b.order
    if (b.order !== 9999 && orderSeen.has(k)) add('uyari', b.code, 'Kitaplar', `Aynı grupta ${orderSeen.get(k)} ile aynı sıra numarasını taşıyor.`)
    else orderSeen.set(k, b.code)
  }

  // Sayfalar
  const pageSeen = new Set<string>()
  const pagesByBook = new Map<string, PageRow[]>()
  for (const p of c.pages) {
    const where = `Sayfalar · bölüm ${p.section}, sayfa ${p.page}`
    if (!bookCodes.has(p.book)) { add('hata', p.book, where, 'Bu kitap kodu Kitaplar sekmesinde yok.'); continue }
    const key = `${p.book}#${p.section}#${p.page}`
    if (pageSeen.has(key)) add('hata', p.book, where, 'Aynı bölüm ve sayfa numarası iki kez yazılmış.')
    pageSeen.add(key)
    const arr = pagesByBook.get(p.book) || []
    arr.push(p); pagesByBook.set(p.book, arr)

    if (!p.sentences.length) add('hata', p.book, where, 'Cümleler boş.')
    const closed = bookById.get(p.book)?.noTranslation
    if (p.translations.length === 0) {
      if (!closed) add('uyari', p.book, where, 'Çeviriler boş (çeviri bu kitapta kapalı değil).')
    } else if (p.translations.length !== p.sentences.length) {
      add('hata', p.book, where, `Cümle sayısı ${p.sentences.length}, çeviri sayısı ${p.translations.length}. Eşit olmalı.`)
    }
    if (p.timing.trim()) {
      const toks = p.sentences.map(tokenize)
      if (!parseWordTiming(p.timing, toks)) {
        add('hata', p.book, where, 'Kelime zamanlaması cümlelerle uyuşmuyor (cümle sayısı, kelime sayısı ya da sıra). Bu sayfada kelime vurgusu çalışmaz.')
      }
      if (!p.audio) add('uyari', p.book, where, 'Zamanlama var ama ses dosyası adı boş.')
    }
  }

  for (const b of c.books) {
    if (!pagesByBook.has(b.code)) add('uyari', b.code, 'Sayfalar', 'Bu kitabın hiç sayfası yok.')
  }

  // Kelimeler
  const vocabSeen = new Set<string>()
  const byBook = new Map<string, VocabEntry[]>()
  for (const v of c.vocab) {
    const where = `Kelimeler · ${v.word}`
    if (!bookCodes.has(v.book)) { add('hata', v.book, where, 'Bu kitap kodu Kitaplar sekmesinde yok.'); continue }
    const key = v.book + '#' + v.key
    if (vocabSeen.has(key)) add('uyari', v.book, where, 'Bu kelime aynı kitapta iki kez yazılmış.')
    vocabSeen.add(key)
    const arr = byBook.get(v.book) || []
    arr.push(v); byBook.set(v.book, arr)
  }
  for (const [code, list] of byBook) {
    const idx = buildFormIndex(list)
    const found = new Set<string>()
    for (const p of pagesByBook.get(code) || []) {
      for (const s of p.sentences) for (const sp of findSpans(tokenize(s), idx)) found.add(sp.entry.key)
    }
    for (const v of list) {
      if (!found.has(v.key)) add('hata', code, `Kelimeler · ${v.word}`, 'Hedef kelime kitabın metninde geçmiyor (çekimli halleri de arandı).')
    }
  }

  // Balonlar
  if (c.balloonsUnread) add('uyari', '', 'Balonlar', 'Balonlar sekmesi okunamadı. Okuyucu balonsuz açılıyor.')
  const pageByKey = new Map(c.pages.map(p => [`${p.book}#${p.section}#${p.page}`, p]))
  for (const b of c.balloons) {
    const where = `Balonlar · bölüm ${b.section}, sayfa ${b.page} · ${b.text.slice(0, 30) || 'yazısız'}`
    if (!bookCodes.has(b.book)) { add('hata', b.book, where, 'Bu kitap kodu Kitaplar sekmesinde yok.'); continue }
    const p = pageByKey.get(`${b.book}#${b.section}#${b.page}`)
    if (!p) { add('hata', b.book, where, 'Bu bölüm ve sayfa Sayfalar sekmesinde yok. Balon görünmez.'); continue }
    if (!b.text.trim()) add('hata', b.book, where, 'Balon yazısı (metin) boş. Balon görünmez.')
    if (b.sentence < 1 || b.sentence > p.sentences.length) {
      add('hata', b.book, where, `cumle_no 1 ile ${p.sentences.length} arasında olmalı. Balon görünmez.`)
    } else if (b.text.trim() && !matchBalloon(b.text, p.sentences[b.sentence - 1])) {
      add('uyari', b.book, where, `Balon yazısı ${b.sentence}. cümlede aynı sırayla geçmiyor. Balon görünür ama içinde kelime vurgusu yürümez.`)
    }
    if (!(b.x >= 0 && b.x <= 100) || !(b.y >= 0 && b.y <= 100)) add('hata', b.book, where, 'x ve y 0 ile 100 arasında bir sayı olmalı. Balon görünmez.')
    if (!normTail(b.tailRaw)) add('uyari', b.book, where, `Kuyruk "${b.tailRaw}" tanınmadı; sol-alt kullanılıyor. Seçenekler: sol-alt, sag-alt, sol-ust, sag-ust.`)
  }

  // Sorular
  for (const q of c.questions) {
    const where = `Sorular · bölüm ${q.section} · ${q.question.slice(0, 40)}`
    if (!bookCodes.has(q.book)) { add('hata', q.book, where, 'Bu kitap kodu Kitaplar sekmesinde yok.'); continue }
    if (!q.question) add('hata', q.book, where, 'Soru metni boş.')
    if (q.options.length < 2) add('hata', q.book, where, 'En az iki seçenek olmalı.')
    if (!q.options.includes(q.answer)) add('hata', q.book, where, 'Doğru cevap seçeneklerden biriyle birebir aynı değil.')
    if (!q.explanation) add('uyari', q.book, where, 'Açıklama boş.')
    const hasSection = (pagesByBook.get(q.book) || []).some(p => p.section === q.section)
    if (!hasSection) add('uyari', q.book, where, `Bu kitapta bölüm ${q.section} diye bir bölüm yok.`)
  }
  return out
}
