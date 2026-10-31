import { useEffect, useRef, useState } from 'react'
import type { AutoStatus, BoardToken, Pen } from './liveShared'
import { sb, newId, autoCheck, splitAccepted, retokenize, tokensToText, cleanBoard, shortName, secondsLabel } from './liveShared'
import { BoardSentence, Legend, PenBar, PaintableTokens, nice } from './LiveBoard'

// ─── Öğretmen: canlı ders paneli ──────────────────────────────────────────────
// Gerçek derste her şey veritabanına yazılır, öğrencilerden gelen cevaplar
// anında düşer. Deneme modunda aynı ekran 20 sahte öğrenciyle çalışır ve
// veritabanına hiçbir şey yazılmaz.

type Status = 'dogru' | 'yakin' | 'yanlis' | 'notr' | 'bekliyor' | 'cevapsiz' | 'yok'
const LABEL: Record<Status, string> = {
  dogru: 'Doğru', yakin: 'Yakın', yanlis: 'Yanlış', notr: 'İşaretlenecek',
  bekliyor: 'Cevap yok', cevapsiz: 'Cevapsız', yok: 'Derse katılmadı',
}

export interface PanelStudent { id: string; name: string }
export interface PanelClass { id: string; name: string; meet_url: string }
export interface PlanItem { id: string; seq: number; board: BoardToken[]; task: string; expected: string; topic: string; teacher_note: string }
export interface Preset { id: string; category: string; text: string; sort: number }

interface Q {
  id: string; seq: number; kind: 'question' | 'board'; board: BoardToken[]; task: string; topic: string
  plan_item_id: string | null; answers_open: boolean; published_ms: number
  expected: string; teacher_note: string
}
interface Ans { id: string; question_id: string; student_id: string; text: string; attempt_no: number; response_ms: number | null; auto: AutoStatus }
interface Verdict { teacher_status: 'dogru' | 'yakin' | 'yanlis' | null; one_on_one: boolean; unanswered: boolean }
interface Fb { id: string; question_id: string; student_id: string; kind: 'note' | 'confirm'; text: string }

interface Store {
  sessionId: string
  students: PanelStudent[]
  attended: Set<string>
  online: Set<string>
  questions: Q[]
  currentId: string | null
  answers: Map<string, Ans[]> // anahtar: soru|öğrenci
  answerIds: Set<string>
  verdicts: Map<string, Verdict>
  feedback: Fb[]
  feedbackIds: Set<string>
  log: { answers: number; notes: number; decisions: number }
}

const k2 = (q: string, s: string) => q + '|' + s

function iyelik(n: number): string {
  if (n === 0) return '’ı'
  const u = n % 10
  if (u) return '’' + ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'][u]
  const t = Math.floor(n / 10) % 10
  return '’' + ['ü', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'][t]
}

// ─── Deneme modu: sahte öğrenciler ───
const DEMO_NAMES: [string, string][] = [['Ada', 'K'], ['Ali', 'T'], ['Bora', 'S'], ['Can', 'D'], ['Defne', 'A'], ['Deniz', 'Y'], ['Ece', 'B'], ['Efe', 'G'], ['Elif', 'K'], ['Elif', 'S'], ['Emir', 'O'], ['Eylül', 'C'], ['Kerem', 'A'], ['Mert', 'U'], ['Nil', 'E'], ['Sarp', 'I'], ['Selin', 'M'], ['Yağmur', 'P'], ['Zeynep', 'R'], ['Ege', 'N']]
const DEMO_OPEN = { good: ['I like it.', 'Yes, I do.', 'I play with my cat after school.'], other: ['I likes it.', 'Yes, I am.', 'I playing games.'] }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function demoPool(expected: string) {
  const exp = (splitAccepted(expected)[0] || '').trim()
  if (!exp) return DEMO_OPEN
  const words = exp.split(' ')
  let li = 0
  words.forEach((w, i) => { if (w.replace(/[^\w]/g, '').length > words[li].replace(/[^\w]/g, '').length) li = i })
  const lw = words[li]
  const cut = Math.max(1, Math.floor(lw.length / 2))
  const typo = words.slice(); typo[li] = lw.slice(0, cut) + lw.slice(cut + 1)
  const drop = words.length > 2 ? words.filter((_, i) => i !== 1) : words.slice(0, 1)
  const addS = words.slice()
  const ai = Math.max(0, words.length - 1)
  const m = addS[ai].match(/^(.*?)([.,!?]*)$/)!
  addS[ai] = (m[1].endsWith('s') ? m[1].slice(0, -1) : m[1] + 's') + m[2]
  return { good: [exp, exp.toLowerCase().replace(/[.?!]+$/, '')], other: [typo.join(' '), drop.join(' '), addS.join(' ')] }
}

export default function LiveTeacherPanel({ demo, sessionId, klass, students, planItems, presets, onExit }: {
  demo: boolean
  sessionId: string
  klass: PanelClass
  students: PanelStudent[]
  planItems: PlanItem[]
  presets: Preset[]
  onExit: () => void
}) {
  const store = useRef<Store>({
    sessionId, students, attended: new Set(), online: new Set(), questions: [], currentId: null,
    answers: new Map(), answerIds: new Set(), verdicts: new Map(), feedback: [], feedbackIds: new Set(),
    log: { answers: 0, notes: 0, decisions: 0 },
  })
  const [, setTick] = useState(0)
  const render = () => setTick(t => t + 1)
  const [loading, setLoading] = useState(!demo)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  function say(msg: string) {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }
  function fail(e: unknown) {
    console.error('[canli-ders]', e)
    say('Kaydedilemedi. İnternet bağlantını kontrol et.')
  }

  const [tab, setTab] = useState<'ders' | 'tahta'>('tahta')
  const [filter, setFilter] = useState<string | null>(null)
  const [onlyAttn, setOnlyAttn] = useState(false)
  const [drawer, setDrawer] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDraft, setBulkDraft] = useState('')
  const [endModal, setEndModal] = useState(false)

  // Tahta düzenleyicisi
  const [edText, setEdText] = useState('')
  const [edTokens, setEdTokens] = useState<BoardToken[]>([])
  const [pen, setPen] = useState<Pen>('ozne')
  const [edTask, setEdTask] = useState('')
  const [edExpected, setEdExpected] = useState('')
  const [edTopic, setEdTopic] = useState('')
  const [edNote, setEdNote] = useState('')
  const [edPlanItem, setEdPlanItem] = useState<string | null>(null)
  const [linkedQ, setLinkedQ] = useState<string | null>(null) // yayındaki cümle: boyama anında gider
  const boardTimer = useRef<number | undefined>(undefined)

  const timers = useRef<number[]>([])
  function later(ms: number, fn: () => void) { timers.current.push(window.setTimeout(fn, ms)) }
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); window.clearTimeout(boardTimer.current) }, [])

  // ─── Durum hesapları ───
  const S = store.current
  function cur(): Q | null { return S.questions.find(q => q.id === S.currentId) || null }
  function attemptsOf(qid: string, sid: string): Ans[] { return S.answers.get(k2(qid, sid)) || [] }
  function verdictOf(qid: string, sid: string): Verdict { return S.verdicts.get(k2(qid, sid)) || { teacher_status: null, one_on_one: false, unanswered: false } }
  function approved(qid: string, sid: string): boolean { return S.feedback.some(f => f.kind === 'confirm' && f.question_id === qid && f.student_id === sid) }
  function notesOf(qid: string, sid: string): Fb[] { return S.feedback.filter(f => f.kind === 'note' && f.question_id === qid && f.student_id === sid) }
  function statusOf(q: Q, sid: string): Status {
    if (!S.attended.has(sid)) return 'yok'
    const a = attemptsOf(q.id, sid)
    if (!a.length) return q.answers_open ? 'bekliyor' : 'cevapsiz'
    return verdictOf(q.id, sid).teacher_status || a[a.length - 1].auto
  }
  function hasExpected(q: Q) { return q.kind === 'question' && splitAccepted(q.expected).length > 0 }

  // ─── Gelen cevap ───
  function ingestAnswer(row: any, fromLoad = false) {
    if (!row || S.answerIds.has(row.id)) return
    const q = S.questions.find(x => x.id === row.question_id)
    const auto: AutoStatus = q && hasExpected(q) ? autoCheck(q.expected, row.text) : 'notr'
    const key = k2(row.question_id, row.student_id)
    const list = (S.answers.get(key) || []).concat({
      id: row.id, question_id: row.question_id, student_id: row.student_id, text: row.text,
      attempt_no: row.attempt_no || 1, response_ms: row.response_ms ?? null, auto,
    }).sort((a, b) => a.attempt_no - b.attempt_no)
    S.answers.set(key, list)
    S.answerIds.add(row.id)
    S.attended.add(row.student_id)
    if (fromLoad) return
    S.log.answers++
    // Yeni deneme gelince senin önceki kararın sıfırlanır; iki üst üste yanlışta birebir destek.
    const v = verdictOf(row.question_id, row.student_id)
    const prev = list.length >= 2 ? list[list.length - 2].auto : null
    const nv: Verdict = { teacher_status: null, unanswered: false, one_on_one: v.one_on_one || (auto === 'yanlis' && prev === 'yanlis') }
    S.verdicts.set(key, nv)
    if (!demo) {
      sb.from('live_verdicts').upsert({
        question_id: row.question_id, student_id: row.student_id, session_id: S.sessionId,
        auto_status: auto, teacher_status: null, unanswered: false, one_on_one: nv.one_on_one, updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) fail(error) })
    }
  }

  // ─── Veriyi yükle (gerçek ders) ───
  async function loadAll() {
    const sid = S.sessionId
    const [sess, qs, ans, ver, fb, att] = await Promise.all([
      sb.from('live_sessions').select('current_question_id,status').eq('id', sid).single(),
      sb.from('live_questions').select('id,seq,kind,board,task,topic,plan_item_id,answers_open,published_at,live_question_keys(expected,teacher_note)').eq('session_id', sid).order('seq'),
      sb.from('live_answers').select('id,question_id,student_id,text,attempt_no,response_ms').eq('session_id', sid).order('submitted_at').limit(10000),
      sb.from('live_verdicts').select('question_id,student_id,teacher_status,one_on_one,unanswered').eq('session_id', sid).limit(10000),
      sb.from('live_feedback').select('id,question_id,student_id,kind,text').eq('session_id', sid).order('created_at').limit(10000),
      sb.from('live_attendance').select('student_id').eq('session_id', sid),
    ])
    const err = sess.error || qs.error || ans.error || ver.error || fb.error || att.error
    if (err) throw err
    S.currentId = sess.data?.current_question_id || null
    S.questions = (qs.data || []).map((r: any) => {
      const key = Array.isArray(r.live_question_keys) ? r.live_question_keys[0] : r.live_question_keys
      return {
        id: r.id, seq: r.seq, kind: r.kind, board: cleanBoard(r.board), task: r.task || '', topic: r.topic || '',
        plan_item_id: r.plan_item_id, answers_open: r.answers_open, published_ms: Date.parse(r.published_at) || Date.now(),
        expected: key?.expected || '', teacher_note: key?.teacher_note || '',
      }
    })
    S.answers = new Map(); S.answerIds = new Set()
    S.attended = new Set((att.data || []).map((r: any) => r.student_id))
    for (const r of ans.data || []) ingestAnswer(r, true)
    S.verdicts = new Map()
    for (const r of ver.data || []) S.verdicts.set(k2(r.question_id, r.student_id), { teacher_status: r.teacher_status, one_on_one: !!r.one_on_one, unanswered: !!r.unanswered })
    S.feedback = (fb.data || []) as Fb[]
    S.feedbackIds = new Set(S.feedback.map(f => f.id))
    render()
  }

  useEffect(() => {
    if (demo) {
      // Deneme: biri derse hiç katılmaz, ikisinin bağlantısı arada kopar.
      S.students.forEach((s, i) => { if (i !== 6) { S.attended.add(s.id); S.online.add(s.id) } })
      later(10000, () => { S.online.delete(S.students[12]?.id); render() })
      later(28000, () => { if (S.students[12]) S.online.add(S.students[12].id); render() })
      later(18000, () => { S.online.delete(S.students[15]?.id); render() })
      render()
      return
    }
    let alive = true
    let firstSub = true
    loadAll().then(() => { if (alive) { setLoading(false); if (S.currentId) setTab('ders') } }).catch(e => { fail(e); if (alive) setLoading(false) })
    const ch = sb.channel('live-t-' + sessionId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_answers', filter: `session_id=eq.${sessionId}` }, p => { ingestAnswer(p.new); render() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_attendance', filter: `session_id=eq.${sessionId}` }, p => {
        const r: any = p.new
        if (r && r.student_id) { S.attended.add(r.student_id); render() }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (firstSub) { firstSub = false; return }
          loadAll().catch(fail) // bağlantı geri gelince aradakileri tamamla
        }
      })
    const pres = sb.channel('live-' + sessionId)
      .on('presence', { event: 'sync' }, () => {
        S.online = new Set(Object.keys(pres.presenceState()))
        for (const id of S.online) S.attended.add(id)
        render()
      })
      .subscribe()
    return () => { alive = false; sb.removeChannel(ch); sb.removeChannel(pres) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Deneme cevapları ───
  function scheduleFake(qid: string, sid: string, attempt: number, delay: number) {
    later(delay, () => {
      const q = S.questions.find(x => x.id === qid)
      if (!q || S.currentId !== qid || !q.answers_open) return
      if (!S.online.has(sid)) { scheduleFake(qid, sid, attempt, 4000); return }
      const pool = demoPool(q.expected)
      const text = pick(Math.random() < (attempt === 0 ? 0.6 : 0.65) ? pool.good : pool.other)
      const n = attemptsOf(qid, sid).length + 1
      ingestAnswer({ id: newId(), question_id: qid, student_id: sid, text, attempt_no: n, response_ms: Date.now() - q.published_ms })
      render()
    })
  }

  // ─── Soruyu kapat / yayınla / dersi bitir ───
  async function closeQuestion(q: Q) {
    if (!q.answers_open) return
    q.answers_open = false
    const rows: any[] = []
    if (q.kind === 'question') {
      for (const s of S.students) {
        if (!S.attended.has(s.id) || attemptsOf(q.id, s.id).length) continue
        S.verdicts.set(k2(q.id, s.id), { ...verdictOf(q.id, s.id), unanswered: true })
        rows.push({ question_id: q.id, student_id: s.id, session_id: S.sessionId, unanswered: true, updated_at: new Date().toISOString() })
      }
    }
    render()
    if (demo) return
    const r1 = await sb.from('live_questions').update({ answers_open: false, closed_at: new Date().toISOString() }).eq('id', q.id)
    if (r1.error) fail(r1.error)
    if (rows.length) {
      const r2 = await sb.from('live_verdicts').upsert(rows)
      if (r2.error) fail(r2.error)
    }
  }

  async function publish(p: { kind: 'question' | 'board'; board: BoardToken[]; task: string; expected: string; topic: string; teacher_note: string; plan_item_id: string | null }): Promise<string | null> {
    if (!p.board.length) return null
    const c = cur()
    if (c) await closeQuestion(c)
    const q: Q = {
      id: newId(), seq: (S.questions.reduce((m, x) => Math.max(m, x.seq), 0) || 0) + 1,
      kind: p.kind, board: p.board, task: p.task.trim(), topic: p.topic.trim(), plan_item_id: p.plan_item_id,
      answers_open: p.kind === 'question', published_ms: Date.now(),
      expected: p.kind === 'question' ? p.expected.trim() : '', teacher_note: p.teacher_note.trim(),
    }
    S.questions.push(q)
    S.currentId = q.id
    setFilter(null); setBulkOpen(false); setDrawer(null)
    render()
    if (demo) {
      if (q.kind === 'question') {
        for (const s of S.students) {
          if (!S.attended.has(s.id)) continue
          if (Math.random() < 0.85) scheduleFake(q.id, s.id, 0, 2500 + Math.random() * 15000)
        }
      }
      return q.id
    }
    const ins = await sb.from('live_questions').insert({
      id: q.id, session_id: S.sessionId, seq: q.seq, kind: q.kind, board: q.board, task: q.task, topic: q.topic,
      plan_item_id: q.plan_item_id, answers_open: q.answers_open,
    })
    if (ins.error) { fail(ins.error); return q.id }
    if (q.kind === 'question' || q.teacher_note) {
      const k = await sb.from('live_question_keys').insert({ question_id: q.id, expected: q.expected, teacher_note: q.teacher_note })
      if (k.error) fail(k.error)
    }
    const up = await sb.from('live_sessions').update({ current_question_id: q.id }).eq('id', S.sessionId)
    if (up.error) fail(up.error)
    return q.id
  }

  async function endLesson() {
    const c = cur()
    if (c) await closeQuestion(c)
    setDrawer(null)
    setEndModal(true)
    if (demo) return
    const r = await sb.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', S.sessionId)
    if (r.error) fail(r.error)
  }

  // ─── Notlar ve kararlar ───
  async function sendFeedback(sids: string[], kind: 'note' | 'confirm', text: string, presetId: string | null = null) {
    const q = cur()
    if (!q || !sids.length) return
    const rows = sids.map(sid => ({ id: newId(), question_id: q.id, session_id: S.sessionId, student_id: sid, kind, text, preset_id: presetId }))
    for (const r of rows) {
      S.feedback.push({ id: r.id, question_id: r.question_id, student_id: r.student_id, kind, text })
      S.feedbackIds.add(r.id)
      if (kind === 'note') S.log.notes++; else S.log.decisions++
    }
    render()
    if (demo) {
      if (kind === 'note' && q.answers_open) {
        for (const sid of sids) {
          const st = statusOf(q, sid)
          if (st === 'yanlis' || st === 'yakin' || st === 'notr') scheduleFake(q.id, sid, 1, 4000 + Math.random() * 6000)
        }
      }
      return
    }
    const r = await sb.from('live_feedback').insert(rows)
    if (r.error) fail(r.error)
  }
  function sendNote(sids: string[], text: string, presetId: string | null = null) {
    const t = text.trim()
    if (!t || !sids.length) return
    sendFeedback(sids, 'note', t, presetId)
    say(sids.length > 1 ? `Not ${sids.length} öğrenciye gönderildi.` : 'Not gönderildi.')
  }
  async function decide(sid: string, k: 'dogru' | 'yakin' | 'yanlis') {
    const q = cur()
    if (!q || !attemptsOf(q.id, sid).length) return
    const v = { ...verdictOf(q.id, sid), teacher_status: k }
    S.verdicts.set(k2(q.id, sid), v)
    S.log.decisions++
    render()
    if (demo) return
    const r = await sb.from('live_verdicts').upsert({
      question_id: q.id, student_id: sid, session_id: S.sessionId, teacher_status: k,
      auto_status: attemptsOf(q.id, sid).slice(-1)[0]?.auto ?? null, one_on_one: v.one_on_one, unanswered: false,
      updated_at: new Date().toISOString(),
    })
    if (r.error) fail(r.error)
  }

  // ─── Tahta: yayındaki cümlenin boyanması anında öğrencilere gider ───
  function setTokens(next: BoardToken[]) {
    setEdTokens(next)
    if (!linkedQ) return
    const q = S.questions.find(x => x.id === linkedQ)
    if (!q) return
    q.board = next
    render()
    if (demo) return
    window.clearTimeout(boardTimer.current)
    boardTimer.current = window.setTimeout(() => {
      sb.from('live_questions').update({ board: next }).eq('id', linkedQ).then(({ error }) => { if (error) fail(error) })
    }, 250)
  }
  function clearEditor() {
    setEdText(''); setEdTokens([]); setEdTask(''); setEdExpected(''); setEdTopic(''); setEdNote(''); setEdPlanItem(null); setLinkedQ(null)
  }
  function loadPlanItem(it: PlanItem) {
    setEdText(tokensToText(it.board)); setEdTokens(it.board.map(t => ({ ...t })))
    setEdTask(it.task); setEdExpected(it.expected); setEdTopic(it.topic); setEdNote(it.teacher_note)
    setEdPlanItem(it.id); setLinkedQ(null)
  }
  async function publishFromEditor(kind: 'question' | 'board') {
    const id = await publish({ kind, board: edTokens, task: edTask, expected: edExpected, topic: edTopic, teacher_note: edNote, plan_item_id: edPlanItem })
    if (!id) return
    setLinkedQ(id)
    say(kind === 'question' ? 'Yayınlandı. Soru öğrencilerin ekranında.' : 'Tahtaya yazıldı.')
    if (kind === 'question') setTab('ders')
  }
  function usedPlanItems(): Set<string> { return new Set(S.questions.map(q => q.plan_item_id).filter(Boolean) as string[]) }
  function nextPlanItem(): PlanItem | null {
    const used = usedPlanItems()
    const lastUsedSeq = Math.max(-1, ...planItems.filter(p => used.has(p.id)).map(p => p.seq))
    return planItems.find(p => p.seq > lastUsedSeq && !used.has(p.id)) || planItems.find(p => !used.has(p.id)) || null
  }
  async function publishNextPlan() {
    const it = nextPlanItem()
    if (!it) return
    const id = await publish({ kind: 'question', board: it.board.map(t => ({ ...t })), task: it.task, expected: it.expected, topic: it.topic, teacher_note: it.teacher_note, plan_item_id: it.id })
    if (!id) return
    loadPlanItem(it)
    setLinkedQ(id)
    say(`Soru ${S.questions.length} yayınlandı.`)
  }

  // ─── Görünüm ───
  if (loading) return <div className="panel"><p className="muted">Ders yükleniyor…</p></div>

  const q = cur()
  const absent = S.students.filter(s => !S.attended.has(s.id)).map(s => s.name)
  const attendedCount = S.students.filter(s => S.attended.has(s.id)).length

  const top = (
    <div className="top">
      <span className="brand"><b>neuro</b><i>cosmos</i></span>
      <span className="live">Canlı ders: {klass.name}</span>
      {demo && <span className="demo-tag">Deneme modu: 20 sahte öğrenci</span>}
      <span className="grow" />
      <button className="btn sm" onClick={() => { if (klass.meet_url) window.open(klass.meet_url, '_blank', 'noopener'); else say('Sınıf ayarlarına Meet bağlantısı ekle.') }}>Meet’i aç</button>
      <button className="btn sm" onClick={endLesson}>Dersi bitir</button>
      <span className="att">Yoklama: {attendedCount} / {S.students.length} derste.{absent.length ? ` Katılmayan: ${absent.join(', ')}.` : ''}</span>
    </div>
  )

  const tabs = (
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'ders'} onClick={() => { setTab('ders'); setDrawer(null) }}>Ders</button>
      <button role="tab" aria-selected={tab === 'tahta'} onClick={() => { setTab('tahta'); setDrawer(null) }}>Tahta</button>
    </div>
  )

  // ── Ders sekmesi ──
  function dersTab() {
    if (!q) return <div className="wait"><h2>Henüz soru yok</h2><p className="muted">Tahta sekmesinden bir cümle yaz ya da hazırlanan sorulardan birini yayınla.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => setTab('tahta')}>Tahtaya git</button>
        {nextPlanItem() && <button className="btn" onClick={publishNextPlan}>İlk hazır soruyu yayınla</button>}
      </div></div>
    const n = nextPlanItem()
    const strip = (
      <div className="qstrip">
        <span className="q" style={{ fontWeight: 700 }}>{q.kind === 'board' ? 'Tahta' : 'Soru'} {S.questions.length}</span>
        {q.topic && <span className="muted small">Konu: {q.topic}</span>}
        <span className="grow" />
        {q.kind === 'question' && (q.answers_open
          ? <button className="btn sm" onClick={() => { closeQuestion(q); say('Cevaplar kapandı. Cevap vermeyenler bu soruda “cevapsız” kaydedildi.') }}>Cevapları kapat</button>
          : <span className="closedtag">Cevaplar kapalı</span>)}
        {planItems.length > 0 && <button className="btn sm primary" disabled={!n} onClick={publishNextPlan}>Sonraki soru</button>}
      </div>
    )
    const exp = q.kind === 'board' ? <p className="expected">Sadece tahtaya yazıldı; cevap kutusu çıkmadı.</p>
      : hasExpected(q) ? <p className="expected">Beklenen cevap (sadece sen görürsün): <b>{nice(splitAccepted(q.expected).join(' / '))}</b></p>
        : <p className="expected">Açık uçlu soru: kartlar “işaretlenecek” bekler, kararı sen verirsin.</p>
    const board = (
      <div className="board">
        <BoardSentence tokens={q.board} />
        {q.task && <p className="task">{q.task}</p>}
        {exp}
        {q.teacher_note && <p className="expected" style={{ borderTop: 0, paddingTop: 0, marginTop: 4 }}>Not: {q.teacher_note}</p>}
        <Legend />
      </div>
    )
    if (q.kind === 'board') return <>{strip}{board}</>
    return <>{strip}{board}{summary(q)}{bulkOpen && bulkBox(q)}{grid(q)}</>
  }

  function counts(q: Q) {
    const c = { dogru: 0, yakin: 0, yanlis: 0, notr: 0, bos: 0, destek: 0, answered: 0, toApprove: 0 }
    for (const s of S.students) {
      if (!S.attended.has(s.id)) continue
      const st = statusOf(q, s.id)
      if (st === 'bekliyor' || st === 'cevapsiz') c.bos++
      else if (st !== 'yok') { c[st]++; c.answered++ }
      if (verdictOf(q.id, s.id).one_on_one) c.destek++
      if (st === 'dogru' && !approved(q.id, s.id)) c.toApprove++
    }
    return c
  }
  function fchip(k: string, num: number, label: string) {
    return <button key={k} className={'fchip k-' + k} aria-pressed={filter === k} onClick={() => setFilter(f => f === k ? null : k)}><b>{num}</b> {label}</button>
  }
  function summary(q: Q) {
    const c = counts(q)
    const chips: React.ReactNode[] = []
    if (hasExpected(q)) chips.push(fchip('dogru', c.dogru, 'doğru'), fchip('yakin', c.yakin, 'yakın'), fchip('yanlis', c.yanlis, 'yanlış'))
    if (c.notr || !hasExpected(q)) chips.push(fchip('notr', c.notr, 'işaretlenecek'))
    if (!hasExpected(q) && (c.dogru || c.yakin || c.yanlis)) chips.push(fchip('dogru', c.dogru, 'doğru'), fchip('yanlis', c.yanlis, 'yanlış'))
    chips.push(fchip('bos', c.bos, q.answers_open ? 'cevap yok' : 'cevapsız'))
    if (c.destek) chips.push(fchip('destek', c.destek, 'birebir destek'))
    return (
      <>
        <div className="summary"><span className="lead">{attendedCount} kişiden {c.answered}{iyelik(c.answered)} cevapladı:</span>{chips}</div>
        <div className="tools">
          <label className="chk"><input type="checkbox" checked={onlyAttn} onChange={() => setOnlyAttn(v => !v)} /> Sadece ilgilenmem gerekenleri göster</label>
          <span className="grow" />
          <button className="btn sm" disabled={!c.toApprove} onClick={() => {
            const ids = S.students.filter(s => S.attended.has(s.id) && statusOf(q, s.id) === 'dogru' && !approved(q.id, s.id)).map(s => s.id)
            sendFeedback(ids, 'confirm', '')
            say(`${ids.length} öğrenciye doğru işareti gönderildi.`)
          }}>Doğruları onayla ({c.toApprove})</button>
          <button className="btn sm" disabled={!c.yanlis} onClick={() => setBulkOpen(true)}>Yanlışlara aynı notu gönder ({c.yanlis})</button>
        </div>
      </>
    )
  }
  function presetChips(onPick: (p: Preset) => void) {
    const groups: { cat: string; items: Preset[] }[] = []
    for (const p of presets) {
      let g = groups.find(x => x.cat === p.category)
      if (!g) { g = { cat: p.category, items: [] }; groups.push(g) }
      g.items.push(p)
    }
    if (!groups.length) return <p className="muted small">Hazır not yok. Canlı Ders ana ekranındaki “Hazır notlar”dan ekleyebilirsin.</p>
    return groups.map(g => (
      <div key={g.cat} className="notegroup">
        <p className="gl">{g.cat}</p>
        <div className="notechips">{g.items.map(p => <button key={p.id} className="notechip" onClick={() => onPick(p)}>{p.text}</button>)}</div>
      </div>
    ))
  }
  function bulkBox(q: Q) {
    const ids = S.students.filter(s => S.attended.has(s.id) && statusOf(q, s.id) === 'yanlis').map(s => s.id)
    const send = (t: string, pid: string | null) => { sendNote(ids, t, pid); setBulkOpen(false); setBulkDraft('') }
    return (
      <div className="bulk">
        <h3>Yanlış cevap veren {ids.length} öğrenciye aynı not</h3>
        {presetChips(p => send(p.text, p.id))}
        <div className="row">
          <input type="text" value={bulkDraft} onChange={e => setBulkDraft(e.target.value)} placeholder="Ya da kendi notunu yaz" maxLength={300} />
          <button className="btn primary" onClick={() => send(bulkDraft, null)}>Gönder</button>
          <button className="btn" onClick={() => { setBulkOpen(false); setBulkDraft('') }}>Vazgeç</button>
        </div>
        <p className="hint">Notta doğru cevabı verme; neye bakacağını söyle.</p>
      </div>
    )
  }
  const PRI: Record<Status, number> = { yanlis: 1, yakin: 2, notr: 3, bekliyor: 4, cevapsiz: 4, dogru: 5, yok: 8 }
  function prio(q: Q, sid: string) {
    const st = statusOf(q, sid)
    if (verdictOf(q.id, sid).one_on_one && st !== 'dogru' && st !== 'yok') return 0
    if (st === 'dogru' && approved(q.id, sid)) return 6
    return PRI[st]
  }
  function grid(q: Q) {
    const list = S.students.slice()
      .sort((x, y) => prio(q, x.id) - prio(q, y.id) || x.name.localeCompare(y.name, 'tr'))
      .filter(s => {
        const st = statusOf(q, s.id)
        if (onlyAttn && prio(q, s.id) >= 5) return false
        if (!filter) return true
        if (filter === 'destek') return verdictOf(q.id, s.id).one_on_one
        if (filter === 'bos') return st === 'bekliyor' || st === 'cevapsiz'
        return st === filter
      })
    return (
      <div className="grid">
        {list.length === 0 && <div className="empty">Bu görünümde kart yok. <button className="btn sm" onClick={() => { setFilter(null); setOnlyAttn(false) }}>Hepsini göster</button></div>}
        {list.map(s => card(q, s))}
      </div>
    )
  }
  function conn(sid: string) {
    if (!S.attended.has(sid)) return null
    return S.online.has(sid)
      ? <span className="conn" title="Bağlı" aria-label="Bağlı"><i /></span>
      : <span className="conn off"><i />Bağlantı koptu</span>
  }
  function card(q: Q, s: PanelStudent) {
    const st = statusOf(q, s.id)
    if (st === 'yok') return <div key={s.id} className="card st-yok"><div className="c-top"><span className="c-name">{s.name}</span></div><div className="c-tags"><span className="chip">Derse katılmadı</span></div></div>
    const a = attemptsOf(q.id, s.id)
    const last = a[a.length - 1]
    const v = verdictOf(q.id, s.id)
    const notes = notesOf(q.id, s.id).length
    return (
      <button key={s.id} className={'card st-' + st} onClick={() => { setDrawer(s.id); setNoteDraft('') }}>
        <div className="c-top"><span className="c-name">{s.name}</span>{conn(s.id)}</div>
        <div className="c-tags">
          <span className="chip">{v.teacher_status && last ? LABEL[st] + ' (senin kararın)' : LABEL[st]}</span>
          {v.one_on_one && <span className="tag destek">Birebir destek</span>}
          {approved(q.id, s.id) && <span className="tag onay">✓ Onaylandı</span>}
        </div>
        {last && <span className="c-ans">{last.text}</span>}
        <div className="c-meta">
          {last && <><span>{a.length}. deneme</span><span>{secondsLabel(last.response_ms)}</span></>}
          {notes > 0 && <span>{notes} not</span>}
        </div>
      </button>
    )
  }
  function drawerView() {
    if (!drawer || !q || tab !== 'ders') return null
    const s = S.students.find(x => x.id === drawer)
    if (!s) return null
    const st = statusOf(q, s.id)
    const a = attemptsOf(q.id, s.id)
    const has = a.length > 0
    const v = verdictOf(q.id, s.id)
    const ok = approved(q.id, s.id)
    const notes = notesOf(q.id, s.id)
    return (
      <>
        <div className="scrim" onClick={() => setDrawer(null)} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label={s.name}>
          <div className="d-head"><h2>{s.name}</h2>{conn(s.id)}<button className="btn sm" autoFocus onClick={() => setDrawer(null)}>Kapat</button></div>
          {v.one_on_one && <p className="small" style={{ margin: '8px 0 0' }}><span className="tag destek">Birebir destek</span> Bu soruda üst üste iki kez yanlış cevap verdi.</p>}
          <section><h3>Cevapları</h3>
            {has ? a.map(x => (
              <div key={x.id} className={'attempt st-' + x.auto}>
                <div>{x.text}</div>
                <div className="meta">{x.attempt_no}. deneme, {secondsLabel(x.response_ms)}, otomatik sonuç: {LABEL[x.auto]}</div>
              </div>
            )) : <p className="muted small">{S.online.has(s.id) ? 'Henüz cevap gelmedi.' : 'Bağlantısı koptu; geri gelince cevap yazabilir.'}</p>}
          </section>
          <section><h3>Karar</h3>
            <div className="seg" role="group" aria-label="Karar">
              {(['dogru', 'yakin', 'yanlis'] as const).map(k => (
                <button key={k} disabled={!has} aria-pressed={has && st === k} onClick={() => decide(s.id, k)}>{LABEL[k]}</button>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              {st === 'dogru'
                ? (ok ? <button className="btn" disabled>✓ Doğru işareti gönderildi</button>
                  : <button className="btn primary" onClick={() => { sendFeedback([s.id], 'confirm', ''); say('Doğru işareti gönderildi.') }}>Öğrenciye doğru işareti gönder</button>)
                : <p className="hint">Doğru işareti sadece “doğru” kararındaki cevaplara gönderilebilir.</p>}
            </div>
          </section>
          <section><h3>Not gönder</h3>
            {presetChips(p => sendNote([s.id], p.text, p.id))}
            <div className="row">
              <input type="text" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Kendi notunu yaz" maxLength={300}
                onKeyDown={e => { if (e.key === 'Enter' && noteDraft.trim()) { sendNote([s.id], noteDraft); setNoteDraft('') } }} />
              <button className="btn primary" onClick={() => { if (noteDraft.trim()) { sendNote([s.id], noteDraft); setNoteDraft('') } }}>Gönder</button>
            </div>
            <p className="hint">Notta doğru cevabı verme; neye bakacağını söyle. Öğrenci notu görünce cevabını düzeltip yeniden gönderebilir.</p>
          </section>
          <section><h3>Gönderilen notlar</h3>
            {notes.length ? notes.map(n => <div key={n.id} className="sent">{n.text}</div>) : <p className="muted small">Bu soruda henüz not yok.</p>}
          </section>
        </aside>
      </>
    )
  }

  // ── Tahta sekmesi ──
  function tahtaTab() {
    const live = linkedQ && linkedQ === S.currentId
    const used = usedPlanItems()
    const nxt = nextPlanItem()
    return (
      <>
        <div className="box">
          <label className="f" htmlFor="lv-text" style={{ marginTop: 0 }}>Cümle</label>
          <input id="lv-text" type="text" value={edText} disabled={!!linkedQ} placeholder="Örnek: My brother eats an apple every morning."
            onChange={e => { setEdText(e.target.value); setEdTokens(t => retokenize(e.target.value, t)) }} />
          {linkedQ && <p className="hint">{live ? 'Bu cümle yayında. Boyadıkların öğrencilerin ekranına anında gider.' : 'Bu cümle artık yayında değil.'} Yeni bir cümle için “Yeni cümle”ye bas.</p>}
          <p className="hint">Önce kalemi seç, sonra kelimelere dokun. Basılı tutup kelimelerin üzerinden geçerek birden fazlasını tek seferde boyayabilirsin. Boyalı kelimeye aynı kalemle dokunursan boya kalkar.</p>
          <PaintableTokens tokens={edTokens} pen={pen} onChange={setTokens} />
          <PenBar pen={pen} onPen={setPen} />
          {edTokens.length > 20 && <p className="hint">Cümle {edTokens.length} parça; çocukların ekranında uzun görünebilir.</p>}
          {!linkedQ && <>
            <label className="f" htmlFor="lv-task">Görev (isteğe bağlı)</label>
            <input id="lv-task" type="text" value={edTask} onChange={e => setEdTask(e.target.value)} placeholder="Örnek: Bu cümleyi olumsuz yap." />
            <label className="f" htmlFor="lv-exp">Beklenen cevap (isteğe bağlı)</label>
            <input id="lv-exp" type="text" value={edExpected} onChange={e => setEdExpected(e.target.value)} placeholder="Alternatifleri // ile ayır. Boş bırakırsan soru açık uçlu olur." />
            <label className="f" htmlFor="lv-topic">Konu (isteğe bağlı, raporlar için)</label>
            <input id="lv-topic" type="text" value={edTopic} onChange={e => setEdTopic(e.target.value)} placeholder="Örnek: present simple olumsuz" />
          </>}
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            {!linkedQ && <>
              <button className="btn primary" disabled={!edTokens.length} onClick={() => publishFromEditor('question')}>Soru olarak yayınla</button>
              <button className="btn" disabled={!edTokens.length} onClick={() => publishFromEditor('board')}>Sadece tahtaya yaz</button>
            </>}
            <span className="grow" />
            <button className="btn" onClick={clearEditor} disabled={!edText && !edTokens.length}>Yeni cümle</button>
          </div>
          {!linkedQ && <p className="hint">Yayınlanan soru hemen öğrencilerin ekranına gider ve dersin kaydına girer. Açık olan soru kapanır.</p>}
        </div>
        {planItems.length > 0 && (
          <div className="box">
            <div className="row" style={{ marginTop: 0, marginBottom: 8 }}>
              <h3 style={{ fontSize: 16 }}>Hazırlanan sorular</h3>
              <span className="grow" />
              <button className="btn sm primary" disabled={!nxt} onClick={publishNextPlan}>Sonraki soru</button>
            </div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Bir soruya dokunursan yayınlamadan önce tahtaya yüklenir; renklerini değiştirebilirsin.</p>
            <div className="list">
              {planItems.map((it, i) => (
                <button key={it.id} className={'item' + (nxt && nxt.id === it.id ? ' now' : used.has(it.id) ? ' done' : '')}
                  style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => loadPlanItem(it)}>
                  <span className="n">{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <BoardSentence tokens={it.board} />
                    {it.task && <span className="muted small" style={{ display: 'block' }}>{it.task}</span>}
                    {used.has(it.id) && <span className="muted small">Yayınlandı</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  function endView() {
    if (!endModal) return null
    return (
      <div className="modal" role="dialog" aria-modal="true">
        <div>
          <h2>{demo ? 'Deneme dersi bitti' : 'Ders kaydedildi'}</h2>
          <ul>
            <li>Yoklama: {attendedCount} / {S.students.length}</li>
            <li>Tahtaya yazılan / sorulan: {S.questions.length}</li>
            <li>Gelen cevap: {[...S.answers.values()].reduce((n, l) => n + l.length, 0)}</li>
            <li>Gönderilen not: {S.feedback.filter(f => f.kind === 'note').length}</li>
            <li>Doğru işareti: {S.feedback.filter(f => f.kind === 'confirm').length}</li>
          </ul>
          {demo ? <p className="muted small">Deneme modunda hiçbir şey kaydedilmedi.</p>
            : <p className="muted small">Hepsi ve her cevabın süresi kaydedildi. Rapor ekranı sonraki aşamada gelecek.</p>}
          <div className="row"><button className="btn primary" onClick={onExit}>Canlı Ders ana ekranına dön</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {top}
      {tabs}
      {tab === 'ders' ? dersTab() : tahtaTab()}
      {drawerView()}
      {endView()}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

// Ders için öğrenci listesi (sınıf üyeleri, "Ali A." biçiminde).
export async function loadRoster(classId: string): Promise<PanelStudent[]> {
  const { data, error } = await sb.from('live_class_members').select('student_id, profiles(display_name, surname_initial, active)').eq('class_id', classId)
  if (error) throw error
  return (data || [])
    .map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return p && p.active !== false ? { id: r.student_id as string, name: shortName(p.display_name, p.surname_initial) } : null
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, 'tr')) as PanelStudent[]
}

export function demoStudents(): PanelStudent[] {
  return DEMO_NAMES.map(([f, l], i) => ({ id: 'demo-' + i, name: shortName(f, l) }))
}
