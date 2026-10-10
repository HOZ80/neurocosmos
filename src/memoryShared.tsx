// Hafıza beyni — ana pakette yer alan hafif parçalar (veri okuma, tarih işleme,
// stiller, ünite sayfasındaki "Memory" bölümü). Ağır olan 3D beyin ayrı dosyada
// (MemoryBrain.tsx) ve sadece Memory sayfası açılınca yüklenir.

export type MemStatus = 'known' | 'learning' | 'fading'
export type MemType = 'word' | 'structure'

export interface MemoryItem {
  unit: string      // unit_id (örn. A1-U01)
  item: string
  type: MemType
  date: string      // her zaman YYYY-MM-DD
  status: MemStatus
}

export interface MemoryStudent {
  name: string
  profile: string   // "English Group A" | "English Group B" | "Owner"
  url: string
  active: boolean
}

export const ST: Record<MemStatus, { label: string; hex: string; css: string }> = {
  known: { label: 'Known', hex: '#FFA126', css: 'var(--mb-known)' },
  learning: { label: 'Learning', hex: '#5FE3F0', css: 'var(--mb-learning)' },
  fading: { label: 'Fading', hex: '#8C88AC', css: 'var(--mb-fading)' },
}

export const STATUS_ORDER: MemStatus[] = ['known', 'learning', 'fading']

// YYYY-MM-DD → DD.MM.YYYY
export function fmtDate(d: string): string {
  const [y, m, x] = d.split('-')
  return `${x}.${m}.${y}`
}

// Sadece iki biçim tanınır: 2026-09-15 ve 15.09.2026. Başka bir biçim (ör. 9/15/2026)
// gün/ay karışıklığı yaratabileceği için tahmin edilmez, satır okunamayan sayılır.
export function normalizeMemoryDate(raw: string): string | null {
  const s = raw.trim()
  let y = 0, m = 0, d = 0
  let a = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (a) { y = +a[1]; m = +a[2]; d = +a[3] }
  else {
    a = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
    if (!a) return null
    d = +a[1]; m = +a[2]; y = +a[3]
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Sütunlar: unit_id, item, type, date, status. Satır sırası korunur (beyindeki
// yer, tablodaki sıraya bağlı). Tamamen boş satırlar zaten CSV okuyucuda elenir.
export function parseMemoryRows(rows: Record<string, string>[]): { items: MemoryItem[]; skipped: number } {
  const items: MemoryItem[] = []
  let skipped = 0
  rows.forEach(r => {
    const unit = (r.unit_id ?? '').trim()
    const item = (r.item ?? '').trim()
    const type = (r.type ?? '').trim().toLowerCase()
    const status = (r.status ?? '').trim().toLowerCase()
    const date = normalizeMemoryDate(r.date ?? '')
    if (!item || !date || (type !== 'word' && type !== 'structure') || (status !== 'known' && status !== 'learning' && status !== 'fading')) {
      skipped++
      return
    }
    items.push({ unit, item, type, date, status })
  })
  return { items, skipped }
}

// Sütunlar: student_name, profile, sheet_csv_url, active
export function parseMemoryStudents(rows: Record<string, string>[]): MemoryStudent[] {
  const out: MemoryStudent[] = []
  rows.forEach(r => {
    const name = (r.student_name ?? '').trim()
    const url = (r.sheet_csv_url ?? '').trim()
    if (!name || !/^https:\/\//i.test(url)) return
    out.push({
      name,
      profile: (r.profile ?? '').trim(),
      url,
      active: (r.active ?? '').trim().toLowerCase() === 'true',
    })
  })
  return out
}

// ─── Stiller ───────────────────────────────────────────────────────────────────
// Renkler hafiza-3d-onizleme.html ile aynı. Değişkenler --mb- önekli; sitenin
// kendi değişkenleriyle karışmasın diye. (Açık/koyu tema uyarlaması sonra yapılacak.)
export const MEMORY_CSS = `
.mb-scope{--mb-bg:#EEEBFA;--mb-panel:#FFFFFF;--mb-ink:#23204A;--mb-muted:#6B6890;--mb-line:#B9B2E6;--mb-focus:#6A4CE0;--mb-chip:#FFFFFF;--mb-chip-on:#23204A;--mb-chip-on-ink:#FFFFFF;--mb-known:#D08A10;--mb-learning:#1597A8;--mb-fading:#8A86A6;font-family:"Nunito","Varela Round",system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;color:var(--mb-ink)}
@media (prefers-color-scheme: dark){.mb-scope{--mb-bg:#1A1838;--mb-panel:#24214A;--mb-ink:#F1EEFF;--mb-muted:#A7A2D6;--mb-line:#454082;--mb-focus:#FFFFFF;--mb-chip:#2B2858;--mb-chip-on:#F1EEFF;--mb-chip-on-ink:#1A1838;--mb-known:#FFC15E;--mb-learning:#5FE3F0;--mb-fading:#9C98B8}}
.mb-scope *,.mb-scope *::before,.mb-scope *::after{box-sizing:border-box}
.mb-root{background:var(--mb-bg);border-radius:22px;padding:20px 16px 28px;max-width:620px;margin:0 auto}
.mb-root h1{font-size:1.6rem;font-weight:800;margin:4px 0 2px;color:var(--mb-ink)}
.mb-sub{color:var(--mb-muted);margin:0 0 14px;font-size:.95rem}
.mb-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.mb-chip{font:inherit;font-weight:600;border:1.5px solid var(--mb-line);background:var(--mb-chip);color:var(--mb-ink);padding:8px 16px;border-radius:999px;cursor:pointer}
.mb-chip[aria-pressed="true"]{background:var(--mb-chip-on);color:var(--mb-chip-on-ink);border-color:var(--mb-chip-on)}
.mb-chip:focus-visible,.mb-row:focus-visible{outline:3px solid var(--mb-focus);outline-offset:2px}
.mb-space{position:relative;border-radius:22px;overflow:hidden;background:#0D0A22;touch-action:none;cursor:grab}
.mb-space:active{cursor:grabbing}
.mb-space canvas{display:block;width:100%}
.mb-replay{position:absolute;top:10px;right:10px;z-index:2;font:inherit;font-weight:700;font-size:.82rem;color:#E4DCFF;background:rgba(30,22,72,.55);border:1px solid rgba(190,170,255,.45);border-radius:999px;padding:6px 12px;cursor:pointer;backdrop-filter:blur(4px)}
.mb-replay:focus-visible{outline:3px solid #fff;outline-offset:2px}
.mb-bubble{position:absolute;z-index:1;pointer-events:none;transform:translate(-50%,calc(-100% - 16px));background:rgba(28,20,70,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(200,182,255,.55);color:#fff;padding:5px 13px;border-radius:999px;font-weight:800;font-size:.95rem;white-space:nowrap;transition:opacity .15s}
.mb-bubble[hidden]{display:none}
.mb-bubble::after{content:"";position:absolute;left:50%;bottom:-7px;width:1px;height:7px;background:rgba(200,182,255,.55)}
.mb-hint3d{position:absolute;left:0;right:0;bottom:10px;text-align:center;color:#9D95D8;font-size:.8rem;pointer-events:none}
.mb-count{font-size:1.05rem;margin:12px 0 2px;color:var(--mb-ink)}
.mb-count b{font-weight:800}
.mb-newline{color:var(--mb-muted);margin:0 0 14px;font-size:.95rem}
.mb-panel{background:var(--mb-panel);border-radius:18px;padding:16px 18px;min-height:110px;color:var(--mb-ink)}
.mb-panel .mb-item{font-size:1.4rem;font-weight:800;margin:0 0 6px}
.mb-panel .mb-meta{color:var(--mb-muted);margin:0;font-size:.92rem}
.mb-panel .mb-hint{color:var(--mb-muted);margin:0}
.mb-dot{width:11px;height:11px;border-radius:50%;display:inline-block;vertical-align:baseline;margin-right:6px}
.mb-legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin:14px 0 4px;font-size:.9rem;color:var(--mb-muted)}
.mb-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 10px}
.mb-list{background:var(--mb-panel);border-radius:18px;padding:6px 8px;max-height:340px;overflow-y:auto}
.mb-gh{font-weight:800;font-size:.92rem;margin:10px 10px 4px;color:var(--mb-ink)}
.mb-row{display:flex;width:100%;align-items:center;gap:10px;text-align:left;font:inherit;color:var(--mb-ink);background:transparent;border:0;border-radius:12px;padding:8px 10px;cursor:pointer}
.mb-row:hover{background:color-mix(in srgb,var(--mb-line) 25%,transparent)}
.mb-row .mb-nm{font-weight:700;flex:1 1 auto}
.mb-row .mb-mt{color:var(--mb-muted);font-size:.82rem;text-align:right}
.mb-unit{background:var(--mb-panel);border:1px solid var(--mb-line);border-radius:18px;padding:14px 16px}
.mb-unit-head{display:flex;justify-content:space-between;gap:10px;font-weight:800;margin-bottom:6px}
.mb-unit-head span{color:var(--mb-muted);font-weight:600;font-size:.88rem}
.mb-grp{margin:2px 0 14px}
.mb-grp:last-child{margin-bottom:0}
.mb-grp>b{font-size:.9rem}
.mb-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.mb-tag{border:1.5px solid var(--mb-line);border-radius:999px;padding:3px 12px;font-size:.9rem}
.mb-tag.structure{border-radius:8px;font-weight:700}
.mb-note{margin-top:8px;font-size:.85rem;color:var(--mb-muted)}
.mb-credit{margin-top:22px;font-size:.75rem;color:var(--mb-muted)}
`

export function MemoryStyles() {
  return <style>{MEMORY_CSS}</style>
}

// ─── Ünite sayfasındaki "Memory" bölümü ────────────────────────────────────────
// Ünite kartı açıldığında o ünitenin öğeleri; durum gruplarına ayrılmış etiketler.
export function UnitMemorySection({ items }: { items: MemoryItem[] }) {
  if (items.length === 0) return null
  const latest = items.reduce((m, x) => (x.date > m ? x.date : m), '')
  return (
    <div className="mb-scope">
      <MemoryStyles />
      <div className="mb-unit">
        <div className="mb-unit-head">
          Memory
          <span>{items.length} {items.length === 1 ? 'item' : 'items'}, {fmtDate(latest)}</span>
        </div>
        {STATUS_ORDER.map(k => {
          const g = items.filter(n => n.status === k)
          if (!g.length) return null
          return (
            <div className="mb-grp" key={k}>
              <b><i className="mb-dot" style={{ background: ST[k].css }} />{ST[k].label} ({g.length})</b>
              <div className="mb-tags">
                {g.map((n, i) => <span key={i} className={`mb-tag ${n.type}`}>{n.item}</span>)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
