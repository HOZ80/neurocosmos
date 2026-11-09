import { useEffect, useRef, useState } from 'react'
import { sb, newId, tokensToText, splitAccepted, cleanBoard } from './liveShared'
import { nice } from './LiveBoard'
import { loadRoster } from './LiveTeacherPanel'
import type { PanelStudent, PlanItem } from './LiveTeacherPanel'

// ─── Söz sırası ───────────────────────────────────────────────────────────────
// İki kullanım, aynı sıra motoru ve aynı kayıt (live_oral_turns):
//  1) Canlı dersin içinde: panelde üçüncü sekme. Sırası gelen çocuğun telefonunda
//     "Söz sende!" kutusu çıkar (yalnızca o görür; sonuç ona gösterilmez).
//  2) Tek başına: sözlü Meet dersi ya da yüz yüze sınıf. Çocuklara hiçbir bildirim
//     gitmez, giriş yapmaları gerekmez; ders türü "oral" kaydedilir.
// Kayıt düzeni: bir çocuk sıraya geldiğinde sonuçsuz bir satır açılır (bildirimi bu
// sağlar); sonuç girilince satıra yazılır. "Sona al" ve geri alınan sözler iptal
// işaretiyle kapanır. Rapor yalnızca sonucu olan satırları sayar (rapora dokunulmadı).
// Görünüm onaylanan önizlemeden birebir alındı.

export type OralResult = 'first' | 'fix' | 'fail'
export interface OralQ { text: string; task: string; expected: string; topic: string }
interface Turn { id: string; q: number | null; second: boolean; rowId?: string }
interface Hist { id: string; q: number | null; second: boolean; r: OralResult; round: number }
export interface OralEngine {
  started: boolean
  roster: string[]
  queue: Turn[]
  cur: Turn | null
  hist: Hist[]
  qPtr: number
  support: { id: string; q: number | null }[]
  // Dersin tamamı (kapatıp açınca sıfırlanmaz): t söz, ok doğru; f/x/n ilk denemede / düzeltmeden sonra / yapamadı
  counts: Record<string, { t: number; ok: number; f?: number; x?: number; n?: number }>
  round: number
  gap: number
  useQ: boolean
  qs: OralQ[]
  undo: string[]
  last: string
  seq: number
}

export function makeEngine(): OralEngine {
  return { started: false, roster: [], queue: [], cur: null, hist: [], qPtr: 0, support: [], counts: {}, round: 1, gap: 3, useQ: true, qs: [], undo: [], last: '', seq: 0 }
}

const RES_DB: Record<OralResult, string> = { first: 'first_try', fix: 'after_fix', fail: 'failed' }

// ─── Kayıt (sıralı; bir işlem bitmeden sonraki başlamaz) ───
export interface OralSync {
  insert: (t: Turn, q: OralQ | null, seq: number) => void
  finish: (rowId: string | undefined, r: OralResult, oneOnOne: boolean) => void
  cancel: (rowId: string | undefined) => void
  reopen: (rowId: string | undefined) => void
}
export function makeSync(sessionId: string, demo: boolean, onError: (e: unknown) => void): OralSync {
  let chain: Promise<unknown> = Promise.resolve()
  function run(fn: () => PromiseLike<{ error: unknown }>) {
    if (demo) return
    chain = chain.then(async () => {
      const { error } = await fn()
      if (error) throw error
    }).catch(onError)
  }
  const tbl = () => sb.from('live_oral_turns')
  return {
    insert(t, q, seq) {
      if (!t.rowId) return
      run(() => tbl().insert({
        id: t.rowId, session_id: sessionId, student_id: t.id, question_id: null,
        prompt: q ? q.text : '', task: q ? q.task : '', topic: q ? q.topic : '', seq, is_second: t.second,
      }))
    },
    finish(rowId, r, oneOnOne) {
      if (!rowId) return
      run(() => tbl().update({ result: RES_DB[r], result_at: new Date().toISOString(), one_on_one: oneOnOne }).eq('id', rowId))
    },
    cancel(rowId) {
      if (!rowId) return
      run(() => tbl().update({ cancelled_at: new Date().toISOString() }).eq('id', rowId).is('result', null))
    },
    reopen(rowId) {
      if (!rowId) return
      run(() => tbl().update({ result: null, result_at: null, one_on_one: false, cancelled_at: null }).eq('id', rowId))
    },
  }
}

// ─── Sıra motoru (önizlemedekiyle aynı kurallar) ───
function shuffle<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
function snap(e: OralEngine) {
  e.undo.push(JSON.stringify({ queue: e.queue, cur: e.cur, hist: e.hist, qPtr: e.qPtr, support: e.support, counts: e.counts, round: e.round, last: e.last }))
  if (e.undo.length > 40) e.undo.shift()
}
function advance(e: OralEngine, sync: OralSync) {
  e.cur = e.queue.shift() || null
  if (!e.cur) return
  if (!e.cur.second && e.cur.q === null && e.useQ && e.qs.length) { e.cur.q = e.qPtr % e.qs.length; e.qPtr++ }
  e.cur.rowId = newId()
  e.seq++
  sync.insert(e.cur, e.useQ && e.cur.q !== null ? e.qs[e.cur.q] || null : null, e.seq)
}
export function oralStart(e: OralEngine, roster: string[], sync: OralSync) {
  Object.assign(e, { roster: roster.slice(), queue: shuffle(roster).map(id => ({ id, q: null, second: false })), started: true, round: 1, hist: [], qPtr: 0, undo: [], last: '' })
  advance(e, sync)
}
function record(e: OralEngine, r: OralResult, sync: OralSync, nm: (id: string) => string) {
  const c = e.cur
  if (!c) return
  snap(e)
  e.hist.push({ id: c.id, q: c.q, second: c.second, r, round: e.round })
  const k = e.counts[c.id] || (e.counts[c.id] = { t: 0, ok: 0 })
  k.t++; if (r !== 'fail') k.ok++
  if (r === 'first') k.f = (k.f || 0) + 1; else if (r === 'fix') k.x = (k.x || 0) + 1; else k.n = (k.n || 0) + 1
  let bb = false
  if (r === 'fail') {
    if (!c.second) {
      const back: Turn = { id: c.id, q: c.q, second: true }
      if (e.queue.length >= e.gap) { e.queue.splice(e.gap, 0, back); e.last = `${nm(c.id)} ${e.gap} kişi sonra aynı soruyla dönecek.` }
      else { e.queue.push(back); e.last = `Geride ${e.gap} kişiden az kaldı; ${nm(c.id)} tur sonunda aynı soruyla dönecek.` }
    } else {
      bb = true
      e.support.push({ id: c.id, q: c.q })
      e.last = `${nm(c.id)} bu soruyu ikinci kez de yapamadı: “birebir destek” işareti aldı ve bu soru için sıraya bir daha girmeyecek.`
    }
  } else {
    e.last = r === 'first' ? `${nm(c.id)}: ilk denemede doğru.` : `${nm(c.id)}: düzeltmeden sonra doğru.`
  }
  sync.finish(c.rowId, r, bb)
  advance(e, sync)
}
function skip(e: OralEngine, sync: OralSync, nm: (id: string) => string) {
  const c = e.cur
  if (!c) return
  snap(e)
  sync.cancel(c.rowId)
  e.queue.push({ id: c.id, q: c.q, second: c.second })
  e.last = `${nm(c.id)} sıranın sonuna alındı; söz sayılmadı.`
  advance(e, sync)
}
function undo(e: OralEngine, sync: OralSync) {
  const s = e.undo.pop()
  if (!s) return
  if (e.cur) sync.cancel(e.cur.rowId)
  Object.assign(e, JSON.parse(s))
  if (e.cur) sync.reopen(e.cur.rowId)
  e.last = 'Son işlem geri alındı.'
}
function newRound(e: OralEngine, roster: string[], sync: OralSync) {
  snap(e)
  e.round++
  e.roster = roster.slice()
  e.queue = shuffle(e.roster).map(id => ({ id, q: null, second: false }))
  e.last = ''
  advance(e, sync)
}
export function oralClose(e: OralEngine, sync: OralSync) {
  if (e.cur) sync.cancel(e.cur.rowId)
  Object.assign(e, { started: false, queue: [], cur: null, hist: [], undo: [], last: '' })
}

// Bu cihazda sırayı hatırla: sayfa yenilense de kalınan yerden devam edilir.
const STORE_KEY = (sid: string) => 'nc_oral_' + sid
export function loadEngine(sid: string): OralEngine | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY(sid)) || 'null')
    return v && Array.isArray(v.queue) ? { ...makeEngine(), ...v } : null
  } catch { return null }
}
export function saveEngine(sid: string, e: OralEngine) { try { localStorage.setItem(STORE_KEY(sid), JSON.stringify(e)) } catch {} }
export function dropEngine(sid: string) { try { localStorage.removeItem(STORE_KEY(sid)) } catch {} }

export function planToQs(items: PlanItem[]): OralQ[] {
  return items.map(it => ({ text: tokensToText(it.board), task: it.task || '', expected: it.expected || '', topic: it.topic || '' }))
}

// ─── Stiller (önizlemedeki yeni parçalar) ───
export const ORAL_CSS = `
.lv .card{position:relative}
.lv .oz-cardcorner{position:absolute;top:-8px;right:8px;line-height:1;z-index:1}
.lv .oz-cardcorner .corner{box-shadow:0 0 0 2px var(--bg);display:inline-block}
.lv .corner{font-size:11px;font-weight:700;color:var(--brand);background:var(--brand-soft);border-radius:999px;padding:1px 7px;white-space:nowrap}
.lv .oz-now{background:var(--surface);border:2px solid var(--brand);border-radius:16px;padding:16px 18px;margin-bottom:12px}
.lv .oz-label{font:700 13px Quicksand,'Outfit',sans-serif;color:var(--brand);margin:0}
.lv .oz-name{font:700 clamp(28px,4vw,38px)/1.15 Quicksand,'Outfit',sans-serif;margin:2px 0 6px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.lv .oz-second{font:700 13px system-ui,sans-serif;color:var(--near);background:var(--near-bg);border-radius:999px;padding:2px 10px}
.lv .oz-q{background:var(--surface2);border-radius:12px;padding:12px 14px;margin:10px 0 12px}
.lv .oz-q .s{font:700 21px/1.4 Quicksand,'Outfit',sans-serif;margin:0}
.lv .oz-q .g{margin:2px 0 0;color:var(--muted);font-weight:600}
.lv .oz-q .e{margin:8px 0 0;font-size:13px;color:var(--muted);border-top:1px dashed var(--line);padding-top:6px}
.lv .oz-q .e b{color:var(--ink)}
.lv .oz-res{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:560px){.lv .oz-res{grid-template-columns:1fr}}
.lv .rb{border-radius:12px;padding:12px 10px;font:700 16px/1.25 Quicksand,'Outfit',sans-serif;cursor:pointer;border:2px solid}
.lv .rb.first{background:var(--ok);border-color:var(--ok);color:#fff}
.lv .rb.fix{background:var(--ok-bg);border-color:var(--ok);color:var(--ok)}
.lv .rb.fail{background:var(--surface);border-color:var(--bad);color:var(--bad)}
.lv .rb small{display:block;font:600 12px system-ui,sans-serif;opacity:.85;margin-top:2px}
.lv .oz-sub{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.lv .oz-last{margin:10px 0 0;font-size:14px;padding:8px 10px;border-radius:10px;background:var(--brand-soft)}
.lv .oz-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.lv .oz-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface2);font-size:14px}
.lv .oz-row:last-child{border-bottom:0}
.lv .oz-row .n{font:700 13px Quicksand,'Outfit',sans-serif;color:var(--muted);min-width:20px}
.lv .oz-row .nm{font-weight:700;flex:1}
.lv .ret{font-size:12px;font-weight:700;color:var(--near)}
.lv .rc{font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap}
.lv .rc.first{color:var(--ok);background:var(--ok-bg)}.lv .rc.fix{color:var(--ok);background:#F0F8F3;border:1px solid var(--ok-bg)}.lv .rc.fail{color:var(--bad);background:var(--bad-bg)}
.lv .pas{color:var(--muted)}
.lv .done{text-align:center;padding:24px 16px}
.lv .done h2{font-size:24px;margin-bottom:6px}
.lv .stepper{display:inline-flex;align-items:center;gap:6px}
.lv .stepper b{min-width:22px;text-align:center;font-size:16px}
.lv .setrow{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:10px 0}
.lv .setrow .lab{font-weight:700;min-width:120px}
.lv .seg.wrap{flex-wrap:wrap}
.lv .roll{display:flex;flex-wrap:wrap;gap:6px}
.lv .roll button{border:1px solid var(--line);background:var(--ok-bg);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:700}
.lv .roll button.absent{background:var(--surface);color:var(--muted);text-decoration:line-through}
.lv table.sum{width:100%;border-collapse:collapse;font-size:14px}
.lv table.sum th,.lv table.sum td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--surface2)}
.lv table.sum th{font-size:12px;color:var(--muted)}
.lv .tblwrap{overflow-x:auto}
.lv .proj{position:fixed;inset:0;z-index:80;background:#2E1A6B;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px));cursor:pointer}
.lv .proj .l{font:600 clamp(18px,3vw,28px) Quicksand,'Outfit',sans-serif;opacity:.8;margin:0}
.lv .proj .pnm{font:700 clamp(56px,12vw,150px)/1.05 Quicksand,'Outfit',sans-serif;margin:8px 0 18px}
.lv .proj .h{font-size:14px;opacity:.6;margin:0}
`

// Kart köşesindeki sayaç (Ders sekmesinde de kullanılır).
export function OralCounter({ e, id }: { e: OralEngine; id: string }) {
  const k = e.counts[id]
  return <span className="corner">{k ? `söz ${k.t} · doğru ${k.ok}` : 'söz 0'}</span>
}

const RC: Record<OralResult, [string, string]> = { first: ['first', 'İlk denemede doğru'], fix: ['fix', 'Düzeltmeden sonra doğru'], fail: ['fail', 'Yapamadı'] }

function QBlock({ e }: { e: OralEngine }) {
  const c = e.cur!
  if (!e.useQ || c.q === null || !e.qs[c.q]) {
    return <div className="oz-q"><p className="s">Soruyu sen söylüyorsun.</p>{c.second && <p className="g">Daha önce sorduğun soruyu tekrar sor.</p>}</div>
  }
  const q = e.qs[c.q]
  const exp = splitAccepted(q.expected)
  return (
    <div className="oz-q">
      <p className="s">{nice(q.text)}</p>
      {q.task && <p className="g">{nice(q.task)}</p>}
      <p className="e">{exp.length ? <>Beklenen cevap (yalnızca sen görüyorsun): <b>{nice(exp.join(' / '))}</b></> : 'Açık uçlu soru: kararı sen veriyorsun.'}</p>
    </div>
  )
}

function GapRow({ e, onGap }: { e: OralEngine; onGap: (d: number) => void }) {
  return (
    <div className="setrow"><span className="lab">Yapamayan kaç kişi sonra dönsün</span>
      <span className="stepper">
        <button className="btn sm" type="button" onClick={() => onGap(-1)} disabled={e.gap <= 1} aria-label="Azalt">−</button>
        <b>{e.gap}</b>
        <button className="btn sm" type="button" onClick={() => onGap(1)} disabled={e.gap >= 6} aria-label="Artır">+</button>
      </span>
      <span className="muted small">Geride bu kadar kişi kalmadıysa tur sonunda döner.</span>
    </div>
  )
}

function Lists({ e, nm }: { e: OralEngine; nm: (id: string) => string }) {
  const spoke = e.hist.filter(h => h.round === e.round).slice().reverse()
  return (
    <div className="oz-cols">
      <div className="box"><h3>Sırada bekleyenler ({e.queue.length})</h3>
        {e.queue.length ? e.queue.map((it, i) => (
          <div key={i} className="oz-row"><span className="n">{i + 1}</span><span className="nm">{nm(it.id)}</span>{it.second && <span className="ret">↩ aynı soruyla</span>}</div>
        )) : <p className="muted small" style={{ margin: 0 }}>Sırada kimse kalmadı.</p>}
        <p className="muted small" style={{ margin: '8px 0 0' }}>Bu listeyi yalnızca sen görüyorsun; çocuklar sırayı görmez.</p>
      </div>
      <div className="box"><h3>Bu turda söz aldı</h3>
        {spoke.length ? spoke.map((h, i) => (
          <div key={i} className="oz-row pas"><span className="nm">{nm(h.id)}</span>{h.second && <span className="ret">ikinci söz</span>}<span className={'rc ' + RC[h.r][0]}>{RC[h.r][1]}</span></div>
        )) : <p className="muted small" style={{ margin: 0 }}>Henüz kimse söz almadı.</p>}
      </div>
      {e.support.length > 0 && (
        <div className="box"><h3>Birebir destek gerekenler</h3>
          {e.support.map((s, i) => (
            <div key={i}>
              <div className="oz-row"><span className="nm">{nm(s.id)}</span><span className="tag destek">Birebir destek</span></div>
              <p className="muted small" style={{ margin: '0 0 6px' }}>{s.q !== null && e.useQ && e.qs[s.q] ? nice(e.qs[s.q].text) : 'Sözlü soru'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Çalışma ekranı (iki kullanımda da aynı).
function RunView({ e, nm, onAct, endBtn, subBtns }: {
  e: OralEngine
  nm: (id: string) => string
  onAct: (act: 'res' | 'skip' | 'undo' | 'round', v?: OralResult) => void
  endBtn: React.ReactNode
  subBtns?: React.ReactNode
}) {
  if (!e.cur) {
    const sup = e.support.length
    return (
      <>
        <div className="box done"><h2>Tur bitti</h2>
          <p className="muted">Katılan herkes bu turda söz aldı.{sup ? ` ${sup} soruda birebir destek işareti var.` : ''}</p>
          <div className="oz-sub" style={{ justifyContent: 'center' }}>
            <button className="btn primary big" type="button" onClick={() => onAct('round')}>Yeni tur başlat</button>
            {endBtn}
            <button className="btn sm" type="button" onClick={() => onAct('undo')} disabled={!e.undo.length}>Son işlemi geri al</button>
          </div>
        </div>
        <Lists e={e} nm={nm} />
      </>
    )
  }
  const c = e.cur
  return (
    <>
      <section className="oz-now" aria-live="polite">
        <p className="oz-label">Sıradaki · {e.round}. tur</p>
        <div className="oz-name">{nm(c.id)} <OralCounter e={e} id={c.id} /> {c.second && <span className="oz-second">İkinci söz · aynı soru</span>}</div>
        <QBlock e={e} />
        <div className="oz-res">
          <button className="rb first" type="button" onClick={() => onAct('res', 'first')}>İlk denemede doğru</button>
          <button className="rb fix" type="button" onClick={() => onAct('res', 'fix')}>Düzeltmeden sonra doğru</button>
          <button className="rb fail" type="button" onClick={() => onAct('res', 'fail')}>Yapamadı<small>{c.second ? 'birebir destek işareti alır' : `${e.gap} kişi sonra aynı soruyla döner`}</small></button>
        </div>
        <div className="oz-sub">
          <button className="btn sm" type="button" onClick={() => onAct('skip')}>Şimdi değil, sona al</button>
          <button className="btn sm" type="button" onClick={() => onAct('undo')} disabled={!e.undo.length}>Son işlemi geri al</button>
          {subBtns}
        </div>
        {e.last && <p className="oz-last">{e.last}</p>}
      </section>
      <Lists e={e} nm={nm} />
    </>
  )
}

// ─── 1) Canlı dersin içinde: panelin "Söz sırası" sekmesi ───
// Motor panelde tutulur (Ders sekmesindeki kart sayaçları da onu okur).
export function OralTab({ e, sync, nm, present, planQs, onChange, onFirstStart }: {
  e: OralEngine
  sync: OralSync
  nm: (id: string) => string
  present: string[]            // yoklamadan: derse katılanlar
  planQs: OralQ[]
  onChange: () => void
  onFirstStart?: () => void    // gerçek derste ders türünü "yazılı + sözlü" yapmak için
}) {
  const hasQs = planQs.length > 0
  if (!e.started) {
    const useQ = hasQs && e.useQ
    return (
      <div className="box"><h3>Söz sırasını başlat</h3>
        <p className="muted small" style={{ margin: '0 0 6px' }}>Katılanlar yoklamadan gelir: {present.length} öğrenci. Sıra rastgele kurulur.</p>
        <div className="setrow"><span className="lab">Sorular</span>
          <span className="seg wrap">
            <button type="button" aria-pressed={useQ} disabled={!hasQs} onClick={() => { e.useQ = true; onChange() }}>Hazırlanan sorulardan sırayla</button>
            <button type="button" aria-pressed={!useQ} onClick={() => { e.useQ = false; onChange() }}>Sorusuz (soruyu ben söylerim)</button>
          </span>
        </div>
        {!hasQs && <p className="hint" style={{ marginTop: -4 }}>Bu derste hazırlanan soru yok; soruyu sen söylersin.</p>}
        <GapRow e={e} onGap={d => { e.gap = Math.min(6, Math.max(1, e.gap + d)); onChange() }} />
        <button className="btn primary big" type="button" disabled={!present.length} onClick={() => {
          e.useQ = useQ
          e.qs = useQ ? planQs : []
          oralStart(e, present, sync)
          onFirstStart?.()
          onChange()
        }}>Söz sırasını başlat</button>
        {!present.length && <p className="hint">Henüz derse katılan öğrenci yok.</p>}
      </div>
    )
  }
  const closeBtn = (big: boolean) => <button className={'btn' + (big ? ' big' : ' sm')} type="button" onClick={() => { oralClose(e, sync); onChange() }}>Söz sırasını kapat</button>
  return (
    <RunView e={e} nm={nm} endBtn={closeBtn(true)} subBtns={closeBtn(false)}
      onAct={(act, v) => {
        if (act === 'res' && v) record(e, v, sync, nm)
        else if (act === 'skip') skip(e, sync, nm)
        else if (act === 'undo') undo(e, sync)
        else if (act === 'round') newRound(e, present, sync) // geç katılanlar yeni tura girer
        onChange()
      }} />
  )
}

// ─── 2) Tek başına (sözlü Meet dersi, yüz yüze sınıf) ───
interface ClassRow { id: string; name: string; is_default: boolean }
interface PlanRow { id: string; title: string }

export function OralAlone({ resumeId, onExit, onStarted, onOpenReport }: {
  resumeId?: string
  onExit: () => void
  onStarted: (sessionId: string) => void   // sayfa yenilenince geri dönebilmek için
  onOpenReport: (sessionId: string, classId: string) => void
}) {
  const [stage, setStage] = useState<'setup' | 'run' | 'summary' | 'loading'>(resumeId ? 'loading' : 'setup')
  const [classes, setClasses] = useState<ClassRow[] | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [cls, setCls] = useState('')
  const [roster, setRoster] = useState<PanelStudent[]>([])
  const [absent, setAbsent] = useState<Record<string, boolean>>({})
  const [plan, setPlan] = useState<string>('none')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [proj, setProj] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const sid = useRef<string>(resumeId || '')
  const eng = useRef<OralEngine>(makeEngine())
  const sync = useRef<OralSync | null>(null)
  const names = useRef<Map<string, string>>(new Map())
  const klass = useRef<{ id: string; name: string }>({ id: '', name: '' })
  const absentNames = useRef<string[]>([])
  const toastTimer = useRef<number | undefined>(undefined)
  const e = eng.current
  const nm = (id: string) => names.current.get(id) || 'Öğrenci'
  function say(m: string) { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2800) }
  function fail(x: unknown) { console.error('[soz-sirasi]', x); say('Kaydedilemedi. İnternet bağlantını kontrol et.') }
  function changed() { if (sid.current) saveEngine(sid.current, e); setTick(t => t + 1) }

  // Kurulum: sınıflar ve hazırlanan dersler
  useEffect(() => {
    if (resumeId) return
    let alive = true
    Promise.all([
      sb.from('live_classes').select('id,name,is_default').order('created_at'),
      sb.from('live_plans').select('id,title').order('updated_at', { ascending: false }),
    ]).then(([c, p]) => {
      if (!alive) return
      if (c.error || p.error) { setErr('Bilgiler okunamadı. İnternet bağlantını kontrol et.'); return }
      const list = (c.data || []) as ClassRow[]
      setClasses(list)
      setPlans((p.data || []) as PlanRow[])
      const def = list.find(x => x.is_default) || list[0]
      if (def) setCls(def.id)
    })
    return () => { alive = false }
  }, [resumeId])

  useEffect(() => {
    if (!cls || resumeId) return
    let alive = true
    setAbsent({})
    loadRoster(cls).then(r => { if (alive) setRoster(r) }).catch(() => { if (alive) setErr('Sınıfın öğrencileri okunamadı.') })
    return () => { alive = false }
  }, [cls, resumeId])

  // Sayfa yenilenince açık söz sırasına geri dön.
  useEffect(() => {
    if (!resumeId) return
    let alive = true
    ;(async () => {
      try {
        const s = await sb.from('live_sessions').select('id,class_id,status,live_classes(id,name)').eq('id', resumeId).single()
        if (s.error || !s.data) throw s.error || new Error('yok')
        if (s.data.status !== 'active') { dropEngine(resumeId); onExit(); return }
        const c: any = Array.isArray((s.data as any).live_classes) ? (s.data as any).live_classes[0] : (s.data as any).live_classes
        klass.current = { id: c.id, name: c.name }
        const r = await loadRoster(c.id)
        r.forEach(x => names.current.set(x.id, x.name))
        const attIds = new Set((((await sb.from('live_attendance').select('student_id').eq('session_id', resumeId)).data) || []).map((a: any) => a.student_id as string))
        absentNames.current = r.filter(x => !attIds.has(x.id)).map(x => x.name)
        sync.current = makeSync(resumeId, false, fail)
        const saved = loadEngine(resumeId)
        if (saved && saved.started) {
          eng.current = saved
        } else {
          // Başka cihazda başlatılmış: katılanlar yoklamadan, sayılar kayıtlardan; yeni turla devam.
          const [att, turns] = await Promise.all([
            sb.from('live_attendance').select('student_id').eq('session_id', resumeId),
            sb.from('live_oral_turns').select('student_id,result,one_on_one').eq('session_id', resumeId),
          ])
          const ne = makeEngine()
          for (const t of (turns.data || []) as any[]) {
            if (!t.result) continue
            const k = ne.counts[t.student_id] || (ne.counts[t.student_id] = { t: 0, ok: 0 })
            k.t++; if (t.result !== 'failed') k.ok++
            if (t.result === 'first_try') k.f = (k.f || 0) + 1; else if (t.result === 'after_fix') k.x = (k.x || 0) + 1; else k.n = (k.n || 0) + 1
            if (t.one_on_one) ne.support.push({ id: t.student_id, q: null })
          }
          ne.useQ = false
          oralStart(ne, ((att.data || []) as any[]).map(a => a.student_id), sync.current)
          eng.current = ne
          saveEngine(resumeId, ne)
        }
        if (alive) setStage('run')
      } catch (x) {
        console.error(x)
        if (alive) { setErr('Söz sırası açılamadı. İnternet bağlantını kontrol et.'); setStage('setup') }
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId])

  useEffect(() => {
    if (!proj) return
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setProj(false) }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [proj])

  async function start() {
    const present = roster.filter(s => !absent[s.id])
    if (!present.length || !cls) return
    setBusy(true); setErr(null)
    try {
      let qs: OralQ[] = []
      if (plan !== 'none') {
        const { data, error } = await sb.from('live_plan_items').select('id,seq,board,task,expected,topic,teacher_note').eq('plan_id', plan).order('seq')
        if (error) throw error
        qs = planToQs((data || []).map((r: any) => ({ ...r, board: cleanBoard(r.board) })) as PlanItem[])
      }
      const id = newId()
      const ins = await sb.from('live_sessions').insert({ id, class_id: cls, plan_id: plan === 'none' ? null : plan, kind: 'oral' })
      if (ins.error) {
        setErr(/duplicate|unique/i.test(ins.error.message || '') ? 'Bu sınıfın açık bir dersi var. Söz sırasını o dersin içinden kullan ya da önce o dersi bitir.' : 'Başlatılamadı. İnternet bağlantını kontrol et.')
        return
      }
      // Yoklama: gelenler derste sayılır (raporun katılım sütunu için).
      const att = await sb.from('live_attendance').insert(present.map(s => ({ session_id: id, student_id: s.id })))
      if (att.error) console.error('[soz-sirasi] yoklama', att.error)
      sid.current = id
      klass.current = { id: cls, name: classes?.find(c => c.id === cls)?.name || 'Sınıf' }
      roster.forEach(s => names.current.set(s.id, s.name))
      absentNames.current = roster.filter(s => absent[s.id]).map(s => s.name)
      sync.current = makeSync(id, false, fail)
      const ne = makeEngine()
      ne.gap = e.gap
      ne.useQ = qs.length > 0
      ne.qs = qs
      oralStart(ne, present.map(s => s.id), sync.current)
      eng.current = ne
      saveEngine(id, ne)
      onStarted(id)
      setStage('run')
    } catch (x) {
      console.error(x); setErr('Başlatılamadı. İnternet bağlantını kontrol et.')
    } finally { setBusy(false) }
  }

  async function finish() {
    setProj(false)
    if (sync.current) oralClose(e, sync.current) // açık kalan sözü kapatır; sayılar özet için durur
    const r = await sb.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sid.current)
    if (r.error) { fail(r.error); return }
    dropEngine(sid.current)
    setStage('summary')
  }

  const wrap = (inner: React.ReactNode) => (
    <div className="panel" style={{ maxWidth: 980 }}>
      <style>{ORAL_CSS}</style>
      {inner}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )

  if (stage === 'loading') return wrap(<p className="muted">Söz sırası yükleniyor…</p>)

  if (stage === 'setup') {
    const present = roster.filter(s => !absent[s.id])
    return wrap(<>
      <div className="top"><button className="btn sm" type="button" onClick={onExit}>← Geri</button><h1 style={{ fontSize: 22 }}>Söz sırası</h1></div>
      {err && <p className="err">{err}</p>}
      <div className="box">
        <div className="setrow"><span className="lab">Sınıf</span>
          <span className="seg wrap">{(classes || []).map(c => <button key={c.id} type="button" aria-pressed={cls === c.id} onClick={() => setCls(c.id)}>{c.name}</button>)}</span>
        </div>
        <div className="setrow" style={{ alignItems: 'flex-start' }}><span className="lab">Yoklama</span>
          <div>
            <div className="roll">{roster.map(s => (
              <button key={s.id} type="button" className={absent[s.id] ? 'absent' : ''} aria-pressed={!absent[s.id]}
                onClick={() => setAbsent(a => ({ ...a, [s.id]: !a[s.id] }))}>{s.name}</button>
            ))}</div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{roster.length ? `Herkes geldi sayılır; gelmeyene bir kez dokun. ${present.length} kişi katılıyor.` : 'Bu sınıfta öğrenci yok.'}</p>
          </div>
        </div>
        <div className="setrow"><span className="lab">Sorular</span>
          <span className="seg wrap">
            {plans.map(p => <button key={p.id} type="button" aria-pressed={plan === p.id} onClick={() => setPlan(p.id)}>{p.title}</button>)}
            <button type="button" aria-pressed={plan === 'none'} onClick={() => setPlan('none')}>Sorusuz</button>
          </span>
        </div>
        <GapRow e={e} onGap={d => { e.gap = Math.min(6, Math.max(1, e.gap + d)); setTick(t => t + 1) }} />
        <button className="btn primary big" type="button" disabled={busy || !present.length} onClick={start}>{busy ? 'Başlatılıyor…' : 'Başlat'}</button>
      </div>
    </>)
  }

  if (stage === 'summary') {
    const ids = e.roster.slice().sort((a, b) => nm(a).localeCompare(nm(b), 'tr'))
    const total = Object.values(e.counts).reduce((n, k) => n + k.t, 0)
    return wrap(<>
      <div className="top"><h1 style={{ fontSize: 22 }}>Söz sırası bitti</h1></div>
      <div className="box">
        <p className="muted" style={{ margin: '0 0 10px' }}>{total} söz alındı. Bu sonuçlar raporun Sözlü bölümüne yazıldı; ders türü “sözlü” olarak kaydedildi.</p>
        <div className="tblwrap"><table className="sum">
          <thead><tr><th>Öğrenci</th><th>Söz</th><th>İlk denemede doğru</th><th>Düzeltmeden sonra doğru</th><th>Yapamadı</th><th>Birebir destek</th></tr></thead>
          <tbody>{ids.map(id => {
            const k = e.counts[id] || { t: 0, ok: 0 }
            const sp = e.support.filter(s => s.id === id).length
            return <tr key={id}><td><b>{nm(id)}</b></td><td>{k.t}</td><td>{k.f || 0}</td><td>{k.x || 0}</td><td>{k.n || 0}</td><td>{sp ? <span className="tag destek">{sp} soru</span> : '—'}</td></tr>
          })}</tbody>
        </table></div>
        <div className="oz-sub">
          <button className="btn primary" type="button" onClick={() => onOpenReport(sid.current, klass.current.id)}>Bu dersin raporunu aç</button>
          <button className="btn" type="button" onClick={onExit}>Canlı Ders ana ekranına dön</button>
        </div>
      </div>
    </>)
  }

  // Çalışma
  const endBtn = (big: boolean) => <button className={'btn danger' + (big ? ' big' : ' sm')} type="button" onClick={finish}>Söz sırasını bitir</button>
  return wrap(<>
    <div className="top">
      <span className="live">{klass.current.name} · sözlü</span>
      <span className="grow" />
      <button className="btn sm" type="button" onClick={() => setProj(true)}>Yansıtma görünümü</button>
      {endBtn(false)}
      <span className="att">Yoklama: {e.roster.length} kişi katıldı{absentNames.current.length ? `, gelmeyen: ${absentNames.current.join(', ')}${/\.$/.test(absentNames.current[absentNames.current.length - 1]) ? '' : '.'}` : '.'}</span>
    </div>
    <RunView e={e} nm={nm} endBtn={endBtn(true)}
      onAct={(act, v) => {
        const s = sync.current
        if (!s) return
        if (act === 'res' && v) record(e, v, s, nm)
        else if (act === 'skip') skip(e, s, nm)
        else if (act === 'undo') undo(e, s)
        else if (act === 'round') newRound(e, e.roster, s)
        changed()
      }} />
    {proj && (
      <div className="proj" role="dialog" aria-label="Yansıtma görünümü" onClick={() => setProj(false)}>
        {e.cur
          ? <><p className="l">Sıradaki</p><p className="pnm">{nm(e.cur.id)}</p></>
          : <p className="pnm" style={{ fontSize: 'clamp(40px,8vw,90px)' }}>Tur bitti</p>}
        <p className="h">Kapatmak için dokun. Sınıfa yansıtınca yalnızca bu görünür.</p>
      </div>
    )}
  </>)
}
