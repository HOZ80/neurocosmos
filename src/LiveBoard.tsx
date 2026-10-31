import { useRef, useState } from 'react'
import type { BoardToken, Pen } from './liveShared'
import { ROLES, applyPen, penIsOn } from './liveShared'

// ─── Canlı Ders görünüm stilleri ──────────────────────────────────────────────
// Kabul edilen önizlemedeki tasarım. Bütün sınıf adları "lv-" ile başlar,
// sitenin geri kalanına karışmaz. Renkler geçici; tam kodlar gelince
// yalnızca buradaki değişkenler değişir.
export const LIVE_CSS = `
.lv{--bg:#F3F1FA;--surface:#FFFFFF;--surface2:#ECE8F7;--ink:#1B1F4B;--muted:#5B6086;--line:#DCD6EE;
  --brand:#6A3BD1;--brand-soft:#ECE4FC;
  --ok:#1D7F54;--ok-bg:#E2F3EA;--near:#A0640A;--near-bg:#FBEFD6;--bad:#C2372E;--bad-bg:#FBE3E0;
  --wait:#7D829E;--wait-bg:#EFEFF5;--neutral:#6A3BD1;--neutral-bg:#EEE7FC;
  --r-ozne:#2257C4;--r-fiil:#AE1F79;--r-nesne:#BF540A;--r-zaman:#0B7473;--r-baglac:#5E2A6B;--r-kiremit:#A33E26;
  --hl:#FFE95C;
  background:var(--bg);color:var(--ink);min-height:100vh;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
.lv *,.lv *::before,.lv *::after{box-sizing:border-box}
.lv h1,.lv h2,.lv h3{font-family:Quicksand,'Outfit',system-ui,sans-serif;margin:0}
.lv .q{font-family:Quicksand,'Outfit',system-ui,sans-serif}
.lv .muted{color:var(--muted)}
.lv .small{font-size:13px}
.lv button{font:inherit}
.lv :focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.lv .grow{flex:1}
.lv .btn{font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;padding:7px 12px;cursor:pointer;line-height:1.2}
.lv .btn:hover:not(:disabled){border-color:var(--brand)}
.lv .btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.lv .btn.danger{color:#B4321F}
.lv .btn:disabled{opacity:.45;cursor:not-allowed}
.lv .btn.sm{padding:5px 9px;font-size:13px}
.lv .btn.big{padding:12px 18px;font-size:16px;border-radius:10px}
.lv .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.lv .seg button{border:0;background:transparent;padding:6px 11px;cursor:pointer;color:var(--ink);font-weight:600}
.lv .seg button+button{border-left:1px solid var(--line)}
.lv .seg button[aria-pressed="true"]{background:var(--brand);color:#fff}
.lv .seg button:disabled{opacity:.45;cursor:not-allowed}
.lv .chk{display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.lv .panel{padding:16px 18px 40px;max-width:980px;margin:0 auto}
.lv .top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:10px}
.lv .brand{font:700 19px Quicksand,'Outfit',sans-serif;color:var(--brand);letter-spacing:.2px}
.lv .brand i{font-style:normal;font-weight:500}
.lv .live{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.lv .live::before{content:"";width:9px;height:9px;border-radius:50%;background:#E0457B}
.lv .demo-tag{font-size:12px;font-weight:700;color:var(--neutral);background:var(--neutral-bg);border-radius:999px;padding:2px 9px}
.lv .att{font-size:13px;color:var(--muted);flex-basis:100%}
.lv .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:12px}
.lv .tabs button{border:0;background:none;padding:8px 12px;font:700 15px Quicksand,'Outfit',sans-serif;color:var(--muted);border-bottom:3px solid transparent;cursor:pointer;margin-bottom:-1px}
.lv .tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--brand)}
.lv .qstrip{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px}
.lv .closedtag{font-size:13px;font-weight:600;color:var(--muted)}
.lv .board{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 20px 14px}
.lv .sentence{font:700 clamp(24px,2.5vw,34px)/1.8 Quicksand,'Outfit',sans-serif;margin:0 0 4px;overflow-wrap:anywhere}
.lv .task{font:600 16px/1.4 Quicksand,'Outfit',sans-serif;color:var(--muted);margin:0}
.lv .expected{margin:10px 0 0;font-size:13px;color:var(--muted);border-top:1px dashed var(--line);padding-top:8px}
.lv .expected b{color:var(--ink)}
.lv .tk{border-radius:5px;padding:0 2px}
.lv .tk.b{font-weight:800}
.lv .tk.i{font-style:italic}
.lv .tk.h{background:var(--hl)}
.lv .w{text-decoration-line:underline;text-decoration-thickness:3px;text-underline-offset:7px;text-decoration-skip-ink:none}
.lv .r-ozne{color:var(--r-ozne);text-decoration-style:solid}
.lv .r-fiil{color:var(--r-fiil);text-decoration-style:double}
.lv .r-nesne{color:var(--r-nesne);text-decoration-style:dotted}
.lv .r-zaman{color:var(--r-zaman);text-decoration-style:wavy;text-decoration-thickness:2px}
.lv .r-baglac{color:var(--r-baglac);text-decoration-style:dashed}
.lv .r-kiremit{color:var(--r-kiremit)}
.lv .legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:10px;font-size:13px;color:var(--muted)}
.lv .legend .w{font:700 14px Quicksand,'Outfit',sans-serif;text-underline-offset:4px;text-decoration-thickness:2px}
.lv .summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:14px 0 8px;font-size:15px}
.lv .summary .lead{font-weight:700;margin-right:2px}
.lv .fchip{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:3px 11px;font-size:14px;cursor:pointer}
.lv .fchip b{font-weight:800}
.lv .fchip.k-dogru b{color:var(--ok)}.lv .fchip.k-yakin b{color:var(--near)}.lv .fchip.k-yanlis b{color:var(--bad)}
.lv .fchip.k-bos b{color:var(--wait)}.lv .fchip.k-notr b,.lv .fchip.k-destek b{color:var(--neutral)}
.lv .fchip[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.lv .tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center}
.lv .bulk{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px}
.lv .bulk h3{font-size:15px;margin-bottom:8px}
.lv .row{display:flex;gap:8px;margin-top:8px;align-items:center}
.lv .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.lv .card{--c:var(--wait);--cbg:var(--wait-bg);text-align:left;color:inherit;background:var(--surface);border:1px solid var(--line);border-left:6px solid var(--c);border-radius:10px;padding:8px 10px;cursor:pointer;display:flex;flex-direction:column;gap:4px;min-height:108px}
.lv .card:hover{border-color:var(--brand);border-left-color:var(--c)}
.lv .st-dogru{--c:var(--ok);--cbg:var(--ok-bg)}
.lv .st-yakin{--c:var(--near);--cbg:var(--near-bg)}
.lv .st-yanlis{--c:var(--bad);--cbg:var(--bad-bg)}
.lv .st-bekliyor,.lv .st-cevapsiz{--c:var(--wait);--cbg:var(--wait-bg)}
.lv .st-notr{--c:var(--neutral);--cbg:var(--neutral-bg)}
.lv .card.st-bekliyor{border-left-style:dashed}
.lv .card.st-yok{opacity:.55;cursor:default;border-left-color:var(--line)}
.lv .c-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
.lv .c-name{font:700 15px Quicksand,'Outfit',sans-serif}
.lv .c-tags{display:flex;flex-wrap:wrap;gap:4px}
.lv .chip{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;color:var(--c);background:var(--cbg)}
.lv .tag{display:inline-block;font-size:12px;font-weight:700;padding:0 7px;border-radius:999px}
.lv .tag.destek{color:var(--neutral);border:1px dashed var(--neutral)}
.lv .tag.onay{color:var(--ok);border:1px solid var(--ok)}
.lv .c-ans{margin:0;font-size:14px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.lv .c-meta{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:auto}
.lv .conn{font-size:12px;display:inline-flex;align-items:center;gap:4px;color:var(--muted)}
.lv .conn i{width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block}
.lv .conn.off{color:var(--bad);font-weight:700}
.lv .conn.off i{background:transparent;border:2px solid var(--bad)}
.lv .empty{grid-column:1/-1;padding:20px;text-align:center;color:var(--muted);background:var(--surface);border:1px dashed var(--line);border-radius:10px}
.lv .scrim{position:fixed;inset:0;background:rgba(10,12,40,.4);z-index:50}
.lv .drawer{position:fixed;top:0;right:0;bottom:0;width:min(430px,100%);background:var(--surface);z-index:51;padding:calc(16px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));overflow:auto;box-shadow:-10px 0 30px rgba(0,0,0,.25)}
.lv .drawer section{margin-top:16px}
.lv .drawer h3{font-size:15px;margin-bottom:6px}
.lv .d-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.lv .d-head h2{font-size:22px}
.lv .attempt{--c:var(--wait);border:1px solid var(--line);border-left:5px solid var(--c);border-radius:8px;padding:6px 9px;margin-bottom:6px;font-size:14px}
.lv .attempt .meta{font-size:12px;color:var(--muted)}
.lv .notegroup{margin-bottom:8px}
.lv .notegroup .gl{font-size:12px;font-weight:700;color:var(--muted);margin:0 0 4px}
.lv .notechips{display:flex;flex-wrap:wrap;gap:6px}
.lv .notechip{border:1px solid var(--line);background:var(--surface2);color:var(--ink);border-radius:8px;padding:5px 9px;font-size:13px;cursor:pointer;text-align:left}
.lv .notechip:hover{border-color:var(--brand)}
.lv .hint{font-size:12px;color:var(--muted);margin:6px 0 0}
.lv .sent{font-size:13px;margin:4px 0;padding:5px 8px;background:var(--brand-soft);border-radius:8px}
.lv textarea,.lv input[type=text],.lv input[type=url],.lv select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%}
.lv label.f{display:block;font-weight:700;font-size:14px;margin:12px 0 4px}
.lv .tokens{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;min-height:44px;touch-action:none;user-select:none;-webkit-user-select:none;padding:8px;border:1px dashed var(--line);border-radius:10px;background:var(--surface)}
.lv .tok{font:700 20px/1.6 Quicksand,'Outfit',sans-serif;border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:2px 9px;cursor:pointer;color:var(--ink)}
.lv .tok.w{text-underline-offset:6px;text-decoration-thickness:2px}
.lv .pens{display:flex;flex-wrap:wrap;gap:6px}
.lv .pen{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700}
.lv .pen .w{text-underline-offset:4px;text-decoration-thickness:2px}
.lv .pen[aria-pressed="true"]{outline:3px solid var(--brand);outline-offset:1px;background:var(--brand-soft)}
.lv .box{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:12px}
.lv .list{display:flex;flex-direction:column;gap:6px}
.lv .item{display:flex;gap:10px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.lv .item.now{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
.lv .item.done{opacity:.6}
.lv .item .n{font:700 13px Quicksand,'Outfit',sans-serif;color:var(--muted);min-width:22px;padding-top:4px}
.lv .item .sentence{font-size:19px;line-height:1.6}
.lv .stu{max-width:820px;margin:0 auto;padding:18px 16px 48px}
.lv .stu-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}
.lv .stu-head h1{font-size:26px}
.lv .stu .sentence{font-size:clamp(28px,4.6vw,46px)}
.lv .stu .task{font-size:18px}
.lv .answer{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.lv .answer textarea{font:600 21px/1.4 Quicksand,'Outfit',sans-serif;min-height:92px;resize:vertical}
.lv .answer .row{justify-content:space-between;flex-wrap:wrap}
.lv .status{font:600 15px Quicksand,'Outfit',sans-serif;color:var(--muted)}
.lv .notebox{border-radius:12px;background:var(--brand-soft);padding:12px 14px;margin-top:14px}
.lv .notebox h2{font-size:16px;margin-bottom:4px}
.lv .notebox .big{font:700 20px/1.4 Quicksand,'Outfit',sans-serif;margin:0}
.lv .notebox ul{margin:8px 0 0;padding-left:18px;font-size:14px;color:var(--muted)}
.lv .okbox{border-radius:12px;background:var(--ok-bg);color:var(--ok);padding:12px 14px;margin-top:14px;font:700 19px Quicksand,'Outfit',sans-serif}
.lv .info{border-radius:12px;background:var(--surface2);padding:12px 14px;margin-top:14px;font:600 16px Quicksand,'Outfit',sans-serif}
.lv .wait{max-width:520px;margin:40px auto;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:26px}
.lv .modal{position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,12,40,.4);z-index:60;padding:16px}
.lv .modal>div{background:var(--surface);border-radius:14px;padding:22px;max-width:460px;width:100%}
.lv .modal h2{font-size:22px;margin-bottom:8px}
.lv .modal ul{padding-left:18px;margin:8px 0 14px}
.lv .toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:70;max-width:90vw;text-align:center}
.lv .err{color:#B4321F;font-size:14px;margin:8px 0 0}
@media (prefers-reduced-motion: reduce){.lv *{transition:none!important;animation:none!important}}
`

export function LiveStyles() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" />
      <style>{LIVE_CSS}</style>
    </>
  )
}

// Ekranda kesme işaretini tipografik olanla gösterir (kayıttaki metin değişmez).
export function nice(s: string): string { return String(s || '').replace(/'/g, '’') }

function tokenClass(t: BoardToken): string {
  const cls = ['tk']
  if (t.c) {
    cls.push('r-' + t.c)
    if (t.c !== 'kiremit') cls.push('w')
  }
  if (t.b) cls.push('b')
  if (t.i) cls.push('i')
  if (t.h) cls.push('h')
  return cls.join(' ')
}

export function BoardSentence({ tokens }: { tokens: BoardToken[] }) {
  return (
    <p className="sentence">
      {tokens.map((t, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className={tokenClass(t)}>{nice(t.w)}</span>{t.p ? nice(t.p) : ''}
        </span>
      ))}
    </p>
  )
}

export function Legend({ withMark }: { withMark?: boolean }) {
  return (
    <div className="legend">
      {ROLES.map(r => (
        <span key={r.k}><span className={'w r-' + r.k}>{r.l}</span>{withMark ? ` (${r.m})` : ''}</span>
      ))}
    </div>
  )
}

// ─── Kalemli tahta ───
// Önce kalem seçilir, sonra kelimelere dokunulur ya da parmak/fare basılı
// tutularak kelimelerin üzerinden geçilir. Kalem, başka kalem seçilene kadar
// elde kalır.
const PENS: { k: Pen; l: string }[] = [
  ...ROLES.map(r => ({ k: r.k as Pen, l: r.l })),
  { k: 'kiremit', l: 'Vurgu' },
  { k: 'bold', l: 'Kalın' },
  { k: 'italic', l: 'İtalik' },
  { k: 'highlight', l: 'Fosforlu' },
  { k: 'eraser', l: 'Silgi' },
]

export function PenBar({ pen, onPen }: { pen: Pen; onPen: (p: Pen) => void }) {
  return (
    <div className="pens" role="group" aria-label="Kalemler">
      {PENS.map(p => {
        let label: React.ReactNode = p.l
        if (p.k === 'ozne' || p.k === 'fiil' || p.k === 'nesne' || p.k === 'zaman' || p.k === 'baglac') label = <span className={'w r-' + p.k}>{p.l}</span>
        else if (p.k === 'kiremit') label = <span className="r-kiremit">{p.l}</span>
        else if (p.k === 'bold') label = <span style={{ fontWeight: 900 }}>{p.l}</span>
        else if (p.k === 'italic') label = <span style={{ fontStyle: 'italic' }}>{p.l}</span>
        else if (p.k === 'highlight') label = <span className="tk h">{p.l}</span>
        return (
          <button key={p.k} type="button" className="pen" aria-pressed={pen === p.k} onClick={() => onPen(p.k)}>{label}</button>
        )
      })}
    </div>
  )
}

export function PaintableTokens({ tokens, pen, onChange, emptyText }: {
  tokens: BoardToken[]
  pen: Pen
  onChange: (next: BoardToken[]) => void
  emptyText?: string
}) {
  const stroke = useRef<{ remove: boolean; done: Set<number>; current: BoardToken[] } | null>(null)
  const [, force] = useState(0)

  function idxAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const hit = el?.closest('[data-ti]') as HTMLElement | null
    if (!hit) return null
    const n = Number(hit.getAttribute('data-ti'))
    return Number.isFinite(n) ? n : null
  }
  function paint(i: number) {
    const s = stroke.current
    if (!s || s.done.has(i) || !s.current[i]) return
    s.done.add(i)
    const next = s.current.slice()
    next[i] = applyPen(next[i], pen, s.remove)
    s.current = next
    onChange(next)
    force(n => n + 1)
  }

  return (
    <div
      className="tokens"
      onPointerDown={e => {
        const i = idxAt(e.clientX, e.clientY)
        if (i == null) return
        e.preventDefault()
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
        stroke.current = { remove: penIsOn(tokens[i], pen), done: new Set(), current: tokens }
        paint(i)
      }}
      onPointerMove={e => {
        if (!stroke.current) return
        const i = idxAt(e.clientX, e.clientY)
        if (i != null) paint(i)
      }}
      onPointerUp={() => { stroke.current = null }}
      onPointerCancel={() => { stroke.current = null }}
    >
      {tokens.length === 0 && <span className="muted small" style={{ alignSelf: 'center' }}>{emptyText || 'Cümleyi yazınca kelimeler burada belirir.'}</span>}
      {tokens.map((t, i) => (
        <span key={i} data-ti={i} className={'tok ' + tokenClass(t)} role="button" aria-label={t.w}>
          {nice(t.w)}{t.p ? <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{nice(t.p)}</span> : null}
        </span>
      ))}
    </div>
  )
}
