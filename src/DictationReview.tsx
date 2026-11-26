// Dictation kontrol sonucunun görünümü — ünite Dictation'ı (App.tsx) ve
// P "Free Module" Dictation'ı (PrivateDictation.tsx) ortak kullanır.
// Çocuk Dictation'ı kendi temasında gösterir (KidsTopics.tsx).
import type { DictOp, DictNote, DictHintPart } from './dictationCheck'
import { dictNoteText } from './dictationCheck'

const cleanWord = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

// Cümlede geçen isimler — yazmaya başlamadan önce görünür
export function DictNamesBar({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--muted-foreground)' }}>
      <span style={{ fontWeight: 600 }}>İsimler:</span>
      {names.map(n => (
        <span key={n} style={{ padding: '2px 9px', borderRadius: '6px', background: '#F1F5F9', color: '#334155', border: '1px dashed #CBD5E1', fontWeight: 600 }}>{n}</span>
      ))}
      <span style={{ fontSize: '12px' }}>(yazman beklenmez)</span>
    </div>
  )
}

const CHIP = { padding: '3px 9px', borderRadius: '6px', fontSize: '15px', fontWeight: 500 } as const

// Kelime kelime sonuç
export function DictChips({ ops }: { ops: DictOp[] }) {
  const kinds = new Set(ops.map(o => o.kind))
  const legend: string[] = []
  if (kinds.has('contraction')) legend.push('mor: kısaltma farkı (doğru sayıldı)')
  if (kinds.has('name')) legend.push('gri: isim (sayılmaz)')
  if (kinds.has('missing')) legend.push('—: eksik kelime')
  if (kinds.has('extra')) legend.push('üstü çizili: fazladan kelime')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {ops.map((o, i) => {
          if (o.kind === 'ok') return <span key={i} style={{ ...CHIP, background: '#DCFCE7', color: '#15803D', border: '1px solid rgba(21,128,61,0.2)' }}>{o.typed}</span>
          if (o.kind === 'contraction') return <span key={i} title={`Kayıtta: ${cleanWord(o.target)}`} style={{ ...CHIP, background: '#EDE9FE', color: '#5B21B6', border: '1px solid rgba(91,33,182,0.25)' }}>{o.typed}</span>
          if (o.kind === 'name') return <span key={i} title="İsim — sayılmaz" style={{ ...CHIP, background: '#F1F5F9', color: '#475569', border: '1px dashed #CBD5E1' }}>{o.typed || cleanWord(o.target)}</span>
          if (o.kind === 'missing') return <span key={i} title="Eksik kelime" style={{ ...CHIP, background: '#FEE2E2', color: '#B91C1C', border: '1px dashed rgba(185,28,28,0.35)' }}>—</span>
          if (o.kind === 'extra') return <span key={i} title="Fazladan kelime" style={{ ...CHIP, background: '#FEE2E2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.25)', textDecoration: 'line-through' }}>{o.typed}</span>
          return <span key={i} style={{ ...CHIP, background: '#FEE2E2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.25)', textDecoration: 'underline wavy rgba(185,28,28,0.5)' }}>{o.typed}</span>
        })}
      </div>
      {legend.length > 0 && <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>{legend.join(' · ')}</p>}
    </div>
  )
}

// Kısaltma notları (doğru sayıldı, bilgi için)
export function DictNotes({ notes }: { notes: DictNote[] }) {
  if (notes.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {notes.map((nt, i) => (
        <p key={i} style={{ margin: 0, padding: '6px 10px', borderRadius: '8px', background: '#F5F3FF', border: '1px solid rgba(91,33,182,0.2)', color: '#5B21B6', fontSize: '13px', fontWeight: 500 }}>
          ℹ️ {dictNoteText(nt)}
        </p>
      ))}
    </div>
  )
}

// İpucu satırı: doğru yazılanlar ve isimler açık, ipucu kelimesi yeşil, kalanı gizli
export function DictHintLine({ parts, extras }: { parts: DictHintPart[]; extras: string[] }) {
  const hasHint = parts.some(p => p.kind === 'hint')
  return (
    <>
      {hasHint && (
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
          {parts.map((p, i) => {
            if (p.kind === 'ok') return <span key={i} style={{ color: p.name ? '#64748B' : '#374151' }}>{p.word} </span>
            if (p.kind === 'hint') return <span key={i} style={{ color: '#15803D', fontWeight: 700 }}>{p.word} </span>
            return <span key={i} style={{ color: 'var(--muted-foreground)' }}>{p.word} </span>
          })}
        </p>
      )}
      {extras.length > 0 && (
        <p style={{ margin: hasHint ? '6px 0 0' : 0, fontSize: '14px', color: '#374151' }}>Fazladan kelime var: <b>{extras.join(', ')}</b></p>
      )}
    </>
  )
}
