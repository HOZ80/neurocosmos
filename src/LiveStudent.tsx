import { useEffect, useRef, useState } from 'react'
import type { Account } from './auth'
import type { BoardToken } from './liveShared'
import { sb, cleanBoard } from './liveShared'
import { LiveStyles, BoardSentence } from './LiveBoard'
import InstallButton from './InstallButton'

// ─── Öğrenci: Canlı Ders ──────────────────────────────────────────────────────
// Çocuk yalnızca kendi sınıfının dersini, kendi cevaplarını ve kendine gelen
// notları görebilir (bu kural veritabanında). Beklenen cevap ve otomatik
// sonuç buraya hiç gelmez; kırmızı ya da "yanlış" hiçbir yerde görünmez.

export interface LiveClassInfo { id: string; name: string; meet_url: string }
export interface LiveStatus { klass: LiveClassInfo | null; sessionId: string | null; checked: boolean }

// Öğrencinin sınıfı ve o sınıfın açık dersi; ders başlayınca haber alır.
// Üç katman birlikte çalışır, biri kaçırsa diğeri yakalar:
// 1) Anlık dinleme: sınıf süzgeci YOK (hangi dersi görebileceği zaten veritabanı
//    kuralıyla sınırlı), ayrıca öğrencinin sınıfının değişmesi de dinlenir.
//    Dinleme koparsa kendiliğinden yeniden kurulur.
// 2) Her 15 saniyede bir "ders açıldı mı" diye kendisi bakar.
// 3) Sayfa öne gelince, internet geri gelince ve yeniden bağlanınca bakar.
const POLL_MS = 15000

export function useLiveStatus(account: Account | null): LiveStatus {
  const [st, setSt] = useState<LiveStatus>({ klass: null, sessionId: null, checked: false })
  const isStudent = !!account && account.active && account.role === 'student'
  const uid = account?.id || ''

  useEffect(() => {
    if (!isStudent) { setSt({ klass: null, sessionId: null, checked: true }); return }
    let alive = true
    let running = false
    let again = false

    async function refreshOnce() {
      const m = await sb.from('live_class_members').select('class_id, live_classes(id,name,meet_url)').eq('student_id', uid).maybeSingle()
      if (!alive) return
      // Okunamadıysa (internet gitti) eldeki bilgi bozulmaz.
      if (m.error) { setSt(s => ({ ...s, checked: true })); return }
      const c: any = m.data ? (Array.isArray((m.data as any).live_classes) ? (m.data as any).live_classes[0] : (m.data as any).live_classes) : null
      if (!c) { setSt({ klass: null, sessionId: null, checked: true }); return }
      // Tek başına söz sırası (ders türü "oral") çocuklara bildirilmez: giriş gerektirmez, bildirim gitmez.
      const s = await sb.from('live_sessions').select('id').eq('class_id', c.id).eq('status', 'active').neq('kind', 'oral').limit(1)
      if (!alive) return
      if (s.error) { setSt(x => ({ ...x, checked: true })); return }
      const sid: string | null = (s.data && s.data[0] && (s.data[0] as any).id) || null
      setSt(prev => {
        const same = prev.checked && prev.sessionId === sid && prev.klass && prev.klass.id === c.id
          && prev.klass.name === c.name && prev.klass.meet_url === (c.meet_url || '')
        return same ? prev : { klass: { id: c.id, name: c.name, meet_url: c.meet_url || '' }, sessionId: sid, checked: true }
      })
    }
    // Aynı anda tek kontrol; çalışırken yeni istek gelirse bitince bir kez daha bakar.
    async function refresh() {
      if (running) { again = true; return }
      running = true
      try {
        do { again = false; try { await refreshOnce() } catch { if (alive) setSt(x => ({ ...x, checked: true })) } } while (again && alive)
      } finally { running = false }
    }

    refresh()
    const ch = sb.channel('live-status-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => { refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_class_members', filter: `student_id=eq.${uid}` }, () => { refresh() })
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh() })

    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    const onBack = () => refresh()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      alive = false
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onBack)
      window.removeEventListener('focus', onBack)
      sb.removeChannel(ch)
    }
  }, [isStudent, uid])

  return st
}

// Ders başlayınca her ekranın altında beliren şerit.
export function LiveBanner({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="nc-live-banner" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      display: 'flex', alignItems: 'center', gap: '12px', background: '#1B1F4B', color: '#fff',
      borderRadius: '999px', padding: '8px 8px 8px 16px', boxShadow: '0 8px 24px rgba(15,23,42,0.3)',
      fontFamily: "Quicksand, 'Outfit', system-ui, sans-serif", fontWeight: 700, fontSize: '15px', width: 'max-content', maxWidth: 'calc(100vw - 24px)', whiteSpace: 'nowrap',
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
          <div className="row" style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            <InstallButton variant="text" style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '9px' }} />
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

const TURN_CSS = `
.lv .stu-turn{position:fixed;z-index:50;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:560px;margin:0 auto;background:var(--brand);color:#fff;border-radius:16px;padding:14px 16px 12px;box-shadow:0 10px 24px rgba(40,10,110,.35);animation:stuTurnPop .35s ease-out}
.lv .stu-turn .t1{font:700 22px Quicksand,'Outfit',sans-serif;margin:0}
.lv .stu-turn .t2{font-size:14px;margin:2px 0 8px;opacity:.92}
.lv .stu-turn .qq{background:rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;font:700 16px/1.4 Quicksand,'Outfit',sans-serif}
.lv .stu-turn .qg{font:600 13px system-ui,sans-serif;opacity:.88;margin-top:2px}
@keyframes stuTurnPop{from{transform:translateY(10px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion: reduce){.lv .stu-turn{animation:none}}
`

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
  // Söz sırası: sıra bu çocuğa geldiyse (sonuçsuz ve iptal edilmemiş söz) ekranın altında kutu çıkar.
  // Yalnızca soru ve görev gelir; beklenen cevap bu kayıtta hiç yoktur. Sonuç çocuğa gösterilmez.
  const [turn, setTurn] = useState<{ id: string; prompt: string; task: string } | null>(null)
  async function loadTurn() {
    const t = await sb.from('live_oral_turns').select('id,prompt,task').eq('session_id', sessionId).eq('student_id', me)
      .is('result', null).is('cancelled_at', null).order('seq', { ascending: false }).limit(1)
    if (t.error) return
    const r: any = t.data && t.data[0]
    setTurn(prev => (r ? (prev && prev.id === r.id && prev.prompt === r.prompt ? prev : { id: r.id, prompt: r.prompt || '', task: r.task || '' }) : null))
  }

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
    if (!s.data || s.data.status !== 'active') { setEnded(true); setTurn(null); setLoaded(true); return }
    await Promise.all([loadQuestion(s.data.current_question_id), loadTurn()])
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
        if (r.status !== 'active') { setEnded(true); setTurn(null); return }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_oral_turns', filter: `student_id=eq.${me}` }, () => { if (alive) loadTurn() })
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
    <div className="lv"><LiveStyles /><style>{TURN_CSS}</style>
      <div className="stu">
        {head}
        {netErr && <p className="err" role="alert">{netErr}</p>}
        {body}
        {turn && !ended && (
          <>
            <div style={{ height: 150 }} aria-hidden="true" />
            <div className="stu-turn" role="status" aria-live="assertive">
              <p className="t1">Söz sende!</p>
              <p className="t2">Mikrofonunu aç ve cevabını söyle.</p>
              {turn.prompt && <div className="qq">{turn.prompt}{turn.task && <div className="qg">{turn.task}</div>}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
