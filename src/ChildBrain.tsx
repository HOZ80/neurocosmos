// ─── Çocuk paneli: My Brain ───────────────────────────────────────────────────
// Çocuğun beyni, öğretmenin My Brain tablosundan gelir (diğer öğrencilerle aynı
// kural: My Brain öğrenci listesindeki ad = çocuğun adı). Kitaplık'taki
// Biliyorum/Öğreneceğim işaretleri beyne gitmez; öğretmene rapor olarak gider.
// Bu dosya hiçbir şey yazmaz, yalnızca gösterir.

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { MemoryItem } from './memoryShared'

const MemoryBrain = lazy(() => import('./MemoryBrain'))

export interface ChildBrainData {
  status: 'loading' | 'ok' | 'error'
  items: MemoryItem[]
}

// loader: çocuğun tablosunu bulup okur (App.tsx'teki My Brain okuma kurallarıyla)
export function useChildBrain(loader: () => Promise<MemoryItem[]>): { data: ChildBrainData; reload: () => void } {
  const [data, setData] = useState<ChildBrainData>({ status: 'loading', items: [] })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    loader()
      .then(items => { if (!cancelled) setData({ status: 'ok', items }) })
      .catch(() => { if (!cancelled) setData(d => ({ ...d, status: d.items.length ? 'ok' : 'error' })) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  return { data, reload }
}

function Dot({ color }: { color: string }) {
  return <i style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, display: 'inline-block' }} />
}

// Çocuk panelindeki kart (renkler My Brain'in açık temasıyla aynı)
export function ChildBrainCard({ data, onOpen }: { data: ChildBrainData; onOpen: () => void }) {
  const known = data.items.filter(i => i.status === 'known').length
  const learning = data.items.filter(i => i.status === 'learning').length
  const fading = data.items.filter(i => i.status === 'fading').length
  const words = data.items.filter(i => i.type === 'word').length
  const structures = data.items.length - words
  const sub: CSSProperties = { margin: '2px 0 0', fontSize: '13px', color: '#64748B' }
  return (
    <button onClick={onOpen} style={{
      width: '100%', textAlign: 'left', background: '#FFFFFF', border: '1.5px solid #6A4CE033',
      borderRadius: '16px', padding: '16px', marginBottom: '22px',
      boxShadow: '0 1px 5px rgba(15,23,42,0.06)', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0, fontSize: '26px',
          background: 'radial-gradient(circle at 50% 40%, #3B2F8F 0%, #1A1838 75%)',
          boxShadow: '0 0 0 1px #6A4CE055, 0 4px 14px rgba(106,76,224,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
            My Brain
          </p>
          {data.status === 'loading' && data.items.length === 0 ? (
            <p style={sub}>Yükleniyor…</p>
          ) : data.items.length === 0 ? (
            <p style={sub}>Öğrendiğin her kelime burada ışıldayacak</p>
          ) : (
            <>
              <p style={{ ...sub, color: '#475569' }}>
                {words} kelime{structures > 0 ? ` · ${structures} yapı` : ''}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#475569', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Dot color="#D08A10" />{known} biliyorum</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Dot color="#1597A8" />{learning} öğreniyorum</span>
                {fading > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Dot color="#8A86A6" />{fading} tekrar zamanı</span>}
              </p>
            </>
          )}
        </div>
        <span style={{ color: '#64748B', fontSize: '18px', flexShrink: 0 }}>→</span>
      </div>
    </button>
  )
}

// Kart tıklanınca açılan tam sayfa My Brain
export function ChildBrainView({ childName, data, unitTitles, onBack }: {
  childName: string; data: ChildBrainData; unitTitles: Record<string, string>; onBack: () => void
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '18px 12px 40px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: '620px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <button onClick={onBack} style={{
          alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px',
          background: '#FFFFFF', border: '1px solid rgba(15,23,42,0.12)', borderRadius: '10px',
          padding: '8px 14px', fontSize: '14px', fontWeight: 600, color: '#0F172A', cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
          Panele dön
        </button>
        <Suspense fallback={<p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>Yükleniyor…</p>}>
          <MemoryBrain
            students={[childName]}
            studentName={childName}
            onSelectStudent={() => {}}
            items={data.items}
            skipped={0}
            showDiagnostics={false}
            status={data.status}
            unitTitles={unitTitles}
          />
        </Suspense>
      </div>
    </div>
  )
}
