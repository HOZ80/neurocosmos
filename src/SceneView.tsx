import { useState, useRef, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneCharacter {
  code: string
  name: string
  who: string
  copyright: string
  personality: string
  speechLimits: string
  wontSay: string
  goal: string
  visualNote: string
}

export interface Scene {
  code: string
  title: string
  unit: string
  target: string
  locked: boolean
  place: string
  bgImage: string
  situation: string
  studentReason: string
  characterExpectation: string
  exitReason: string
  openingLine: string
  fadedLine: string
  repeatReaction: string
  drillReason: string
  drillType: string
  cues: string[]
  answers: string[]
  interjections: string[]
  productionQuestion: string
  structureNote: string
  exampleAnswers: string[]
  closingReaction: string
  exitStyle: string
  exitLine: string
  nextScene: string
  characterCode: string
}

export type SceneSheetData = {
  scenes: Scene[]
  characters: Record<string, SceneCharacter>
}

// ─── Sheet parsing ────────────────────────────────────────────────────────────
// Sahneler sekmesi sütunları: sahne_kodu, sahne_basligi, unite, hedef_yapi,
// kilit, mekan, arkaplan_gorsel, durum, ogrenci_gerekcesi, karakter_beklentisi,
// cikis_gerekcesi, acilis_replik, silik_cevap, tekrar_tepkisi, drill_gerekce,
// drill_tipi, uyaranlar, beklenen_cevaplar, ara_tepkiler, uretim_sorusu,
// yapi_tanimi, ornek_cevaplar, kapanis_tepkisi, cikis_bicimi, cikis_replik,
// sonraki_sahne, karakter_kodu

function splitPipe(str: string | undefined): string[] {
  if (!str) return []
  return str.split('|').map(s => s.trim()).filter(Boolean)
}

export function parseSceneRows(rows: Record<string, string>[]): Scene[] {
  return rows
    .filter(r => (r.sahne_kodu || '').trim() !== '')
    .map(r => ({
      code: r.sahne_kodu || '',
      title: r.sahne_basligi || 'Sahne',
      unit: r.unite || '',
      target: r.hedef_yapi || '',
      locked: (r.kilit || '').toLowerCase().startsWith('kapal'),
      place: r.mekan || '',
      bgImage: r.arkaplan_gorsel || '',
      situation: r.durum || '',
      studentReason: r.ogrenci_gerekcesi || '',
      characterExpectation: r.karakter_beklentisi || '',
      exitReason: r.cikis_gerekcesi || '',
      openingLine: r.acilis_replik || '',
      fadedLine: r.silik_cevap || '',
      repeatReaction: r.tekrar_tepkisi || '',
      drillReason: r.drill_gerekce || '',
      drillType: r.drill_tipi || '',
      cues: splitPipe(r.uyaranlar),
      answers: splitPipe(r.beklenen_cevaplar),
      interjections: splitPipe(r.ara_tepkiler),
      productionQuestion: r.uretim_sorusu || '',
      structureNote: r.yapi_tanimi || '',
      exampleAnswers: splitPipe(r.ornek_cevaplar),
      closingReaction: r.kapanis_tepkisi || '',
      exitStyle: r.cikis_bicimi || 'çıkış',
      exitLine: r.cikis_replik || '',
      nextScene: r.sonraki_sahne || '',
      characterCode: r.karakter_kodu || '',
    }))
}

export function parseCharacterRows(rows: Record<string, string>[]): Record<string, SceneCharacter> {
  const out: Record<string, SceneCharacter> = {}
  rows
    .filter(r => (r.karakter_kodu || '').trim() !== '')
    .forEach(r => {
      out[r.karakter_kodu] = {
        code: r.karakter_kodu,
        name: r.ad || 'Karakter',
        who: r.kim || '',
        copyright: r.telif_durumu || '',
        personality: r.kisilik || '',
        speechLimits: r.konusma_sinirlari || '',
        wontSay: r.soylemeyecekleri || '',
        goal: r.amaci || '',
        visualNote: r.gorsel_not || '',
      }
    })
  return out
}

// ─── Fallback: Sheet bağlanmadan da çalışsın ─────────────────────────────────
// SCENE_SHEET_CSV_URL boşsa ya da fetch başarısız olursa bu veri kullanılır.

export const FALLBACK_SCENE_DATA: SceneSheetData = {
  scenes: [{
    code: 'sahne-01',
    title: 'Yırtılmış Sayfa',
    unit: 'Çalışma Notu 1',
    target: 'Type 3 Conditional',
    locked: false,
    place: 'kütüphane',
    bgImage: '',
    situation: 'Tesla kalenin kütüphanesinde, gece geç saatte, masasında dağınık kâğıtlarla oturuyor.',
    studentReason: 'Öğrenci kalede konaklıyor ve uyuyamıyor. Koridorda tek yanan ışık burası.',
    characterExpectation: 'Tesla kendi kararı hakkında dışarıdan bir yargı istiyor.',
    exitReason: 'Tesla kuleye çıkacağını söyleyip öğrenciyi de çağırıyor.',
    openingLine: 'Come in. The door was never locked. I do not sleep much these days.',
    fadedLine: 'Good evening, Mr Tesla. I saw the light under your door.',
    repeatReaction: 'Then you are the first visitor in a long time. Sit down. I need another mind in this room.',
    drillReason: 'There are lines in this notebook I wrote as facts. Turn each one around for me, and say what would not have happened.',
    drillType: 'Transformation',
    cues: [
      'You tore up the contract. You lost a fortune.',
      'The laboratory burned in 1895. Your notes disappeared.',
      'Morgan stopped the funding. The tower stayed unfinished.',
      'You worked alone. Nobody defended your ideas.',
      "You left Edison's company. You built your own system.",
    ],
    answers: [
      "If you hadn't torn up the contract, you wouldn't have lost a fortune.",
      "If the laboratory hadn't burned in 1895, your notes wouldn't have disappeared.",
      "If Morgan hadn't stopped the funding, the tower wouldn't have stayed unfinished.",
      "If you hadn't worked alone, somebody would have defended your ideas.",
      "If you hadn't left Edison's company, you wouldn't have built your own system.",
    ],
    interjections: [
      'Yes. That is the sentence I could not write myself.',
      'Read it again, slowly.',
      'You see how the past changes shape when you turn it around?',
      'Go on. There is one more line.',
      'Enough of the notebook.',
    ],
    productionQuestion: 'Now the question I cannot answer alone. That night, I held the contract in my hands. If you had been in my place, what would you have done, and what would have happened?',
    structureNote: 'Cevapta iki parça birlikte bulunmalı: geçmişte gerçekleşmemiş bir koşul ve onun gerçekleşmemiş sonucu.',
    exampleAnswers: [
      'If I had been in your place, I would have kept the contract.',
      'If I had kept the paper, I would have finished the tower.',
    ],
    closingReaction: 'Thank you. I have turned that night over for forty years and never heard it said aloud. Come, the sky is clearing, and there is something on the tower you should see.',
    exitStyle: 'kule merdiveni',
    exitLine: 'Take the lamp. The steps are older than both of us.',
    nextScene: '',
    characterCode: 'kar-tesla',
  }],
  characters: {
    'kar-tesla': {
      code: 'kar-tesla',
      name: 'Nikola Tesla',
      who: 'Elektrik akımı üzerine çalışmış, buluşlarının çoğunu tamamlayamadan bırakmış bir mucit.',
      copyright: 'kamu malı tarihi kişi (1856-1943)',
      personality: 'Nazik ama mesafeli. Resmî konuşur, kısa cümleler kurar.',
      speechLimits: 'B1-B2 seviyesinde, kısa ve düz cümleler.',
      wontSay: 'Hedef cümleyi öğrenciye söylemez. Türkçe konuşmaz.',
      goal: 'O gece verdiği kararın doğru olup olmadığını başka birinin ağzından duymak istiyor.',
      visualNote: 'Elli yaşlarında, uzun boylu, ince. Koyu takım.',
    },
  },
}

// ─── Küçük yardımcılar ────────────────────────────────────────────────────────

function useSpeech() {
  const [enabled, setEnabled] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  function speak(text: string) {
    if (!enabled || !supported || !text) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-GB'
      u.rate = 0.9
      u.pitch = 0.9
      window.speechSynthesis.speak(u)
    } catch { /* sessizce geç */ }
  }

  function stop() {
    try { window.speechSynthesis?.cancel() } catch { /* yoksay */ }
  }

  return { enabled, setEnabled, speak, stop, supported }
}

const ACCENT = '#B45309'
const ACCENT_BG = '#FEF3C7'

function SceneButton({ children, onClick, primary = false, disabled = false }: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? ACCENT : 'var(--card)',
        color: primary ? '#fff' : 'var(--foreground)',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: '9px',
        padding: '9px 18px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        marginRight: '10px',
        transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

// ─── SceneView ────────────────────────────────────────────────────────────────

type Stage = 'intro' | 'greeting' | 'reaction' | 'drill' | 'production' | 'closing' | 'record'

type ChatTurn = { from: 'ogrenci' | 'karakter'; text: string }

export default function SceneView({ scenes, characters, onBack }: {
  scenes: Scene[]
  characters: Record<string, SceneCharacter>
  onBack: () => void
}) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [stage, setStage] = useState<Stage>('intro')
  const [drillIndex, setDrillIndex] = useState(0)
  const [drillText, setDrillText] = useState('')
  const [drillRevealed, setDrillRevealed] = useState(false)
  const [drillLog, setDrillLog] = useState<{ cue: string; answer: string }[]>([])
  const [productionText, setProductionText] = useState('')
  const [productionLog, setProductionLog] = useState('')
  const [fadedRevealed, setFadedRevealed] = useState(false)
  const [error, setError] = useState('')

  // Canlı konuşma (desteksiz üretim aşaması)
  const [chatLog, setChatLog] = useState<ChatTurn[]>([])
  const [verdicts, setVerdicts] = useState<{ sentence: string; ok: boolean; note: string }[]>([])
  const [sending, setSending] = useState(false)

  const { enabled, setEnabled, speak, stop, supported } = useSpeech()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => stop(), [])

  const scene = scenes[sceneIndex]

  if (!scene) {
    return (
      <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: 0, textAlign: 'left' }}>← Back</button>
        <p style={{ color: 'var(--muted-foreground)' }}>Bu ünite için henüz sahne eklenmemiş.</p>
      </div>
    )
  }

  const character = characters[scene.characterCode]
  const characterName = character?.name ?? 'Karakter'

  function go(next: Stage, line?: string) {
    setStage(next)
    setError('')
    if (line) speak(line)
  }

  function handleDrill() {
    if (drillRevealed) {
      setDrillLog(log => [...log, { cue: scene.cues[drillIndex], answer: drillText }])
      setDrillText('')
      setDrillRevealed(false)
      const next = drillIndex + 1
      if (next >= scene.cues.length) {
        go('production', scene.productionQuestion)
      } else {
        setDrillIndex(next)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } else {
      setDrillRevealed(true)
      speak(scene.interjections[drillIndex] ?? '')
    }
  }

  async function sendProduction() {
    const mesaj = productionText.trim()
    if (!mesaj) { setError('Önce bir cümle yaz.'); return }
    if (sending) return

    setSending(true)
    setError('')
    const gecmis = chatLog
    setChatLog(log => [...log, { from: 'ogrenci', text: mesaj }])
    setProductionText('')
    if (!productionLog) setProductionLog(mesaj)

    try {
      const res = await fetch('/.netlify/functions/scene-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, character, gecmis, ogrenciMesaji: mesaj }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detay || data.error || 'Cevap alınamadı. Tekrar dener misin?')
      } else {
        const reply: string = data.karakterCevabi || ''
        if (reply) {
          setChatLog(log => [...log, { from: 'karakter', text: reply }])
          speak(reply)
        }
        setVerdicts(v => [...v, {
          sentence: mesaj,
          ok: !!data.yapiTespitEdildi,
          note: data.yapiNotu || '',
        }])
      }
    } catch {
      setError('Bağlantı kurulamadı. Tekrar dener misin?')
    } finally {
      setSending(false)
    }
  }

  function restart() {
    stop()
    setStage('intro')
    setDrillIndex(0)
    setDrillText('')
    setDrillRevealed(false)
    setDrillLog([])
    setProductionText('')
    setProductionLog('')
    setFadedRevealed(false)
    setError('')
    setChatLog([])
    setVerdicts([])
    setSending(false)
  }

  const dialogueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    lineHeight: 1.65,
    color: 'var(--foreground)',
    margin: '0 0 20px',
  }

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '13px', padding: 0, textAlign: 'left' }}>← Back</button>

      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: '0 0 6px' }}>{scene.title}</h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{scene.target}</p>
      </div>

      {scenes.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {scenes.map((s, i) => (
            <button
              key={s.code}
              onClick={() => { restart(); setSceneIndex(i) }}
              style={{
                background: i === sceneIndex ? ACCENT_BG : 'var(--card)',
                color: i === sceneIndex ? ACCENT : 'var(--muted-foreground)',
                border: '1px solid var(--border)', borderRadius: '7px',
                padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >{s.title}</button>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', background: 'var(--card)' }}>
        {/* Arka plan alanı */}
        <div style={{
          height: '170px',
          position: 'relative',
          background: scene.bgImage
            ? `center/cover no-repeat url(${scene.bgImage})`
            : 'radial-gradient(120% 90% at 70% 40%, #6b4b18 0%, #2a2416 28%, #131a20 62%, #080c11 100%)',
        }}>
          <span style={{ position: 'absolute', left: '14px', top: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{scene.place}</span>
        </div>

        <div style={{ padding: '22px 24px 26px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: ACCENT }}>
              {stage === 'intro' ? scene.title : characterName}
            </span>
            {supported && (
              <button
                onClick={() => { if (enabled) stop(); setEnabled(!enabled) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--muted-foreground)', textDecoration: 'underline' }}
              >{enabled ? 'Sesi kapat' : 'Sesi aç'}</button>
            )}
          </div>

          {stage === 'intro' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '16px', color: 'var(--muted-foreground)' }}>{scene.studentReason}</p>
              <SceneButton primary onClick={() => go('greeting', scene.openingLine)}>Başla</SceneButton>
            </div>
          )}

          {stage === 'greeting' && (
            <div>
              <p style={dialogueStyle}>{scene.openingLine}</p>
              <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 6px' }}>Sesli oku:</p>
              <p style={{
                ...dialogueStyle,
                fontSize: '17px',
                opacity: fadedRevealed ? 1 : 0.3,
                color: fadedRevealed ? ACCENT : 'var(--muted-foreground)',
                transition: 'opacity 0.3s',
              }}>{scene.fadedLine}</p>
              {!fadedRevealed && <SceneButton onClick={() => setFadedRevealed(true)}>Netleştir</SceneButton>}
              <SceneButton primary onClick={() => go('reaction', scene.repeatReaction)}>Söyledim</SceneButton>
            </div>
          )}

          {stage === 'reaction' && (
            <div>
              <p style={dialogueStyle}>{scene.repeatReaction}</p>
              <SceneButton primary onClick={() => { go('drill', scene.drillReason); setTimeout(() => inputRef.current?.focus(), 50) }}>Devam et</SceneButton>
            </div>
          )}

          {stage === 'drill' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '16px', color: 'var(--muted-foreground)' }}>{scene.drillReason}</p>

              <div style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: '14px', margin: '0 0 16px' }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '17px', margin: 0 }}>{scene.cues[drillIndex]}</p>
              </div>

              <input
                ref={inputRef}
                type="text"
                value={drillText}
                onChange={e => setDrillText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDrill() }}
                placeholder="If ..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: '1px solid var(--border)', borderRadius: '9px',
                  fontSize: '15px', fontFamily: 'var(--font-display)',
                  background: 'var(--background)', color: 'var(--foreground)',
                  marginBottom: '16px',
                }}
              />

              {drillRevealed && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 4px' }}>Beklenen cümle:</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: ACCENT, margin: '0 0 10px' }}>{scene.answers[drillIndex]}</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontStyle: 'italic', color: 'var(--muted-foreground)', margin: 0 }}>{scene.interjections[drillIndex]}</p>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SceneButton primary onClick={handleDrill}>{drillRevealed ? 'Devam' : 'Karşılaştır'}</SceneButton>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{drillIndex + 1} / {scene.cues.length}</span>
              </div>
            </div>
          )}

          {stage === 'production' && (
            <div>
              <p style={{ ...dialogueStyle, fontSize: '17px' }}>{scene.productionQuestion}</p>

              {chatLog.map((turn, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: turn.from === 'karakter' ? '17px' : '15px',
                    lineHeight: 1.6,
                    color: turn.from === 'karakter' ? 'var(--foreground)' : 'var(--muted-foreground)',
                    borderLeft: turn.from === 'karakter' ? `3px solid ${ACCENT}` : '3px solid var(--border)',
                    paddingLeft: '14px',
                    margin: '0 0 14px',
                  }}
                >{turn.text}</p>
              ))}

              {sending && (
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 14px' }}>
                  {characterName} düşünüyor…
                </p>
              )}

              <textarea
                value={productionText}
                onChange={e => { setProductionText(e.target.value); if (error) setError('') }}
                rows={3}
                placeholder="Kendi cümlenle yaz."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: '1px solid var(--border)', borderRadius: '9px',
                  fontSize: '15px', fontFamily: 'var(--font-display)',
                  background: 'var(--background)', color: 'var(--foreground)',
                  resize: 'vertical', marginBottom: '10px',
                }}
              />
              {error && <p style={{ fontSize: '13px', color: '#DC2626', margin: '0 0 10px' }}>{error}</p>}

              <SceneButton primary onClick={sendProduction} disabled={sending}>
                {sending ? 'Gönderiliyor…' : 'Söyle'}
              </SceneButton>
              {chatLog.length > 0 && !sending && (
                <SceneButton onClick={() => go('closing', scene.closingReaction)}>Sahneyi bitir</SceneButton>
              )}
            </div>
          )}

          {stage === 'closing' && (
            <div>
              <p style={dialogueStyle}>{scene.closingReaction}</p>
              <p style={{ ...dialogueStyle, fontSize: '16px', color: 'var(--muted-foreground)' }}>{scene.exitLine}</p>
              <SceneButton primary onClick={() => go('record')}>{scene.exitStyle} — çık</SceneButton>
            </div>
          )}

          {stage === 'record' && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
                Sahne bitti. Hiçbir aşamada engellenmedin; kaydedilen şey aşağıda.
              </p>

              {drillLog.map((item, i) => (
                <div key={i} style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>{item.cue}</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '15px', margin: 0 }}>{item.answer || '—'}</p>
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px', marginBottom: '18px' }}>
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 8px' }}>Desteksiz üretim</p>
                {verdicts.length === 0 && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: ACCENT, margin: 0 }}>{productionLog || '—'}</p>
                )}
                {verdicts.map((v, i) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: ACCENT, margin: 0 }}>{v.sentence}</p>
                    <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
                      {v.ok ? '✓ hedef yapı üretildi' : '○ hedef yapı görülmedi'}{v.note ? ' — ' + v.note : ''}
                    </p>
                  </div>
                ))}
              </div>

              <SceneButton onClick={restart}>Baştan oyna</SceneButton>
              <SceneButton onClick={onBack}>Üniteye dön</SceneButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
