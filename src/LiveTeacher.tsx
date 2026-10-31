import { useEffect, useState } from 'react'
import type { BoardToken, Pen, PlanItemDraft } from './liveShared'
import { sb, newId, parseImport, cleanBoard, shortName } from './liveShared'
import { LiveStyles, BoardSentence, PenBar, PaintableTokens, Legend } from './LiveBoard'
import LiveTeacherPanel, { loadRoster, demoStudents } from './LiveTeacherPanel'
import type { PanelClass, PanelStudent, PlanItem, Preset } from './LiveTeacherPanel'

// ─── Öğretmen: Canlı Ders ─────────────────────────────────────────────────────
// Ana ekran (ders başlat / deneme / devam et), Hazır notlar, Sınıflar ve
// Dersi içe aktar ekranları. Hepsi veri olarak tutulur, build harcamaz.

type Screen = 'home' | 'panel' | 'presets' | 'classes' | 'import'
const NAV_KEY = 'nc_live_teacher'

interface ClassRow { id: string; name: string; meet_url: string; is_default: boolean }
interface PlanRow { id: string; title: string; updated_at: string }

function readNav(): { screen: Screen; sessionId?: string } {
  try {
    const v = JSON.parse(sessionStorage.getItem(NAV_KEY) || 'null')
    if (v && ['home', 'panel', 'presets', 'classes', 'import'].includes(v.screen)) return v
  } catch {}
  return { screen: 'home' }
}
function writeNav(v: { screen: Screen; sessionId?: string }) {
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify(v)) } catch {}
}
export function clearLiveTeacherNav() { try { sessionStorage.removeItem(NAV_KEY) } catch {} }

async function loadPresets(): Promise<Preset[]> {
  const { data, error } = await sb.from('live_note_presets').select('id,category,text,sort').order('sort').order('text')
  if (error) throw error
  return (data || []) as Preset[]
}
async function loadPlanItems(planId: string | null): Promise<PlanItem[]> {
  if (!planId) return []
  const { data, error } = await sb.from('live_plan_items').select('id,seq,board,task,expected,topic,teacher_note').eq('plan_id', planId).order('seq')
  if (error) throw error
  return (data || []).map((r: any) => ({ ...r, board: cleanBoard(r.board) }))
}

export default function LiveTeacher({ onExit }: { onExit: () => void }) {
  const [nav, setNavState] = useState(readNav)
  const [panel, setPanel] = useState<null | { demo: boolean; sessionId: string; klass: PanelClass; students: PanelStudent[]; planItems: PlanItem[]; presets: Preset[] }>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function go(screen: Screen, sessionId?: string) {
    const v = { screen, ...(sessionId ? { sessionId } : {}) }
    setNavState(v)
    writeNav(v)
    setError(null)
    window.scrollTo(0, 0)
  }

  async function openSession(sessionId: string) {
    setBusy(true); setError(null)
    try {
      const { data: s, error: e1 } = await sb.from('live_sessions').select('id,class_id,plan_id,status,live_classes(id,name,meet_url)').eq('id', sessionId).single()
      if (e1 || !s) throw e1 || new Error('ders yok')
      if (s.status !== 'active') { go('home'); return }
      const c: any = Array.isArray(s.live_classes) ? s.live_classes[0] : s.live_classes
      const [students, planItems, presets] = await Promise.all([loadRoster(s.class_id), loadPlanItems(s.plan_id), loadPresets()])
      setPanel({ demo: false, sessionId, klass: { id: c.id, name: c.name, meet_url: c.meet_url || '' }, students, planItems, presets })
      go('panel', sessionId)
    } catch (e) {
      console.error(e)
      setError('Ders açılamadı. İnternet bağlantını kontrol edip tekrar dene.')
      go('home')
    } finally { setBusy(false) }
  }

  // Sayfa yenilenince açık derse geri dön.
  useEffect(() => {
    if (nav.screen === 'panel' && nav.sessionId && !panel) openSession(nav.sessionId)
    else if (nav.screen === 'panel' && !nav.sessionId) go('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startDemo(planId: string | null) {
    setBusy(true); setError(null)
    try {
      const [planItems, presets] = await Promise.all([loadPlanItems(planId), loadPresets()])
      setPanel({ demo: true, sessionId: 'demo', klass: { id: 'demo', name: 'Deneme Sınıfı', meet_url: '' }, students: demoStudents(), planItems, presets })
      setNavState({ screen: 'panel' }) // deneme yenilemede devam etmez
      writeNav({ screen: 'home' })
    } catch (e) {
      console.error(e)
      setError('Deneme açılamadı. İnternet bağlantını kontrol et.')
    } finally { setBusy(false) }
  }

  async function startLesson(classId: string, planId: string | null) {
    setBusy(true); setError(null)
    const id = newId()
    const { error: e } = await sb.from('live_sessions').insert({ id, class_id: classId, plan_id: planId })
    setBusy(false)
    if (e) {
      setError(/duplicate|unique/i.test(e.message || '') ? 'Bu sınıfın zaten açık bir dersi var. Aşağıdan devam edebilirsin.' : 'Ders başlatılamadı. İnternet bağlantını kontrol et.')
      return
    }
    openSession(id)
  }

  let body: React.ReactNode
  if (nav.screen === 'panel' && panel) {
    body = <LiveTeacherPanel key={panel.sessionId} {...panel} onExit={() => { setPanel(null); go('home') }} />
  } else if (nav.screen === 'presets') {
    body = <PresetsScreen onBack={() => go('home')} />
  } else if (nav.screen === 'classes') {
    body = <ClassesScreen onBack={() => go('home')} />
  } else if (nav.screen === 'import') {
    body = <ImportScreen onBack={() => go('home')} />
  } else if (nav.screen === 'panel') {
    body = <div className="panel"><p className="muted">Ders yükleniyor…</p></div>
  } else {
    body = <HomeScreen busy={busy} error={error} onExit={onExit} onStart={startLesson} onDemo={startDemo} onResume={openSession} onGo={go} />
  }

  return <div className="lv"><LiveStyles />{body}</div>
}

// ─── Ana ekran ───
function HomeScreen({ busy, error, onExit, onStart, onDemo, onResume, onGo }: {
  busy: boolean; error: string | null
  onExit: () => void
  onStart: (classId: string, planId: string | null) => void
  onDemo: (planId: string | null) => void
  onResume: (sessionId: string) => void
  onGo: (s: Screen) => void
}) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [active, setActive] = useState<{ id: string; class_id: string; started_at: string }[]>([])
  const [classId, setClassId] = useState('')
  const [planId, setPlanId] = useState('')
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null)

  async function load() {
    setLoadErr(null)
    const [c, p, a] = await Promise.all([
      sb.from('live_classes').select('id,name,meet_url,is_default').order('created_at'),
      sb.from('live_plans').select('id,title,updated_at').order('updated_at', { ascending: false }),
      sb.from('live_sessions').select('id,class_id,started_at').eq('status', 'active'),
    ])
    if (c.error || p.error || a.error) { setLoadErr('Bilgiler okunamadı. İnternet bağlantını kontrol et.'); return }
    setClasses(c.data as ClassRow[])
    setPlans(p.data as PlanRow[])
    setActive(a.data as any[])
    const def = (c.data as ClassRow[]).find(x => x.is_default) || (c.data as ClassRow[])[0]
    setClassId(id => id || def?.id || '')
  }
  useEffect(() => { load() }, [])

  async function endSession(id: string) {
    await sb.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    setConfirmEnd(null)
    load()
  }

  const name = (id: string) => classes?.find(c => c.id === id)?.name || 'Sınıf'
  const classBusy = active.some(a => a.class_id === classId)

  return (
    <div className="panel" style={{ maxWidth: 620 }}>
      <div className="top">
        <button className="btn sm" onClick={onExit}>← Geri</button>
        <span className="brand"><b>neuro</b><i>cosmos</i></span>
        <h1 style={{ fontSize: 22 }}>Canlı Ders</h1>
      </div>
      {loadErr && <div className="box"><p className="err" style={{ marginTop: 0 }}>{loadErr}</p><button className="btn" onClick={load}>Tekrar dene</button></div>}
      {error && <p className="err">{error}</p>}

      {active.length > 0 && (
        <div className="box" style={{ borderColor: 'var(--brand)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Devam eden ders</h2>
          {active.map(a => (
            <div key={a.id} className="row" style={{ flexWrap: 'wrap' }}>
              <span className="live">{name(a.class_id)}</span>
              <span className="muted small">başlangıç {new Date(a.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="grow" />
              <button className="btn primary" disabled={busy} onClick={() => onResume(a.id)}>Devam et</button>
              {confirmEnd === a.id
                ? <><button className="btn danger" onClick={() => endSession(a.id)}>Evet, bitir</button><button className="btn" onClick={() => setConfirmEnd(null)}>Vazgeç</button></>
                : <button className="btn" onClick={() => setConfirmEnd(a.id)}>Bitir</button>}
            </div>
          ))}
        </div>
      )}

      <div className="box">
        <h2 style={{ fontSize: 18 }}>Ders başlat</h2>
        <label className="f" htmlFor="lv-cls">Sınıf</label>
        <select id="lv-cls" value={classId} onChange={e => setClassId(e.target.value)} disabled={!classes}>
          {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="f" htmlFor="lv-plan">Hazırlanan sorular</label>
        <select id="lv-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
          <option value="">Yok, tahtadan gideceğim</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <p className="muted small" style={{ margin: '10px 0 14px' }}>Ders başlayınca katılan öğrenciler yoklamaya kendiliğinden yazılır. “Canlı Ders” düğmesi sadece bu sınıftaki çocukların ekranında yanar.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary big" disabled={busy || !classId || classBusy} onClick={() => onStart(classId, planId || null)}>Dersi başlat</button>
          <button className="btn big" disabled={busy} onClick={() => onDemo(planId || null)}>Deneme modu</button>
        </div>
        {classBusy && <p className="hint">Bu sınıfın açık bir dersi var; yukarıdan devam edebilir ya da bitirebilirsin.</p>}
        <p className="hint">Deneme modu 20 sahte öğrenciyle çalışır, hiçbir şey kaydetmez.</p>
      </div>

      <div className="box">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Hazırlık</h2>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 0 }}>
          <button className="btn" onClick={() => onGo('import')}>Dersi içe aktar</button>
          <button className="btn" onClick={() => onGo('presets')}>Hazır notlar</button>
          <button className="btn" onClick={() => onGo('classes')}>Sınıflar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Hazır notlar ───
function PresetsScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<Preset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cat, setCat] = useState('')
  const [text, setText] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})

  function load() { loadPresets().then(setList).catch(() => setErr('Notlar okunamadı.')) }
  useEffect(load, [])

  const cats: string[] = []
  for (const p of list || []) if (!cats.includes(p.category)) cats.push(p.category)

  async function add() {
    const c = cat.trim(), t = text.trim()
    if (!c || !t) { setErr('Başlık ve not metnini yaz.'); return }
    const inCat = (list || []).filter(p => p.category === c)
    const sort = inCat.length ? Math.max(...inCat.map(p => p.sort)) + 1 : ((list || []).reduce((m, p) => Math.max(m, p.sort), 0) + 10)
    const { error } = await sb.from('live_note_presets').insert({ category: c, text: t, sort })
    if (error) { setErr('Not eklenemedi.'); return }
    setText(''); setErr(null); load()
  }
  async function save(p: Preset) {
    const t = (edits[p.id] ?? p.text).trim()
    if (!t || t === p.text) return
    const { error } = await sb.from('live_note_presets').update({ text: t }).eq('id', p.id)
    if (error) { setErr('Kaydedilemedi.'); return }
    setEdits(e => { const n = { ...e }; delete n[p.id]; return n })
    load()
  }
  async function remove(p: Preset) {
    const { error } = await sb.from('live_note_presets').delete().eq('id', p.id)
    if (error) { setErr('Silinemedi.'); return }
    load()
  }

  return (
    <div className="panel" style={{ maxWidth: 680 }}>
      <div className="top"><button className="btn sm" onClick={onBack}>← Geri</button><h1 style={{ fontSize: 22 }}>Hazır notlar</h1></div>
      <p className="muted small">Not doğru cevabı vermez, neye bakılacağını söyler. Değişiklikler hemen kaydedilir.</p>
      {err && <p className="err">{err}</p>}
      <div className="box">
        <h2 style={{ fontSize: 17 }}>Yeni not</h2>
        <label className="f" htmlFor="pr-cat">Başlık</label>
        <input id="pr-cat" type="text" list="pr-cats" value={cat} onChange={e => setCat(e.target.value)} placeholder="Örnek: Fiil" maxLength={40} />
        <datalist id="pr-cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
        <label className="f" htmlFor="pr-text">Not</label>
        <input id="pr-text" type="text" value={text} onChange={e => setText(e.target.value)} maxLength={300} />
        <div className="row"><button className="btn primary" onClick={add}>Ekle</button></div>
      </div>
      {!list && !err && <p className="muted">Yükleniyor…</p>}
      {cats.map(c => (
        <div key={c} className="box">
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>{c}</h2>
          {(list || []).filter(p => p.category === c).map(p => (
            <div key={p.id} className="row">
              <input type="text" value={edits[p.id] ?? p.text} maxLength={300}
                onChange={e => setEdits(x => ({ ...x, [p.id]: e.target.value }))}
                onBlur={() => save(p)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              <button className="btn sm danger" onClick={() => remove(p)}>Sil</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Sınıflar ───
function ClassesScreen({ onBack }: { onBack: () => void }) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null)
  const [students, setStudents] = useState<{ id: string; name: string; classId: string }[]>([])
  const [drafts, setDrafts] = useState<Record<string, { name: string; meet_url: string }>>({})
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const [c, p, m] = await Promise.all([
      sb.from('live_classes').select('id,name,meet_url,is_default').order('created_at'),
      sb.from('profiles').select('id,display_name,surname_initial,active,role').eq('role', 'student').eq('active', true),
      sb.from('live_class_members').select('student_id,class_id'),
    ])
    if (c.error || p.error || m.error) { setErr('Bilgiler okunamadı.'); return }
    setClasses(c.data as ClassRow[])
    const map = new Map((m.data || []).map((r: any) => [r.student_id, r.class_id]))
    setStudents((p.data || []).map((r: any) => ({ id: r.id, name: shortName(r.display_name, r.surname_initial), classId: map.get(r.id) || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')))
  }
  useEffect(() => { load() }, [])

  function draftOf(c: ClassRow) { return drafts[c.id] || { name: c.name, meet_url: c.meet_url } }
  async function saveClass(c: ClassRow) {
    const d = draftOf(c)
    if (!d.name.trim()) { setErr('Sınıf adı boş olamaz.'); return }
    const { error } = await sb.from('live_classes').update({ name: d.name.trim(), meet_url: d.meet_url.trim() }).eq('id', c.id)
    if (error) { setErr('Kaydedilemedi.'); return }
    setDrafts(x => { const n = { ...x }; delete n[c.id]; return n })
    setErr(null); setMsg(`${d.name.trim()} kaydedildi.`); load()
  }
  async function addClass() {
    const n = newName.trim()
    if (!n) return
    const { error } = await sb.from('live_classes').insert({ name: n })
    if (error) { setErr('Sınıf açılamadı.'); return }
    setNewName(''); setErr(null); load()
  }
  async function removeClass(c: ClassRow) {
    if (c.is_default) return
    const { error } = await sb.from('live_classes').delete().eq('id', c.id)
    if (error) { setErr('Bu sınıfın kayıtlı dersleri var; silinemez. Adını değiştirebilirsin.'); return }
    setErr(null); load()
  }
  async function moveStudent(sid: string, classId: string) {
    const r = classId
      ? await sb.from('live_class_members').upsert({ student_id: sid, class_id: classId })
      : await sb.from('live_class_members').delete().eq('student_id', sid)
    if (r.error) { setErr('Öğrenci taşınamadı.'); return }
    setErr(null)
    setStudents(list => list.map(s => s.id === sid ? { ...s, classId } : s))
  }

  return (
    <div className="panel" style={{ maxWidth: 680 }}>
      <div className="top"><button className="btn sm" onClick={onBack}>← Geri</button><h1 style={{ fontSize: 22 }}>Sınıflar</h1></div>
      {err && <p className="err">{err}</p>}
      {msg && <p className="muted small">{msg}</p>}
      {!classes && !err && <p className="muted">Yükleniyor…</p>}
      {(classes || []).map(c => {
        const d = draftOf(c)
        const dirty = d.name !== c.name || d.meet_url !== c.meet_url
        return (
          <div key={c.id} className="box">
            <label className="f" htmlFor={'cn-' + c.id} style={{ marginTop: 0 }}>Sınıf adı {c.is_default && <span className="muted small">(varsayılan)</span>}</label>
            <input id={'cn-' + c.id} type="text" value={d.name} maxLength={60} onChange={e => setDrafts(x => ({ ...x, [c.id]: { ...d, name: e.target.value } }))} />
            <label className="f" htmlFor={'cm-' + c.id}>Meet bağlantısı</label>
            <input id={'cm-' + c.id} type="url" value={d.meet_url} placeholder="https://meet.google.com/..." onChange={e => setDrafts(x => ({ ...x, [c.id]: { ...d, meet_url: e.target.value } }))} />
            <p className="hint">Toplantıyı her zaman kendi AI Pro hesabından başlat. Çocuklardaki “Görüntülü derse katıl” düğmesi bu bağlantıyı açar.</p>
            <div className="row">
              <button className="btn primary" disabled={!dirty} onClick={() => saveClass(c)}>Kaydet</button>
              <span className="grow" />
              <span className="muted small">{students.filter(s => s.classId === c.id).length} öğrenci</span>
              {!c.is_default && <button className="btn sm danger" onClick={() => removeClass(c)}>Sınıfı sil</button>}
            </div>
          </div>
        )
      })}
      <div className="box">
        <label className="f" htmlFor="cn-new" style={{ marginTop: 0 }}>Yeni sınıf</label>
        <div className="row" style={{ marginTop: 0 }}>
          <input id="cn-new" type="text" value={newName} maxLength={60} onChange={e => setNewName(e.target.value)} placeholder="Örnek: Cumartesi grubu" />
          <button className="btn primary" disabled={!newName.trim()} onClick={addClass}>Aç</button>
        </div>
      </div>
      <div className="box">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Öğrenciler</h2>
        <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Sınıfı değiştirince hemen kaydedilir. Bir öğrenci aynı anda tek sınıfta olur.</p>
        {students.map(s => (
          <div key={s.id} className="row">
            <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
            <select value={s.classId} onChange={e => moveStudent(s.id, e.target.value)} style={{ width: 'auto', minWidth: 180 }}>
              <option value="">Sınıf yok</option>
              {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dersi içe aktar ───
function ImportScreen({ onBack }: { onBack: () => void }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [paste, setPaste] = useState('')
  const [items, setItems] = useState<PlanItemDraft[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null) // var olan dersi düzenleme
  const [title, setTitle] = useState('')
  const [pen, setPen] = useState<Pen>('ozne')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  async function load() {
    const { data, error } = await sb.from('live_plans').select('id,title,updated_at').order('updated_at', { ascending: false })
    if (error) { setErr('Dersler okunamadı.'); return }
    setPlans(data as PlanRow[])
  }
  useEffect(() => { load() }, [])

  function preview() {
    const list = parseImport(paste)
    if (!list.length) { setErr('Yapıştırılan metinde soru bulunamadı. Sheets’te satırları seçip kopyala, buraya yapıştır.'); return }
    setErr(null); setMsg(null); setItems(list); setEditingId(null)
  }
  async function open(p: PlanRow) {
    try {
      const its = await loadPlanItems(p.id)
      setItems(its.map(i => ({ id: newId(), board: i.board, task: i.task, expected: i.expected, topic: i.topic, teacher_note: i.teacher_note })))
      setTitle(p.title); setEditingId(p.id); setErr(null); setMsg(null)
      window.scrollTo(0, 0)
    } catch { setErr('Ders açılamadı.') }
  }
  async function save() {
    if (!items || !items.length) return
    const t = title.trim()
    if (!t) { setErr('Derse bir ad ver.'); return }
    setSaving(true); setErr(null)
    try {
      let planId = editingId
      if (planId) {
        const u = await sb.from('live_plans').update({ title: t, updated_at: new Date().toISOString() }).eq('id', planId)
        if (u.error) throw u.error
        const d = await sb.from('live_plan_items').delete().eq('plan_id', planId)
        if (d.error) throw d.error
      } else {
        planId = newId()
        const c = await sb.from('live_plans').insert({ id: planId, title: t })
        if (c.error) throw c.error
      }
      const rows = items.map((it, i) => ({ plan_id: planId, seq: i + 1, board: it.board, task: it.task, expected: it.expected, topic: it.topic, teacher_note: it.teacher_note }))
      const r = await sb.from('live_plan_items').insert(rows)
      if (r.error) throw r.error
      setMsg(`“${t}” kaydedildi (${items.length} soru). Ders başlatırken seçebilirsin.`)
      setItems(null); setPaste(''); setTitle(''); setEditingId(null)
      load()
    } catch (e) {
      console.error(e)
      setErr('Kaydedilemedi. İnternet bağlantını kontrol et.')
    } finally { setSaving(false) }
  }
  async function remove(id: string) {
    const { error } = await sb.from('live_plans').delete().eq('id', id)
    if (error) { setErr('Silinemedi.'); return }
    setConfirmDel(null); load()
  }
  function setBoard(i: number, board: BoardToken[]) {
    setItems(list => list ? list.map((it, j) => j === i ? { ...it, board } : it) : list)
  }

  return (
    <div className="panel" style={{ maxWidth: 760 }}>
      <div className="top"><button className="btn sm" onClick={onBack}>← Geri</button><h1 style={{ fontSize: 22 }}>Dersi içe aktar</h1></div>
      {err && <p className="err">{err}</p>}
      {msg && <p className="muted" style={{ fontWeight: 600 }}>{msg}</p>}

      {!items && (
        <div className="box">
          <p className="muted small" style={{ marginTop: 0 }}>Sheets’te satırları seç (sütunlar: Soru, Görev, Beklenen cevap, Konu, Not), kopyala ve buraya yapıştır. Başlık satırını da seçersen sorun olmaz.</p>
          <p className="muted small">Renk işareti: (ö …) özne, (f …) fiil, (n …) nesne, (z …) zaman/yer, (b …) bağlaç.</p>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={8} placeholder="Buraya yapıştır" />
          <div className="row"><button className="btn primary" disabled={!paste.trim()} onClick={preview}>Önizle</button></div>
        </div>
      )}

      {items && (
        <>
          <div className="box" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <p className="muted small" style={{ marginTop: 0 }}>Yanlış ya da eksik renk varsa kalemi seçip kelimeye dokun. Sheets’e dönmene gerek yok.</p>
            <PenBar pen={pen} onPen={setPen} />
          </div>
          <div className="list" style={{ marginBottom: 12 }}>
            {items.map((it, i) => (
              <div key={it.id} className="box" style={{ marginBottom: 0 }}>
                <div className="row" style={{ marginTop: 0 }}>
                  <span className="q" style={{ fontWeight: 700 }}>{i + 1}.</span>
                  <span className="muted small">{it.expected ? 'Tek doğru cevaplı' : 'Açık uçlu'}{it.topic ? ` · Konu: ${it.topic}` : ''}</span>
                  <span className="grow" />
                  <button className="btn sm danger" onClick={() => setItems(list => list ? list.filter((_, j) => j !== i) : list)}>Çıkar</button>
                </div>
                <PaintableTokens tokens={it.board} pen={pen} onChange={b => setBoard(i, b)} />
                <div className="board" style={{ padding: '8px 14px' }}><BoardSentence tokens={it.board} /></div>
                {it.task && <p className="task" style={{ marginTop: 6 }}>Görev: {it.task}</p>}
                {it.expected && <p className="expected">Beklenen cevap: <b>{it.expected.split('//').map(s => s.trim()).join(' / ')}</b></p>}
                {it.teacher_note && <p className="expected">Not: {it.teacher_note}</p>}
              </div>
            ))}
          </div>
          <Legend withMark />
          <div className="box" style={{ marginTop: 12 }}>
            <label className="f" htmlFor="im-title" style={{ marginTop: 0 }}>Dersin adı</label>
            <input id="im-title" type="text" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Örnek: 5. sınıf Ünite 2 – olumsuz cümleler" />
            <div className="row">
              <button className="btn primary" disabled={saving || !items.length} onClick={save}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
              <button className="btn" disabled={saving} onClick={() => { setItems(null); setEditingId(null); setTitle('') }}>Vazgeç</button>
            </div>
          </div>
        </>
      )}

      <div className="box">
        <h2 style={{ fontSize: 17, marginBottom: 6 }}>Kayıtlı dersler</h2>
        {!plans && <p className="muted small">Yükleniyor…</p>}
        {plans && !plans.length && <p className="muted small">Henüz kayıtlı ders yok.</p>}
        {(plans || []).map(p => (
          <div key={p.id} className="row" style={{ flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontWeight: 600, minWidth: 160 }}>{p.title}</span>
            <button className="btn sm" onClick={() => open(p)}>Aç ve düzenle</button>
            {confirmDel === p.id
              ? <><button className="btn sm danger" onClick={() => remove(p.id)}>Evet, sil</button><button className="btn sm" onClick={() => setConfirmDel(null)}>Vazgeç</button></>
              : <button className="btn sm danger" onClick={() => setConfirmDel(p.id)}>Sil</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
