import { useEffect, useRef, useState } from 'react'
import type { Account } from './auth'
import type { BoardToken } from './liveShared'
import { sb, cleanBoard } from './liveShared'
import { LiveStyles, BoardSentence, Legend } from './LiveBoard'

// ─── Öğrenci: Canlı Ders ──────────────────────────────────────────────────────
// Çocuk yalnızca kendi sınıfının dersini, kendi cevaplarını ve kendine gelen
// notları görebilir (bu kural veritabanında). Beklenen cevap ve otomatik
// sonuç buraya hiç gelmez; kırmızı ya da "yanlış" hiçbir yerde görünmez.

export interface LiveClassInfo { id: string; name: string; meet_url: string }
export interface LiveStatus { klass: LiveClassInfo | null; sessionId: string | null; checked: boolean }

// Öğrencinin sınıfı ve o sınıfın açık dersi; ders başlayınca anında haber alır.
export function useLiveStatus(account: Account | null): LiveStatus {
  const [st, setSt] = useState<LiveStatus>({ klass: null, sessionId: null, checked: false })
  const isStudent = !!account && account.active && account.role === 'student'
  const uid = account?.id || ''

  useEffect(() => {
    if (!isStudent) { setSt({ klass: null, sessionId: null, checked: true }); return }
    let alive = true
    let ch: ReturnType<typeof sb.channel> | null = null

    async function refresh(): Promise<string | null> {
      const m = await sb.from('live_class_members').select('class_id, live_classes(id,name,meet_url)').eq('student_id', uid).maybeSingle()
      if (!alive) return null
      if (m.error) { setSt(s => ({ ...s, checked: true })); return null }
      const c: any = m.data ? (Array.isArray((m.data as any).live_classes) ? (m.data as any).live_classes[0] : (m.data as any).live_classes) : null
      if (!c) { setSt({ klass: null, sessionId: null, checked: true }); return null }
      const s = await sb.from('live_sessions').select('id').eq('class_id', c.id).eq('status', 'active').maybeSingle()
      if (!alive) return null
      setSt({ klass: { id: c.id, name: c.name, meet_url: c.meet_url || '' }, sessionId: s.data?.id || null, checked: true })
      return c.id
    }

    refresh().then(classId => {
      if (!alive || !classId) return
      ch = sb.channel('live-cls-' + classId + '-' + uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions', filter: `class_id=eq.${classId}` }, () => { refresh() })
        .subscribe()
    })
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      if (ch) sb.removeChannel(ch)
    }
  }, [isStudent, uid])

  return st
}

// Ders başlayınca her ekranın altında beliren şerit.
export function LiveBanner({ onJoin }: { onJoin: () => void }) {
  return (
    <div style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      display: 'flex', alignItems: 'center', gap: '12px', background: '#1B1F4B', color: '#fff',
      borderRadius: '999px', padding: '8px 8px 8px 16px', boxShadow: '0 8px 24px rgba(15,23,42,0.3)',
      fontFamily: "Quicksand, 'Outfit', system-ui, sans-serif", fontWeight: 700, fontSize: '15px', maxWidth: 'calc(100vw - 24px)',
    }}>
      <style>{'@keyframes lvpulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: '#4EEAC1', animation: 'lvpulse 1.4s infinite' }} />
      <span>Canlı ders başladı</span>
      <button onClick={onJoin} style={{
        background: '#6A3BD1', color: '#fff', border: 0, borderRadius: '999px', padding: '8px 16px',
        font: 'inherit', cursor: 'pointer',
      }}>Katıl</button>
    </div>
  )
}

// Yalnızca canlı derse katılan, başka alanı açık olmayan öğrencinin ekranı.
export function LiveOnlyHome({ account, status, onJoin, onLogout }: { account: Account; status: LiveStatus; onJoin: () => void; onLogout: () => void }) {
  const first = account.displayName.split(' ')[0]
  return (
    <div className="lv"><LiveStyles />
      <div className="stu">
        <div className="wait">
          <h1 style={{ fontSize: 26, marginBottom: 8 }}>Merhaba {first}!</h1>
          {!status.checked ? <p className="muted">Yükleniyor…</p>
            : !status.klass ? <p className="muted">Henüz bir sınıfa eklenmedin. Öğretmeninle konuş.</p>
              : status.sessionId ? <>
                <p className="muted">Canlı ders başladı.</p>
                <button className="btn primary big" onClick={onJoin}>Canlı derse katıl</button>
              </> : <p className="muted">Canlı ders şu an kapalı. Öğretmenin dersi başlatınca burada bir düğme belirecek.</p>}
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <button className="btn" onClick={onLogout}>Çıkış yap</button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SQ { id: string; kind: 'question' | 'board'; board: BoardToken[]; task: string; answers_open: boolean }
interface MyAns { id: string; text: string; attempt_no: number }
interface MyFb { id: string; kind: 'note' | 'confirm'; text: string; created_at: string }

const draftKey = (qid: string) => 'nc_live_draft_' + qid
function readDraft(qid: string): string { try { return localStorage.getItem(draftKey(qid)) || '' } catch { return '' } }
function writeDraft(qid: string, v: string) { try { if (v) localStorage.setItem(draftKey(qid), v); else localStorage.removeItem(draftKey(qid)) } catch {} }

export function LiveStudentScreen({ account, klass, sessionId, onExit }: { account: Account; klass: LiveClassInfo; sessionId: string; onExit: () => void }) {
  const me = account.id
  const [ended, setEnded] = useState(false)
  const [q, setQ] = useState<SQ | null>(null)
  const [answers, setAnswers] = useState<MyAns[]>([])
  const [fb, setFb] = useState<MyFb[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [netErr, setNetErr] = useState<string | null>(null)
  const qRef = useRef<string | null>(null)

  async function loadQuestion(qid: string | null) {
    qRef.current = qid
    if (!qid) { setQ(null); setAnswers([]); setFb([]); return }
    const [qq, aa, ff] = await Promise.all([
      sb.from('live_questions').select('id,kind,board,task,answers_open').eq('id', qid).single(),
      sb.from('live_answers').select('id,text,attempt_no').eq('question_id', qid).eq('student_id', me).order('attempt_no'),
      sb.from('live_feedback').select('id,kind,text,created_at').eq('question_id', qid).eq('student_id', me).order('created_at'),
    ])
    if (qRef.current !== qid) return
    if (qq.data) setQ({ id: qq.data.id, kind: qq.data.kind, board: cleanBoard(qq.data.board), task: qq.data.task || '', answers_open: qq.data.answers_open })
    setAnswers((aa.data || []) as MyAns[])
    setFb((ff.data || []) as MyFb[])
    setDraft(readDraft(qid))
  }
  async function loadAll() {
    const s = await sb.from('live_sessions').select('status,current_question_id').eq('id', sessionId).maybeSingle()
    if (s.error) { setNetErr('Bağlantı kurulamadı. İnternetini kontrol et.'); return }
    setNetErr(null)
    if (!s.data || s.data.status !== 'active') { setEnded(true); setLoaded(true); return }
    await loadQuestion(s.data.current_question_id)
    setLoaded(true)
  }

  useEffect(() => {
    let alive = true
    loadAll()
    // Yoklama
    sb.from('live_attendance').upsert({ session_id: sessionId, student_id: me }).then(({ error }) => { if (error) console.error(error) })

    const ch = sb.channel('live-s-' + sessionId + '-' + me)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` }, p => {
        const r: any = p.new
        if (!alive || !r) return
        if (r.status !== 'active') { setEnded(true); return }
        if (r.current_question_id !== qRef.current) loadQuestion(r.current_question_id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_questions', filter: `session_id=eq.${sessionId}` }, p => {
        const r: any = p.new
        if (!alive || !r || r.id !== qRef.current) return
        setQ(x => x && x.id === r.id ? { ...x, board: cleanBoard(r.board), task: r.task || '', answers_open: r.answers_open } : x)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_feedback', filter: `student_id=eq.${me}` }, p => {
        const r: any = p.new
        if (!alive || !r || r.question_id !== qRef.current) return
        setFb(list => list.some(x => x.id === r.id) ? list : [...list, { id: r.id, kind: r.kind, text: r.text, created_at: r.created_at }])
      })
      .subscribe(status => { if (status === 'SUBSCRIBED' && alive) loadAll() })

    const pres = sb.channel('live-' + sessionId, { config: { presence: { key: me } } })
    pres.subscribe(status => { if (status === 'SUBSCRIBED') pres.track({ at: Date.now() }) })

    const onVis = () => { if (document.visibilityState === 'visible' && alive) loadAll() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      sb.removeChannel(ch)
      pres.untrack().finally(() => sb.removeChannel(pres))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, me])

  async function send() {
    if (!q) return
    const t = draft.trim()
    if (!t || sending) return
    setSending(true)
    const { data, error } = await sb.from('live_answers').insert({ question_id: q.id, session_id: sessionId, text: t.slice(0, 500) }).select('id,text,attempt_no').single()
    setSending(false)
    if (error) {
      if (/kapal/i.test(error.message || '')) { loadAll(); return }
      setNetErr('Gönderilemedi. İnternetini kontrol edip tekrar dene; yazdığın duruyor.')
      return
    }
    setNetErr(null)
    setAnswers(list => [...list, data as MyAns])
  }

  const first = account.displayName.split(' ')[0]
  const head = (
    <div className="stu-head">
      <div className="row" style={{ marginTop: 0 }}>
        <button className="btn sm" onClick={onExit}>← Çık</button>
        <h1>Merhaba {first}</h1>
      </div>
      <button className={'btn' + (!ended && klass.meet_url ? ' primary' : '')} disabled={ended || !klass.meet_url}
        onClick={() => window.open(klass.meet_url, '_blank', 'noopener')}>Görüntülü derse katıl</button>
    </div>
  )

  let body: React.ReactNode
  if (!loaded) body = <div className="wait"><p className="muted">Bağlanıyor…</p></div>
  else if (ended) body = <div className="wait"><h2>Ders bitti</h2><p className="muted">Katıldığın için teşekkürler.</p><button className="btn primary" onClick={onExit}>Tamam</button></div>
  else if (!q) body = <div className="wait"><h2>Ders başladı</h2><p className="muted">Öğretmenin birazdan tahtaya yazacak.</p></div>
  else {
    const has = answers.length > 0
    const last = has ? answers[answers.length - 1] : null
    const ok = fb.some(f => f.kind === 'confirm')
    const notes = fb.filter(f => f.kind === 'note')
    const closed = !q.answers_open
    const canSend = q.kind === 'question' && !closed && !ok && !!draft.trim() && !(last && draft.trim() === last.text.trim()) && !sending
    let stat = ''
    if (closed) stat = has ? 'Gönderdin.' : 'Bu soruya cevap göndermedin.'
    else if (!has) stat = 'Cevabını yaz ve Gönder’e bas.'
    else if (!ok) stat = 'Gönderildi. Öğretmenin bakıyor.'
    body = (
      <>
        <div className="board">
          <BoardSentence tokens={q.board} />
          {q.task && <p className="task">{q.task}</p>}
          <Legend withMark />
        </div>
        {q.kind === 'question' && (
          <div className="answer">
            <label className="f" htmlFor="lv-ans" style={{ marginTop: 0 }}>Cevabın</label>
            <textarea id="lv-ans" value={draft} disabled={closed || ok} placeholder="Buraya yaz" maxLength={500}
              autoCapitalize="sentences" spellCheck={false}
              onChange={e => { setDraft(e.target.value); writeDraft(q.id, e.target.value) }} />
            <div className="row">
              <span className="status">{stat}</span>
              <button className="btn primary big" disabled={!canSend} onClick={send}>{sending ? 'Gönderiliyor…' : has ? 'Yeniden gönder' : 'Gönder'}</button>
            </div>
          </div>
        )}
        {ok && <div className="okbox">✓ Öğretmenin onayladı. Aferin!</div>}
        {notes.length > 0 && (
          <div className="notebox">
            <h2>Öğretmeninden not</h2>
            <p className="big">{notes[notes.length - 1].text}</p>
            {!closed && !ok && <p className="small muted" style={{ margin: '6px 0 0' }}>Cevabını düzeltip yeniden gönderebilirsin.</p>}
            {notes.length > 1 && <ul>{notes.slice(0, -1).reverse().map(n => <li key={n.id}>{n.text}</li>)}</ul>}
          </div>
        )}
        {q.kind === 'question' && closed && <div className="info">Bu soru kapandı. Öğretmenin sıradaki soruyu açacak.</div>}
      </>
    )
  }

  return (
    <div className="lv"><LiveStyles />
      <div className="stu">
        {head}
        {netErr && <p className="err" role="alert">{netErr}</p>}
        {body}
      </div>
    </div>
  )
}
