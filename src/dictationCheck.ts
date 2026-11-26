/* ─────────────────────────────────────────────────────────────────────────────
   dictationCheck — Dictation cevap kontrolü (25 Kasım 2026, Hatice'nin onayı).
   Üç Dictation ekranı da bunu kullanır: ünite Dictation'ı (App.tsx),
   P "Free Module" dosya seç Dictation'ı (PrivateDictation.tsx) ve çocuk
   Dictation'ı (KidsTopics.tsx). Shadowing ve Drill bunu KULLANMAZ.

   Kurallar:
   1. Kelimeler sıraya göre değil HİZALANARAK karşılaştırılır: her kelime
      doğru / yanlış / eksik / fazladan; bir eksik ya da fazla kelime gerisini
      kaydırmaz.
   2. Büyük-küçük harf, noktalama ve kısa çizgi (-) sayılmaz; kesme işareti (')
      sayılır (it's ≠ its, we're ≠ were).
      Kısa çizgi: well-known = well known = wellknown; email = e-mail.
   3. Kısaltma açık yazılırsa (ya da kayıttaki açık hâl kısaltılırsa) yanlış
      sayılmaz; kelime ayrı renkle işaretlenir, not çıkar.
   4. Sayılar: rakam da yazı da doğru (13 = thirteen, 21 = twenty-one,
      100 = a hundred / one hundred, 1990 = nineteen ninety, 7:30 = seven
      thirty, 21st = twenty-first). Yazıyla yazılan sayının yazımı kontrol
      edilir (thirten tanınmaz → yanlış).
   5. Özel isimler beklenmez: ekranda baştan gösterilir; yazılsa da, yazılmasa
      da, yanlış yazılsa da hata sayılmaz. İsmi site kendisi bulur (cümle
      ortasında büyük harfle başlayan kelime; aynı ünitede bir kez bulunan
      isim ünitenin her yerinde isimdir). Günler, aylar, diller, milliyetler,
      unvanlar, "I" vb. her zaman öğrenciden beklenir. Units'teki isteğe bağlı
      dictation_goster / dictation_sor sütunları istisnaları düzeltir.
────────────────────────────────────────────────────────────────────────────── */

export type DictHintPart = { word: string; kind: 'ok' | 'hint' | 'mask'; name?: boolean }

export type DictOpKind = 'ok' | 'contraction' | 'name' | 'wrong' | 'missing' | 'extra'
export interface DictOp {
  kind: DictOpKind
  target: string   // kayıttaki kelime(ler) — ekrandaki yazımıyla ('' = fazladan kelime)
  typed: string    // öğrencinin yazdığı kelime(ler) ('' = eksik / yazılmamış isim)
}
export interface DictNote { recorded: string; contracted: boolean }  // contracted: kayıtta kısaltma var
export interface DictResult {
  allOk: boolean
  ops: DictOp[]
  hintParts: DictHintPart[]
  notes: DictNote[]       // kısaltma farkları (doğru sayıldı, bilgi için)
  extras: string[]        // fazladan yazılan kelimeler
}

// ── Kelime düzeltme ──────────────────────────────────────────────────────────

function splitWords(text: string): string[] {
  return text.replace(/[—–]/g, ' ').trim().split(/\s+/).filter(Boolean)
}

const APOS = /[’‘`´ʼ]/g

// Bir kelimenin karşılaştırma için sade hâli: küçük harf, baş/son noktalama
// atılır; içeride yalnızca harf, rakam, kesme işareti ve kısa çizgi kalır.
// Rakamlı yazımlarda (1,000 / 2.5 / 7:30) içteki , . : korunur.
function normWord(w: string): string {
  let s = w.replace(APOS, "'").toLowerCase()
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (/^\d[\d,.:]*\d(st|nd|rd|th|s)?$/.test(s) || /^\d(st|nd|rd|th|s)?$/.test(s)) return s
  return s.replace(/[^\p{L}\p{N}'-]/gu, '')
}

// ── Kısaltmalar ──────────────────────────────────────────────────────────────

const S_BASES = new Set(['it', 'he', 'she', 'that', 'what', 'where', 'who', 'there', 'here', 'how', 'when', 'why', 'this'])
const D_BASES = new Set(['i', 'you', 'he', 'she', 'we', 'they', 'it', 'there', 'who', 'that', 'what'])

type Alt = { s: string; exp: boolean }

// Bir kelimenin kabul edilen hâlleri (exp: kısaltma açılarak elde edildi)
function wordAlts(w: string): Alt[] {
  const out: Alt[] = []
  const add = (s: string, exp: boolean) => {
    const parts = s.split(' ').filter(Boolean)
    const spaced = parts.map(p => p.replace(/-/g, ' ')).join(' ').replace(/\s+/g, ' ').trim()
    if (spaced) out.push({ s: spaced, exp })
    if (s.includes('-')) out.push({ s: parts.map(p => p.replace(/-/g, '')).join(' '), exp })
  }
  add(w, false)
  if (w === 'cannot') add('can not', false)
  if (w.includes("'")) {
    let m: RegExpMatchArray | null
    if (w === "won't") add('will not', true)
    else if (w === "can't") add('can not', true)
    else if (w === "shan't") add('shall not', true)
    else if (w === "let's") add('let us', true)
    else if ((m = w.match(/^(.+)n't$/))) add(`${m[1]} not`, true)
    else if ((m = w.match(/^(.+)'re$/))) add(`${m[1]} are`, true)
    else if ((m = w.match(/^(.+)'ve$/))) add(`${m[1]} have`, true)
    else if ((m = w.match(/^(.+)'ll$/))) add(`${m[1]} will`, true)
    else if ((m = w.match(/^(.+)'m$/))) add(`${m[1]} am`, true)
    else if ((m = w.match(/^(.+)'s$/)) && S_BASES.has(m[1])) { add(`${m[1]} is`, true); add(`${m[1]} has`, true) }
    else if ((m = w.match(/^(.+)'d$/)) && D_BASES.has(m[1])) { add(`${m[1]} would`, true); add(`${m[1]} had`, true) }
  }
  return out
}

// ── Sayılar ──────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const ORD: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
  hundredth: 100, thousandth: 1000,
}

// "one hundred and twenty five", "a thousand", "twenty one" → sayı; olmazsa null
function parseCardinal(toks: string[]): number | null {
  if (toks.length === 0) return null
  let total = 0, current = 0, last: 'none' | 'unit' | 'tens' | 'hundred' | 'scale' | 'and' = 'none'
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t === 'a' && i === 0 && ['hundred', 'thousand', 'million'].includes(toks[1] ?? '')) { current = 1; last = 'unit'; continue }
    if (t in UNITS) {
      if (last === 'unit' || (last === 'tens' && UNITS[t] >= 10) || (last === 'tens' && UNITS[t] === 0)) return null
      current += UNITS[t]; last = 'unit'; continue
    }
    if (t in TENS) {
      if (last === 'unit' || last === 'tens' || current % 100 !== 0 && last !== 'and' && last !== 'hundred') return null
      current += TENS[t]; last = 'tens'; continue
    }
    if (t === 'hundred') {
      if (last !== 'unit' || current === 0 || current >= 100) return null
      current *= 100; last = 'hundred'; continue
    }
    if (t === 'thousand' || t === 'million') {
      if (last === 'none' || last === 'and' || current === 0) return null
      total += current * (t === 'thousand' ? 1000 : 1000000); current = 0; last = 'scale'; continue
    }
    if (t === 'and') {
      if (last !== 'hundred' && last !== 'scale') return null
      last = 'and'; continue
    }
    return null
  }
  if (last === 'and') return null
  return total + current
}

// 0–99 arası tek parça ("ninety", "twenty six", "oh five")
function parseSmall(toks: string[]): number | null {
  if (toks.length === 2 && (toks[0] === 'oh' || toks[0] === 'o') && toks[1] in UNITS && UNITS[toks[1]] >= 1 && UNITS[toks[1]] <= 9) return UNITS[toks[1]]
  const v = parseCardinal(toks)
  return v !== null && v < 100 && !toks.includes('hundred') && !toks.includes('a') ? v : null
}

function digitsValue(s: string): number | null {
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''))
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  return null
}

// Bir yazımın sayı olarak bütün okunuşları: "#1990", "o#21" (sıra sayısı), "t7:30" (saat)
function numberCanon(s: string): string[] {
  const out: string[] = []
  const toks = s.split(' ').filter(Boolean)
  if (toks.length === 0) return out
  // Rakam
  if (toks.length === 1) {
    const t = toks[0]
    let m: RegExpMatchArray | null
    const dv = digitsValue(t)
    if (dv !== null) out.push(`#${dv}`)
    if ((m = t.match(/^(\d+)(st|nd|rd|th)$/))) out.push(`o#${Number(m[1])}`)
    if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) out.push(`t${Number(m[1])}:${m[2]}`)
    if ((m = t.match(/^(\d+)s$/))) out.push(`s#${Number(m[1])}`)   // 1990s
  }
  if (toks.length === 2 && toks[1] === "o'clock") {
    const h = digitsValue(toks[0]) ?? parseCardinal([toks[0]])
    if (h !== null && h >= 0 && h <= 24) out.push(`t${h}:00`)
  }
  // Yazıyla
  const c = parseCardinal(toks)
  if (c !== null) out.push(`#${c}`)
  // Sıra sayısı: son kelime first/twenty-first…
  const lastTok = toks[toks.length - 1]
  if (lastTok in ORD) {
    const base = ORD[lastTok]
    if (toks.length === 1) out.push(`o#${base}`)
    else {
      const head = parseCardinal(toks.slice(0, -1))
      if (head !== null && (base < 10 ? head % 10 === 0 && head >= 20 : true) && (base >= 100 || head % 100 === 0 || base < 10)) out.push(`o#${base >= 100 ? head * base : head + base}`)
    }
  }
  // Yıl: "nineteen ninety", "twenty twenty six", "nineteen oh five", "nineteen hundred"
  for (let k = 1; k <= 2 && k < toks.length; k++) {
    const a = parseSmall(toks.slice(0, k))
    if (a === null || a < 10) continue
    const rest = toks.slice(k)
    if (rest.length === 1 && rest[0] === 'hundred') { out.push(`#${a * 100}`); continue }
    const b = parseSmall(rest)
    if (b !== null && (b >= 10 || rest[0] === 'oh' || rest[0] === 'o')) out.push(`#${a * 100 + b}`)
  }
  // On yıllar: "nineteen nineties" → s#1990
  if (toks.length >= 2) {
    const lt = toks[toks.length - 1]
    const plural = lt.endsWith('ies') ? lt.slice(0, -3) + 'y' : lt.endsWith('s') ? lt.slice(0, -1) : ''
    if (plural && plural in TENS) {
      const a = parseSmall(toks.slice(0, -1))
      if (a !== null && a >= 10) out.push(`s#${a * 100 + TENS[plural]}`)
    }
  }
  // Saat: "seven thirty", "seven oh five", "seven o'clock"
  if (toks.length >= 2) {
    const h = parseSmall([toks[0]])
    if (h !== null && h <= 24) {
      const rest = toks.slice(1)
      if (rest.length === 1 && rest[0] === "o'clock") out.push(`t${h}:00`)
      else {
        const mn = parseSmall(rest)
        if (mn !== null && mn < 60 && (mn >= 10 || rest[0] === 'oh' || rest[0] === 'o')) out.push(`t${h}:${String(mn).padStart(2, '0')}`)
      }
    }
  }
  return out
}

// ── Eşdeğerlik ───────────────────────────────────────────────────────────────

const NUM_HELPERS = new Set(['hundred', 'thousand', 'million', 'and', 'a', 'oh', 'o', "o'clock", 'cannot'])
function isSpecial(w: string): boolean {
  if (/['\-\d]/.test(w) || NUM_HELPERS.has(w) || w in UNITS || w in TENS || w in ORD) return true
  const plural = w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') ? w.slice(0, -1) : ''
  return !!plural && plural in TENS
}

type Canon = { keys: Set<string>; exp: boolean }

const canonCache = new Map<string, Canon[]>()
function groupCanons(words: string[]): Canon[] {
  const ck = words.join('\u0001')
  const hit = canonCache.get(ck)
  if (hit) return hit
  const res = buildCanons(words)
  if (canonCache.size > 5000) canonCache.clear()
  canonCache.set(ck, res)
  return res
}

function buildCanons(words: string[]): Canon[] {
  let alts: Alt[] = [{ s: '', exp: false }]
  for (const w of words) {
    const next: Alt[] = []
    for (const a of alts) for (const b of wordAlts(w)) {
      next.push({ s: a.s ? `${a.s} ${b.s}` : b.s, exp: a.exp || b.exp })
      if (next.length > 64) break
    }
    alts = next
  }
  return alts.map(a => {
    const keys = new Set<string>([a.s])
    for (const n of numberCanon(a.s)) keys.add(n)
    return { keys, exp: a.exp }
  })
}

// 'ok' | 'contraction' | null
function groupsEqual(t: string[], y: string[]): 'ok' | 'contraction' | null {
  const tc = groupCanons(t), yc = groupCanons(y)
  let found: 'contraction' | null = null
  for (const a of tc) for (const b of yc) {
    let hit = false
    for (const k of a.keys) if (b.keys.has(k)) { hit = true; break }
    if (!hit) continue
    if (!a.exp && !b.exp) return 'ok'
    found = 'contraction'
  }
  return found
}

// ── Özel isimler ─────────────────────────────────────────────────────────────

const MUST_KNOW = new Set([
  'i', 'ok', 'okay', 'tv', 'god',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'christmas', 'easter', 'halloween', 'ramadan',
  'mr', 'mrs', 'ms', 'miss', 'mister', 'dr', 'doctor', 'professor', 'prof', 'sir', 'madam', 'madame', 'lord', 'lady',
  'captain', 'uncle', 'aunt', 'auntie', 'mum', 'mom', 'mummy', 'mommy', 'dad', 'daddy', 'grandma', 'grandpa', 'granny', 'grandad', 'grandmother', 'grandfather',
  'english', 'turkish', 'french', 'german', 'spanish', 'italian', 'russian', 'chinese', 'japanese', 'korean', 'arabic', 'greek',
  'portuguese', 'dutch', 'polish', 'swedish', 'norwegian', 'danish', 'finnish', 'hungarian', 'czech', 'ukrainian', 'bulgarian',
  'romanian', 'latin', 'hindi', 'persian', 'hebrew', 'swiss', 'austrian', 'belgian', 'irish', 'scottish', 'welsh', 'british',
  'american', 'canadian', 'australian', 'indian', 'mexican', 'brazilian', 'egyptian', 'european', 'african', 'asian', 'muslim', 'christian',
])

// İsim anahtarı: küçük harf, iyelik/kısaltma eki atılır (Harry's → harry, I'm → i)
function nameKey(w: string): string {
  const s = normWord(w)
  return s.replace(/'(s|m|ll|ve|d|re)$/, '').replace(/'$/, '')
}

function startsUpper(w: string): boolean {
  const core = w.replace(APOS, "'").replace(/^[^\p{L}\p{N}]+/u, '')
  return /^\p{Lu}/u.test(core)
}
function isAllCaps(w: string): boolean {
  const letters = w.replace(/[^\p{L}]/gu, '')
  return letters.length > 1 && letters === letters.toUpperCase()
}

// Units hücresi ("Harry, Hermione Granger") → anahtarlar
export function parseNameCell(cell: string | undefined): string[] {
  return (cell ?? '').split(/[,;|/\n]+/).flatMap(p => splitWords(p)).map(nameKey).filter(Boolean)
}

export interface DictNameOptions { show?: string[]; ask?: string[] }

// Ünitenin bütün cümlelerinden isim kümesi
export function buildNameSet(texts: string[], opts: DictNameOptions = {}): Set<string> {
  const ask = new Set((opts.ask ?? []).map(k => k.toLowerCase()))
  const names = new Set<string>()
  for (const text of texts) {
    const words = splitWords(text ?? '').filter(w => /[\p{L}\p{N}]/u.test(w))
    words.forEach((w, i) => {
      const prev = words[i - 1]
      const initial = i === 0 || /[.!?…:"“”]$/.test(prev) || /^["“'‘]/.test(w)
      if (initial || !startsUpper(w) || isAllCaps(w)) return
      const k = nameKey(w)
      if (!k || /^\d/.test(k) || MUST_KNOW.has(k) || ask.has(k)) return
      names.add(k)
    })
  }
  for (const k of opts.show ?? []) if (k) names.add(k.toLowerCase())
  for (const k of ask) names.delete(k)
  return names
}

function isNameWord(w: string, names: Set<string>): boolean {
  return names.size > 0 && startsUpper(w) && names.has(nameKey(w))
}

function displayName(w: string): string {
  return w.replace(APOS, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/'s$/, '')
}

// Cümlede geçen isimler (ekranda baştan gösterilir)
export function namesInSentence(text: string, names: Set<string>): string[] {
  const out: string[] = []
  for (const w of splitWords(text ?? '')) {
    if (!isNameWord(w, names)) continue
    const d = displayName(w)
    if (d && !out.includes(d)) out.push(d)
  }
  return out
}

// ── Hizalama ─────────────────────────────────────────────────────────────────

type Step =
  | { t: 'match'; a: number; b: number; kind: 'ok' | 'contraction' }
  | { t: 'name'; b: number }
  | { t: 'wrong' }
  | { t: 'missing' }
  | { t: 'extra' }

const MAXG = 6

function lettersOf(s: string): string { return s.replace(/[^\p{L}]/gu, '') }

// İki yazım arasındaki harf farkı sayısı (isim iki kelimeye bölünmüş yazıldıysa: "Mac Gonagall")
function editDistance(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, k) => k)
  for (let x = 1; x <= a.length; x++) {
    let prev = d[0]; d[0] = x
    for (let y = 1; y <= b.length; y++) {
      const tmp = d[y]
      d[y] = Math.min(d[y] + 1, d[y - 1] + 1, prev + (a[x - 1] === b[y - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return d[b.length]
}

export function checkDictation(targetText: string, typedText: string, names: Set<string> = new Set()): DictResult {
  // Ekrandaki yazımlar + karşılaştırma hâlleri (noktalamadan ibaret "kelimeler" atılır)
  const tRaw = splitWords(targetText ?? '').map(w => ({ raw: w, n: normWord(w) })).filter(x => x.n)
  const yRaw = splitWords(typedText ?? '').map(w => ({ raw: w, n: normWord(w) })).filter(x => x.n)
  const T = tRaw.map(x => x.n), Y = yRaw.map(x => x.n)
  const isName = tRaw.map(x => isNameWord(x.raw, names))
  const n = T.length, m = Y.length

  // Çok kelimelik eşleşme yalnızca kısaltma, kısa çizgi, sayı ya da birleşik yazım varsa mümkündür
  const specialT = T.map(isSpecial), specialY = Y.map(isSpecial)
  const eqMemo = new Map<string, 'ok' | 'contraction' | null>()
  const eq = (i: number, a: number, j: number, b: number) => {
    if ((a > 1 || b > 1) && !specialT.slice(i, i + a).some(Boolean) && !specialY.slice(j, j + b).some(Boolean)) {
      // "grandmother" / "grand mother" gibi birleşik yazım farkı sayılmaz → özel kelime yoksa çok kelimelik eşleşme yok
      return null
    }
    const key = `${i},${a},${j},${b}`
    if (!eqMemo.has(key)) eqMemo.set(key, groupsEqual(T.slice(i, i + a), Y.slice(j, j + b)))
    return eqMemo.get(key)!
  }

  const INF = 1e9
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF))
  const back: (Step | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null))
  cost[0][0] = 0
  const relax = (i: number, j: number, c: number, s: Step) => {
    if (c < cost[i][j] - 1e-9) { cost[i][j] = c; back[i][j] = s }
  }
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c0 = cost[i][j]
      if (c0 >= INF) continue
      if (i < n && isName[i]) {
        // İsim: hiç yazılmamış, tek kelime ya da (uzunluğu tutarsa) iki kelime
        relax(i + 1, j, c0 + 0.1, { t: 'name', b: 0 })
        if (j < m) relax(i + 1, j + 1, c0 + (eq(i, 1, j, 1) ? 0 : 0.05 + 0.001 * editDistance(lettersOf(Y[j]), lettersOf(nameKey(T[i])))), { t: 'name', b: 1 })
        if (j + 1 < m && editDistance(lettersOf(Y[j] + Y[j + 1]), lettersOf(nameKey(T[i]))) <= 2) relax(i + 1, j + 2, c0 + 0.6, { t: 'name', b: 2 })
      }
      if (i < n && !isName[i]) {
        for (let a = 1; a <= MAXG && i + a <= n; a++) {
          if (a > 1 && isName[i + a - 1]) break
          for (let b = 1; b <= MAXG && j + b <= m; b++) {
            const r = eq(i, a, j, b)
            if (r) relax(i + a, j + b, c0 + 0.001 * (a + b - 2), { t: 'match', a, b, kind: r })
          }
        }
        if (j < m) relax(i + 1, j + 1, c0 + 1, { t: 'wrong' })
        relax(i + 1, j, c0 + 1, { t: 'missing' })
      }
      if (j < m) relax(i, j + 1, c0 + 1, { t: 'extra' })
    }
  }

  // Geri izleme
  const steps: { s: Step; i: number; j: number }[] = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    const s = back[i][j]
    if (!s) break
    let pi = i, pj = j
    if (s.t === 'match') { pi -= s.a; pj -= s.b }
    else if (s.t === 'name') { pi -= 1; pj -= s.b }
    else if (s.t === 'wrong') { pi -= 1; pj -= 1 }
    else if (s.t === 'missing') { pi -= 1 }
    else { pj -= 1 }
    steps.push({ s, i: pi, j: pj })
    i = pi; j = pj
  }
  steps.reverse()

  const ops: DictOp[] = []
  const notes: DictNote[] = []
  const extras: string[] = []
  // Kayıttaki her kelimenin durumu (ipucu için)
  const tState: ('ok' | 'name' | 'bad')[] = new Array(n).fill('bad')
  const joinT = (a: number, len: number) => tRaw.slice(a, a + len).map(x => x.raw).join(' ')
  const joinY = (a: number, len: number) => yRaw.slice(a, a + len).map(x => x.raw).join(' ')
  for (const { s, i: si, j: sj } of steps) {
    if (s.t === 'match') {
      ops.push({ kind: s.kind, target: joinT(si, s.a), typed: joinY(sj, s.b) })
      for (let k = si; k < si + s.a; k++) tState[k] = 'ok'
      if (s.kind === 'contraction') {
        const rec = tRaw.slice(si, si + s.a).map(x => x.raw.replace(APOS, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || x.raw).join(' ')
        notes.push({ recorded: rec, contracted: T.slice(si, si + s.a).some(w => w.includes("'")) })
      }
    } else if (s.t === 'name') {
      ops.push({ kind: 'name', target: tRaw[si].raw, typed: joinY(sj, s.b) })
      tState[si] = 'name'
    } else if (s.t === 'wrong') {
      ops.push({ kind: 'wrong', target: tRaw[si].raw, typed: yRaw[sj].raw })
    } else if (s.t === 'missing') {
      ops.push({ kind: 'missing', target: tRaw[si].raw, typed: '' })
    } else {
      ops.push({ kind: 'extra', target: '', typed: yRaw[sj].raw })
      extras.push(yRaw[sj].raw)
    }
  }
  const allOk = ops.every(o => o.kind === 'ok' || o.kind === 'contraction' || o.kind === 'name')

  // İpucu: doğru yazılanlar ve isimler açık, ilk eksik/yanlış kelime ipucu, kalan eksikler gizli
  const hintParts: DictHintPart[] = []
  let hinted = false
  tRaw.forEach((x, k) => {
    if (tState[k] === 'ok') hintParts.push({ word: x.raw, kind: 'ok' })
    else if (tState[k] === 'name') hintParts.push({ word: x.raw, kind: 'ok', name: true })
    else if (!hinted) { hintParts.push({ word: x.raw, kind: 'hint' }); hinted = true }
    else hintParts.push({ word: '*'.repeat(x.raw.length), kind: 'mask' })
  })

  return { allOk, ops, hintParts: allOk ? [] : hintParts, notes, extras }
}

// Kısaltma notunun yazısı (yetişkin ve çocuk ekranlarında aynı)
export function dictNoteText(nt: DictNote): string {
  return nt.contracted ? `Kayıtta kısaltma var: ${nt.recorded}` : `Kayıtta açık hâli var: ${nt.recorded}`
}
