import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Fin, OralRes, LessonCalc, LessonInfo, Agg } from './liveReportCalc'
import {
  buildLesson, aggStudents, aggKonu, struggling, hasOral, konuOf, lessonKindLabel, zero, addW,
  weekPeriod, monthPeriod, fd, ft, RESULT_LABEL,
} from './liveReportCalc'
import type { ReportClass, ReportStudent } from './liveReportData'
import { loadClasses, loadLessonList, loadClassStudents, loadStudentNames, loadRawLessons } from './liveReportData'
import { downloadReportExcel } from './liveReportExcel'

// ─── Raporlar ─────────────────────────────────────────────────────────────────
// Kabul edilen önizlemedeki ekran: sınıf + dönem (ders / hafta / ay) seçilir;
// Öğrenciler, Konular ve (tek derste) Sorular görünümleri; öğrenciye dokununca
// öğrenci sayfası. Sadece öğretmenin ekranında; öğrenciler raporu görmez.

type Period = 'ders' | 'hafta' | 'ay'
type View = 'ogr' | 'konu' | 'soru'

const REPORT_CSS = `
.lv .rp{max-width:1120px;margin:0 auto;padding:16px 18px 48px}
.lv .rp .rp-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-bottom:14px}
.lv .rp .rp-back{border:0;background:none;color:var(--brand);font-weight:700;cursor:pointer;padding:4px 0}
.lv .rp .rp-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.lv .rp .rp-tag{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:1px 8px;background:var(--brand-soft);color:var(--brand);vertical-align:middle}
.lv .rp .rp-tag.o{background:var(--neutral-bg);color:var(--neutral)}
.lv .rp .rp-chip{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;white-space:nowrap}
.lv .rp .c-ok{background:var(--ok-bg);color:var(--ok)}
.lv .rp .c-near{background:var(--near-bg);color:var(--near)}
.lv .rp .c-bad{background:var(--bad-bg);color:var(--bad)}
.lv .rp .c-wait{background:var(--wait-bg);color:var(--wait)}
.lv .rp .c-neu{background:var(--neutral-bg);color:var(--neutral)}
.lv .rp .rp-lessons{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.lv .rp .rp-lbtn{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:7px 11px;cursor:pointer;text-align:left}
.lv .rp .rp-lbtn[aria-pressed="true"]{border-color:var(--brand);background:var(--brand-soft)}
.lv .rp .rp-lbtn b{font-family:Quicksand,'Outfit',sans-serif;display:block}
.lv .rp .rp-scroll{overflow-x:auto}
.lv .rp table{border-collapse:collapse;width:100%;font-size:14px}
.lv .rp th,.lv .rp td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
.lv .rp th{font-weight:700;font-size:12.5px;color:var(--muted);background:var(--surface)}
.lv .rp th.grp{color:var(--ink);font-family:Quicksand,'Outfit',sans-serif;font-size:13.5px;border-bottom:2px solid var(--line)}
.lv .rp th.grp.o{color:var(--neutral)}
.lv .rp td.l,.lv .rp th.l{text-align:left}
.lv .rp tr.click{cursor:pointer}
.lv .rp tr.click:hover td{background:var(--surface2)}
.lv .rp td.zero{color:var(--muted);opacity:.6}
.lv .rp td.oc{background:color-mix(in srgb,var(--neutral-bg) 45%,transparent)}
.lv .rp .rp-bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--wait-bg);min-width:140px}
.lv .rp .rp-bar span{display:block;height:100%}
.lv .rp .rp-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12.5px;color:var(--muted)}
.lv .rp .rp-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.lv .rp .rp-konu{border-top:1px solid var(--line);padding:12px 0}
.lv .rp .rp-konu:first-of-type{border-top:0}
.lv .rp .rp-qrow{border-top:1px solid var(--line);padding:10px 0}
.lv .rp .rp-qrow:first-child{border-top:0}
.lv .rp .rp-qhead{display:flex;gap:10px;align-items:flex-start;cursor:pointer;background:none;border:0;width:100%;text-align:left;color:var(--ink);padding:0}
.lv .rp .rp-qno{font-family:Quicksand,'Outfit',sans-serif;font-weight:700;color:var(--muted);min-width:22px}
.lv .rp .rp-qdetail{margin:8px 0 0 32px}
.lv .rp .rp-att{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.lv .rp .rp-empty{text-align:center;padding:36px 16px;color:var(--muted)}
.lv .rp details>summary{cursor:pointer;font-weight:700;color:var(--brand)}
.lv .rp .rp-note{font-size:13px;color:var(--muted);line-height:1.5}
.lv .rp .rp-stats{display:flex;flex-wrap:wrap;gap:8px}
.lv .rp .rp-stat{background:var(--surface2);border-radius:10px;padding:8px 12px;min-width:110px}
.lv .rp .rp-stat b{display:block;font-family:Quicksand,'Outfit',sans-serif;font-size:19px}
.lv .rp h2.rp-h{font-size:18px;margin:16px 0 8px}
@media (max-width:640px){.lv .rp{padding:12px 12px 40px}.lv .rp th,.lv .rp td{padding:6px 7px}}
`

const CHIP: Record<Fin | OralRes, string> = {
  dogru: 'c-ok', yakin: 'c-near', yanlis: 'c-bad', cevapsiz: 'c-wait', notr: 'c-neu',
  ilk: 'c-ok', duz: 'c-neu', yap: 'c-bad',
}
function Chip({ k }: { k: Fin | OralRes }) { return <span className={'rp-chip ' + CHIP[k]}>{RESULT_LABEL[k]}</span> }

function Num({ v, oral }: { v: number; oral?: boolean }) {
  return <td className={(v ? '' : 'zero') + (oral ? ' oc' : '')}>{v}</td>
}

function Bar({ a }: { a: Agg }) {
  const parts: [keyof Agg, string][] = [['d', 'var(--ok)'], ['y', 'var(--near)'], ['x', 'var(--bad)'], ['c', 'var(--wait)']]
  const n = a.d + a.y + a.x + a.c
  if (!n) return null
  return (
    <div className="rp-bar" title={`Doğru ${a.d}, yakın ${a.y}, yanlış ${a.x}, cevapsız ${a.c}`}>
      {parts.map(([k, c]) => a[k] ? <span key={k} style={{ width: (a[k] / n * 100) + '%', background: c }} /> : null)}
    </div>
  )
}
function BarO({ a }: { a: Agg }) {
  const parts: [keyof Agg, string][] = [['i', 'var(--ok)'], ['dz', 'var(--neutral)'], ['yp', 'var(--bad)']]
  const n = a.i + a.dz + a.yp
  if (!n) return null
  return (
    <div className="rp-bar" title={`İlk denemede doğru ${a.i}, düzeltmeden sonra ${a.dz}, yapamadı ${a.yp}`}>
      {parts.map(([k, c]) => a[k] ? <span key={k} style={{ width: (a[k] / n * 100) + '%', background: c }} /> : null)}
    </div>
  )
}

export default function LiveReport({ initial, onBack }: {
  initial?: { classId?: string; lessonId?: string }
  onBack: () => void
}) {
  const [classes, setClasses] = useState<ReportClass[] | null>(null)
  const [classId, setClassId] = useState('')
  const [lessons, setLessons] = useState<LessonInfo[] | null>(null)
  const [members, setMembers] = useState<ReportStudent[]>([])
  const [extraNames, setExtraNames] = useState<Map<string, string>>(new Map())
  const [period, setPeriod] = useState<Period>(initial?.lessonId ? 'ders' : 'hafta')
  const [week, setWeek] = useState(0)
  const [month, setMonth] = useState(0)
  const [lessonId, setLessonId] = useState<string | null>(initial?.lessonId || null)
  const [view, setView] = useState<View>('ogr')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [openQ, setOpenQ] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [excelMsg, setExcelMsg] = useState<string | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const cache = useRef(new Map<string, LessonCalc>())
  const [, setTick] = useState(0)
  const savedY = useRef(0)
  const firstLoad = useRef(true)

  // Sınıflar
  useEffect(() => {
    let alive = true
    loadClasses().then(cs => {
      if (!alive) return
      setClasses(cs)
      const pick = cs.find(c => c.id === initial?.classId) || cs.find(c => c.is_default) || cs[0]
      setClassId(pick ? pick.id : '')
      if (!pick) setLessons([])
    }).catch(() => { if (alive) setErr('Sınıflar okunamadı. İnternet bağlantını kontrol et.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  // Seçili sınıfın bitmiş dersleri ve öğrencileri
  useEffect(() => {
    if (!classId) return
    let alive = true
    setLessons(null); setErr(null)
    Promise.all([loadLessonList(classId), loadClassStudents(classId)]).then(([ls, ms]) => {
      if (!alive) return
      setLessons(ls)
      setMembers(ms)
      setLessonId(cur => {
        if (firstLoad.current && initial?.lessonId && ls.some(l => l.id === initial.lessonId)) return initial.lessonId
        if (cur && ls.some(l => l.id === cur)) return cur
        return ls.length ? ls[0].id : null
      })
      firstLoad.current = false
    }).catch(() => { if (alive) { setErr('Raporlar okunamadı. İnternet bağlantını kontrol edip tekrar dene.'); setLessons([]) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, reloadKey])

  // Dönemdeki dersler
  const per = period === 'hafta' ? weekPeriod(week) : period === 'ay' ? monthPeriod(month) : null
  const inPeriod: LessonInfo[] = !lessons ? [] : (period === 'ders'
    ? lessons.filter(l => l.id === lessonId)
    : lessons.filter(l => per && l.startedAt >= per.from && l.startedAt < per.to))
        .slice().sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const missingKey = inPeriod.filter(l => !cache.current.has(l.id)).map(l => l.id).join(',')

  // Dönemdeki derslerin ayrıntısını oku (bir kez okunan ders bellekte kalır)
  useEffect(() => {
    if (!missingKey) return
    let alive = true
    const ids = missingKey.split(',')
    setErr(null)
    loadRawLessons(ids).then(async raw => {
      for (const id of ids) {
        const info = inPeriod.find(l => l.id === id)
        const r = raw.get(id)
        if (info && r) cache.current.set(id, buildLesson(info, r))
      }
      const known = new Set(members.map(m => m.id))
      const need: string[] = []
      cache.current.forEach(c => c.present.forEach(s => { if (!known.has(s) && !extraNames.has(s)) need.push(s) }))
      if (need.length) {
        const nm = await loadStudentNames(need)
        if (alive) setExtraNames(prev => { const n = new Map(prev); nm.forEach((v, k) => n.set(k, v)); return n })
      }
      if (alive) setTick(t => t + 1)
    }).catch(() => { if (alive) setErr('Ders kayıtları okunamadı. İnternet bağlantını kontrol edip tekrar dene.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, reloadKey])

  // Öğrenci sayfasından dönünce tablo kaldığı yerden açılsın.
  useLayoutEffect(() => {
    if (studentId === null) window.scrollTo(0, savedY.current)
  }, [studentId])

  const ready = !!lessons && inPeriod.every(l => cache.current.has(l.id))
  const calcs: LessonCalc[] = ready ? inPeriod.map(l => cache.current.get(l.id) as LessonCalc) : []
  const oral = hasOral(calcs)

  // Öğrenci listesi: sınıfın öğrencileri + o dönemde derse katılmış olanlar; hep alfabetik.
  const nameMap = new Map<string, string>()
  members.forEach(m => nameMap.set(m.id, m.name))
  extraNames.forEach((v, k) => { if (!nameMap.has(k)) nameMap.set(k, v) })
  const rosterIds = new Set<string>(members.map(m => m.id))
  calcs.forEach(c => c.present.forEach(s => rosterIds.add(s)))
  const roster = Array.from(rosterIds).map(id => ({ id, name: nameMap.get(id) || '?' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const sName = (id: string) => nameMap.get(id) || '?'
  const className = classes?.find(c => c.id === classId)?.name || 'Sınıf'

  const periodLabel = period === 'ders'
    ? (inPeriod[0] ? `${fd(inPeriod[0].startedAt)} – ${inPeriod[0].title}` : '')
    : (per ? per.label : '')

  function changePeriod(p: Period) {
    setPeriod(p); setOpenQ(null)
    if (p !== 'ders' && view === 'soru') setView('ogr')
    if (p === 'ders' && !lessonId && lessons && lessons.length) setLessonId(lessons[0].id)
  }
  function openStudent(id: string) { savedY.current = window.scrollY; setStudentId(id); window.scrollTo(0, 0) }
  async function exportExcel() {
    if (!calcs.length || excelBusy) return
    setExcelBusy(true); setExcelMsg(null)
    try {
      const name = await downloadReportExcel({ className, periodLabel, lessons: calcs, students: roster })
      setExcelMsg(`Dosya indirildi: ${name}`)
    } catch (e) {
      console.error(e)
      setExcelMsg('Dosya hazırlanamadı. Tekrar dene.')
    } finally { setExcelBusy(false) }
  }

  // ─── Öğrenci sayfası ───
  if (studentId) return <StudentPage
    id={studentId} name={sName(studentId)} className={className} periodLabel={periodLabel} period={period}
    calcs={calcs} oral={oral} sName={sName} onBack={() => setStudentId(null)} />

  // ─── Rapor ───
  const showLessons = period === 'ders' && !!lessons && lessons.length > 0
  let body: React.ReactNode
  if (err) body = <div className="box rp-empty"><p style={{ margin: '0 0 10px' }}>{err}</p><button type="button" className="btn" onClick={() => { cache.current.clear(); setErr(null); setReloadKey(k => k + 1) }}>Tekrar dene</button></div>
  else if (!lessons || !ready) body = <div className="box rp-empty">Yükleniyor…</div>
  else if (!lessons.length) body = <div className="box rp-empty">Bu sınıfta henüz ders yapılmadı. İlk ders bitince rapor burada kendiliğinden oluşur.</div>
  else if (!inPeriod.length) body = <div className="box rp-empty">{period === 'hafta' ? 'Bu hafta' : 'Bu ay'} bu sınıfta ders yapılmadı.</div>
  else body = (
    <>
      <div className="rp-row" style={{ margin: '4px 0 12px' }}>
        <div className="seg" role="group" aria-label="Görünüm">
          <button type="button" aria-pressed={view === 'ogr'} onClick={() => setView('ogr')}>Öğrenciler</button>
          <button type="button" aria-pressed={view === 'konu'} onClick={() => setView('konu')}>Konular</button>
          <button type="button" aria-pressed={view === 'soru'} disabled={period !== 'ders'} title={period === 'ders' ? undefined : 'Sorular tek ders seçilince görünür'} onClick={() => setView('soru')}>Sorular</button>
        </div>
        <span className="small muted">{calcs.length} ders · {periodLabel}</span>
      </div>
      {view === 'konu' ? <KonuView calcs={calcs} oral={oral} sName={sName} onStudent={openStudent} />
        : view === 'soru' && period === 'ders' ? <SoruView lesson={calcs[0]} oral={oral} sName={sName} openQ={openQ} onToggle={k => setOpenQ(o => o === k ? null : k)} />
          : <OgrView calcs={calcs} oral={oral} roster={roster} onStudent={openStudent} />}
      <HelpBox />
    </>
  )

  return (
    <div className="panel rp">
      <style>{REPORT_CSS}</style>
      <div className="rp-top">
        <button type="button" className="rp-back" onClick={onBack}>← Geri</button>
        <h1 style={{ fontSize: 24 }}>Raporlar</h1>
        <span className="grow" />
        <button type="button" className="btn" disabled={!calcs.length || excelBusy} onClick={exportExcel}>{excelBusy ? 'Hazırlanıyor…' : 'Excel’e aktar'}</button>
      </div>
      {excelMsg && <p className="small muted" style={{ margin: '-6px 0 10px' }} role="status">{excelMsg}</p>}
      <div className="box">
        <div className="rp-row">
          <label className="small">Sınıf{' '}
            <select value={classId} onChange={e => { setClassId(e.target.value); setOpenQ(null) }} style={{ width: 'auto' }} disabled={!classes}>
              {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Dönem">
            {([['ders', 'Ders'], ['hafta', 'Hafta'], ['ay', 'Ay']] as [Period, string][]).map(([k, t]) => (
              <button type="button" key={k} aria-pressed={period === k} disabled={k === 'ders' && !(lessons && lessons.length)} onClick={() => changePeriod(k)}>{t}</button>
            ))}
          </div>
          {period === 'hafta' && per && (
            <div className="rp-row">
              <button type="button" className="btn sm" onClick={() => setWeek(w => w - 1)} aria-label="Önceki hafta">‹</button>
              <b className="small">{per.label}</b>
              <button type="button" className="btn sm" disabled={week >= 0} onClick={() => setWeek(w => w + 1)} aria-label="Sonraki hafta">›</button>
            </div>
          )}
          {period === 'ay' && per && (
            <div className="rp-row">
              <button type="button" className="btn sm" onClick={() => setMonth(m => m - 1)} aria-label="Önceki ay">‹</button>
              <b className="small">{per.label}</b>
              <button type="button" className="btn sm" disabled={month >= 0} onClick={() => setMonth(m => m + 1)} aria-label="Sonraki ay">›</button>
            </div>
          )}
        </div>
        {showLessons && lessons && (
          <div className="rp-lessons">
            {lessons.map(l => (
              <button type="button" key={l.id} className="rp-lbtn" aria-pressed={lessonId === l.id} onClick={() => { setLessonId(l.id); setOpenQ(null) }}>
                <b>{l.title}</b>
                <span className="small muted">{fd(l.startedAt)} · {ft(l.startedAt)}</span>{' '}
                <LessonTag l={cache.current.get(l.id) || null} info={l} />
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </div>
  )
}

// Ders düğmesindeki tür rozeti (yazılı / sözlü / yazılı + sözlü).
function LessonTag({ l, info }: { l: LessonCalc | null; info: LessonInfo }) {
  let label: string
  let isW = true
  if (l) { label = lessonKindLabel(l, l.oEv.length > 0); isW = l.isW }
  else if (info.kind === 'oral') { label = 'Sözlü'; isW = false }
  else if (info.kind === 'both') label = 'Yazılı + sözlü'
  else label = 'Yazılı'
  return <span className={'rp-tag' + (isW ? '' : ' o')}>{label}</span>
}

// ─── Öğrenciler ───
function OgrView({ calcs, oral, roster, onStudent }: {
  calcs: LessonCalc[]; oral: boolean; roster: ReportStudent[]; onStudent: (id: string) => void
}) {
  const A = aggStudents(calcs, roster.map(r => r.id))
  const one = calcs.length === 1
  const unmarked = roster.reduce((n, r) => n + A[r.id].u, 0)
  return (
    <div className="box rp-scroll">
      <table>
        <thead>
          <tr>
            <th className="l" rowSpan={2}>Öğrenci</th>
            <th rowSpan={2}>{one ? 'Yoklama' : 'Katılım'}</th>
            <th className="grp" colSpan={4}>Yazılı</th>
            {oral && <th className="grp o" colSpan={4}>Sözlü (söz sırası)</th>}
            <th rowSpan={2}>Birebir<br />destek</th>
          </tr>
          <tr>
            <th>Doğru</th><th>Yakın</th><th>Yanlış</th><th>Cevapsız</th>
            {oral && <><th>Söz</th><th>İlk denemede<br />doğru</th><th>Düzeltmeden<br />sonra doğru</th><th>Yapamadı</th></>}
          </tr>
        </thead>
        <tbody>
          {roster.map(s => {
            const a = A[s.id]
            const present = calcs[0] ? calcs[0].present.has(s.id) : false
            const dropped = one && (calcs[0].drops.get(s.id) || 0) > 0
            const absent = one && !present
            let yk: React.ReactNode
            if (one) {
              yk = !present ? <span className="rp-chip c-wait">Katılmadı</span>
                : <><span className="rp-chip c-ok">Katıldı</span>{dropped && <> <span className="small muted">arada koptu</span></>}</>
            } else {
              yk = <>{a.pres}/{calcs.length}{a.drop > 0 && <span className="small muted"> ({a.drop} kez koptu)</span>}</>
            }
            return (
              <tr key={s.id} className="click" tabIndex={0} onClick={() => onStudent(s.id)} onKeyDown={e => { if (e.key === 'Enter') onStudent(s.id) }}>
                <td className="l"><b>{s.name}</b></td>
                <td>{yk}</td>
                {absent ? <><td className="zero" colSpan={oral ? 8 : 4}>derse katılmadı</td><td className="zero">–</td></> : <>
                  <Num v={a.d} /><Num v={a.y} /><Num v={a.x} /><Num v={a.c} />
                  {oral && <><Num v={a.s} oral /><Num v={a.i} oral /><Num v={a.dz} oral /><Num v={a.yp} oral /></>}
                  {a.bb ? <td><span className="rp-chip c-bad">{a.bb}</span></td> : <td className="zero">0</td>}
                </>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="rp-note" style={{ margin: '10px 0 0' }}>
        Liste her zaman alfabetik; sıralama yok. Bir öğrenciye dokununca ayrıntısı açılır.
        {oral ? '' : ' Sözlü sütunlar, dönemde söz sırası kaydı olunca kendiliğinden görünür.'}
        {unmarked > 0 ? ` ${unmarked} cevap, açık uçlu soruda işaretlenmediği için sayıya girmedi.` : ''}
      </p>
    </div>
  )
}

// ─── Konular ───
function KonuView({ calcs, oral, sName, onStudent, onlyStudent }: {
  calcs: LessonCalc[]; oral: boolean; sName: (id: string) => string; onStudent?: (id: string) => void; onlyStudent?: string
}) {
  const K = aggKonu(calcs, onlyStudent)
  const keys = Object.keys(K)
  if (!keys.length) return <div className="box rp-empty">Bu dönemde konu kaydı yok.</div>
  return (
    <div className="box">
      <div className="rp-legend" style={{ marginBottom: 6 }}>
        <span><i className="rp-dot" style={{ background: 'var(--ok)' }} />Doğru</span>
        <span><i className="rp-dot" style={{ background: 'var(--near)' }} />Yakın</span>
        <span><i className="rp-dot" style={{ background: 'var(--bad)' }} />Yanlış</span>
        <span><i className="rp-dot" style={{ background: 'var(--wait)' }} />Cevapsız</span>
        {oral && <span><i className="rp-dot" style={{ background: 'var(--neutral)' }} />Sözlü: düzeltmeden sonra doğru</span>}
      </div>
      {keys.map(k => {
        const v = K[k]
        const hard = Object.keys(v.st).filter(id => struggling(v.st[id])).sort((a, b) => sName(a).localeCompare(sName(b), 'tr'))
        return (
          <div className="rp-konu" key={k}>
            <div className="rp-row">
              <h3 style={{ fontSize: 16 }}>{k}</h3>
              <span className="small muted">{v.qs.size} yazılı soru{oral && v.oq.size ? `, ${v.oq.size} sözlü soru` : ''}</span>
            </div>
            {v.qs.size > 0 && (
              <div className="rp-row" style={{ margin: '8px 0' }}>
                <span className="small muted" style={{ minWidth: 52 }}>Yazılı</span><Bar a={v.tot} />
                <span className="small">{v.tot.d} doğru, {v.tot.y} yakın, {v.tot.x} yanlış, {v.tot.c} cevapsız</span>
              </div>
            )}
            {oral && v.oq.size > 0 && (
              <div className="rp-row" style={{ margin: '0 0 8px' }}>
                <span className="small muted" style={{ minWidth: 52 }}>Sözlü</span><BarO a={v.tot} />
                <span className="small">{v.tot.s} söz: {v.tot.i} ilk denemede, {v.tot.dz} düzeltmeden sonra, {v.tot.yp} yapamadı</span>
              </div>
            )}
            {onlyStudent
              ? (hard.length ? <span className="rp-chip c-near">Bu konuda zorlanıyor</span> : <span className="rp-chip c-ok">Bu konuda iyi gidiyor</span>)
              : (
                <div className="rp-row">
                  <span className="small"><b>Zorlananlar:</b></span>
                  {hard.length ? hard.map(id => (
                    <button type="button" key={id} className="btn sm" onClick={() => onStudent && onStudent(id)}>{sName(id)}{v.st[id].bb ? ' · birebir destek' : ''}</button>
                  )) : <span className="small muted">yok</span>}
                </div>
              )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Sorular (tek ders) ───
function SoruView({ lesson, oral, sName, openQ, onToggle }: {
  lesson: LessonCalc; oral: boolean; sName: (id: string) => string; openQ: string | null; onToggle: (k: string) => void
}) {
  const byName = (a: string, b: string) => sName(a).localeCompare(sName(b), 'tr')
  return (
    <div className="box">
      {lesson.w.length === 0 && lesson.o.length === 0 && <p className="muted" style={{ margin: 0 }}>Bu derste soru kaydı yok.</p>}
      {lesson.w.map((q, qi) => {
        const es = lesson.wEv.filter(e => e.q === qi).slice().sort((x, y) => byName(x.s, y.s))
        const a = zero()
        es.forEach(e => addW(a, e))
        const bbs = es.filter(e => e.bb).map(e => sName(e.s)).sort((x, y) => x.localeCompare(y, 'tr'))
        const key = 'w' + qi
        const op = openQ === key
        return (
          <div className="rp-qrow" key={q.id}>
            <button type="button" className="rp-qhead" aria-expanded={op} onClick={() => onToggle(key)}>
              <span className="rp-qno">{qi + 1}</span>
              <span style={{ flex: 1 }}>
                <b>{q.text}</b> <span className="small muted">{q.task ? q.task + ' · ' : ''}{konuOf(q.topic)}</span><br />
                {q.expected && <span className="small">Beklenen cevap: {q.expected.split('//').map(s => s.trim()).filter(Boolean).join(' / ').replace(/'/g, '’')}</span>}
                <span className="rp-row" style={{ marginTop: 6 }}>
                  <Bar a={a} />
                  <span className="small">{a.d} doğru, {a.y} yakın, {a.x} yanlış, {a.c} cevapsız{a.u ? `, ${a.u} işaretlenmedi` : ''}</span>
                  {bbs.length > 0 && <span className="rp-chip c-bad">Birebir destek: {bbs.join(', ')}</span>}
                </span>
              </span>
              <span className="small muted">{op ? 'Kapat' : 'Cevaplar'}</span>
            </button>
            {op && (
              <div className="rp-qdetail rp-scroll">
                <table><tbody>
                  {es.map(e => (
                    <tr key={e.s}>
                      <td className="l"><b>{sName(e.s)}</b></td>
                      <td className="l"><Chip k={e.fin} />{e.bb && <> <span className="rp-chip c-bad">birebir</span></>}</td>
                      <td className="l">
                        <div className="rp-att">
                          {e.att.length ? e.att.map((t, i) => (
                            <span className="small" key={i}>{i + 1}. deneme: {t.text} {t.sec != null && <span className="muted">({t.sec} sn)</span>}</span>
                          )) : <span className="small muted">cevap göndermedi</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </div>
        )
      })}
      {oral && lesson.o.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: '14px 0 4px', color: 'var(--neutral)' }}>Sözlü (söz sırası)</h3>
          {lesson.o.map((q, qi) => {
            const es = lesson.oEv.filter(e => e.q === qi)
            return (
              <div className="rp-qrow" key={q.key}>
                <div className="rp-row"><span className="rp-qno">S{qi + 1}</span><b>{q.text}</b><span className="small muted">{konuOf(q.topic)}</span></div>
                <div className="rp-att" style={{ margin: '6px 0 0 32px' }}>
                  {es.map((e, i) => (
                    <span className="small" key={i}>{sName(e.s)}{e.again ? ' (ikinci söz)' : ''} <Chip k={e.r} />{e.bb && <> <span className="rp-chip c-bad">birebir</span></>}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function HelpBox() {
  return (
    <details className="box">
      <summary>Nasıl sayılıyor?</summary>
      <div className="rp-note" style={{ marginTop: 8 }}>
        <p>Yazılı sorularda her öğrencinin o sorudaki son sonucu sayılır; sen kartta kararı değiştirdiysen senin kararın sayılır. Cevapsız, derse katıldığı halde o soruya hiç cevap göndermemesi demek.</p>
        <p>Sözlü sonuçlar söz sırasından gelir: her söz için ilk denemede doğru, düzeltmeden sonra doğru ya da yapamadı. Aynı soruda üst üste iki yanlış (yazılıda da sözlüde de) birebir destek olarak sayılır; yakın yanlış sayılmaz.</p>
        <p>Zorlanıyor: o konudaki sorularının en az yarısı yanlış, cevapsız ya da yapamadı ise, veya o konuda birebir desteğe düştüyse. Bu eşiği ileride değiştirebiliriz.</p>
        <p>Bu sayfa sadece senin ekranında; öğrenciler raporu görmez.</p>
      </div>
    </details>
  )
}

// ─── Öğrenci sayfası ───
function StudentPage({ id, name, className, periodLabel, period, calcs, oral, sName, onBack }: {
  id: string; name: string; className: string; periodLabel: string; period: Period
  calcs: LessonCalc[]; oral: boolean; sName: (id: string) => string; onBack: () => void
}) {
  const a = aggStudents(calcs, [id])[id]
  const myW = calcs.flatMap(l => l.wEv.filter(e => e.s === id).map(e => ({ l, e })))
  const myO = calcs.flatMap(l => l.oEv.filter(e => e.s === id).map(e => ({ l, e })))
  const bbW = myW.filter(x => x.e.bb)
  const bbO = myO.filter(x => x.e.bb)
  return (
    <div className="panel rp">
      <style>{REPORT_CSS}</style>
      <div className="rp-top">
        <button type="button" className="rp-back" onClick={onBack}>← Geri</button>
        <h1 style={{ fontSize: 24 }}>{name}</h1>
        <span className="small muted">{className} · {periodLabel}</span>
      </div>
      <div className="box">
        <div className="rp-stats">
          <div className="rp-stat"><b>{a.pres}/{calcs.length}</b><span className="small muted">Katıldığı ders</span></div>
          <div className="rp-stat"><b>{a.d}</b><span className="small muted">Yazılı doğru</span></div>
          <div className="rp-stat"><b>{a.y} · {a.x} · {a.c}</b><span className="small muted">Yakın · yanlış · cevapsız</span></div>
          {oral && <div className="rp-stat" style={{ background: 'var(--neutral-bg)' }}><b>{a.s} söz</b><span className="small muted">{a.i} ilk denemede, {a.dz} düzeltince, {a.yp} yapamadı</span></div>}
          <div className="rp-stat"><b>{a.bb}</b><span className="small muted">Birebir destek</span></div>
          <div className="rp-stat"><b>{a.tn ? Math.round(a.t / a.tn) + ' sn' : '–'}</b><span className="small muted">Ortalama cevap süresi</span></div>
        </div>
      </div>
      <h2 className="rp-h">Konulara göre</h2>
      <KonuView calcs={calcs} oral={oral} sName={sName} onlyStudent={id} />
      <h2 className="rp-h">Birebir desteğe düştüğü sorular</h2>
      <div className="box">
        {!bbW.length && !bbO.length && <p className="muted" style={{ margin: 0 }}>Bu dönemde yok.</p>}
        {bbW.map(({ l, e }) => {
          const q = l.w[e.q]
          return (
            <div className="rp-qrow" key={l.info.id + ':w' + e.q}>
              <b>{q.text}</b> <span className="small muted">{fd(l.info.startedAt)} · {konuOf(q.topic)}</span>
              <div className="rp-att" style={{ marginTop: 4 }}>
                {e.att.map((t, i) => <span className="small" key={i}>{i + 1}. {t.text} <Chip k={t.r} /></span>)}
              </div>
            </div>
          )
        })}
        {bbO.map(({ l, e }, i) => {
          const q = l.o[e.q]
          return (
            <div className="rp-qrow" key={l.info.id + ':o' + e.q + ':' + i}>
              <b>{q.text}</b> <span className="rp-tag o">sözlü</span> <span className="small muted">{fd(l.info.startedAt)} · {konuOf(q.topic)}</span>
              <div className="small" style={{ marginTop: 4 }}>İki sözde de yapamadı.</div>
            </div>
          )
        })}
      </div>
      {calcs.length > 1 && (
        <>
          <h2 className="rp-h">Ders ders</h2>
          <div className="box rp-scroll">
            <table>
              <thead><tr>
                <th className="l">Ders</th><th>Yoklama</th><th>Doğru</th><th>Yakın</th><th>Yanlış</th><th>Cevapsız</th>
                {oral && <><th>Söz</th><th>İlk</th><th>Düzeltince</th><th>Yapamadı</th></>}
                <th>Birebir</th>
              </tr></thead>
              <tbody>
                {calcs.map(l => {
                  const b = aggStudents([l], [id])[id]
                  const here = l.present.has(id)
                  return (
                    <tr key={l.info.id}>
                      <td className="l"><b>{l.info.title}</b><br /><span className="small muted">{fd(l.info.startedAt)} · {lessonKindLabel(l, oral)}</span></td>
                      <td>{here ? <span className="rp-chip c-ok">Katıldı</span> : <span className="rp-chip c-wait">Katılmadı</span>}</td>
                      {!here ? <td className="zero" colSpan={oral ? 9 : 5}>–</td> : <>
                        <Num v={b.d} /><Num v={b.y} /><Num v={b.x} /><Num v={b.c} />
                        {oral && <><Num v={b.s} oral /><Num v={b.i} oral /><Num v={b.dz} oral /><Num v={b.yp} oral /></>}
                        <Num v={b.bb} />
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <details className="box" open={period === 'ders'}>
        <summary>Bütün yazılı cevapları</summary>
        <div style={{ marginTop: 8 }}>
          {myW.length ? myW.map(({ l, e }) => {
            const q = l.w[e.q]
            return (
              <div className="rp-qrow" key={l.info.id + ':w' + e.q}>
                <b>{q.text}</b> <span className="small muted">{fd(l.info.startedAt)}{q.expected ? ' · beklenen: ' + q.expected.split('//').map(s => s.trim()).filter(Boolean).join(' / ').replace(/'/g, '’') : ''}</span>
                <div className="rp-att" style={{ marginTop: 4 }}>
                  {e.att.length ? e.att.map((t, i) => (
                    <span className="small" key={i}>{i + 1}. {t.text} <Chip k={t.r} /> {t.sec != null && <span className="muted">{t.sec} sn</span>}</span>
                  )) : <Chip k="cevapsiz" />}
                </div>
              </div>
            )
          }) : <p className="muted">Kayıt yok.</p>}
        </div>
      </details>
    </div>
  )
}
