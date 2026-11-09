// ─── Uygulamayı yükle düğmesi + cihaza özel rehber ─────────────────────────
// Her ekranda aynı bileşen kullanılır. Davranış:
// • Site ana ekrandan (uygulama olarak) açıldıysa düğme hiç görünmez.
// • Tarayıcı tek dokunuşla yüklemeye izin veriyorsa (Android/bilgisayar Chrome)
//   düğme tarayıcının kendi yükleme penceresini açar.
// • İzin vermiyorsa (iPhone, iPad, diğer tarayıcılar, pencere daha önce
//   kapatıldıysa) cihaza özel adım adım rehber açılır.
// • autoOpenFirstVisit: iPhone/iPad'den ilk girişte rehber bir kez kendiliğinden
//   açılır (yalnızca giriş ekranında kullanılır).
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type Platform = 'ios-safari' | 'ios-other' | 'ipad' | 'android' | 'desktop'

// Tarayıcının "yüklenebilir" sinyali sayfa açılır açılmaz gelebilir; bu yüzden
// dinleyici bileşen beklenmeden, dosya yüklenir yüklenmez kurulur.
let deferredPrompt: any = null
let installedThisSession = false
const listeners = new Set<() => void>()
function notify() { listeners.forEach(fn => fn()) }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedThisSession = true
    notify()
  })
}

function isStandalone(): boolean {
  try {
    return (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  } catch { return false }
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent || ''
  // iPad'deki Safari kendini Mac gibi tanıtır; dokunmatik ekran olmasından ayırt edilir.
  const isIPad = /ipad/i.test(ua) || (/macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1)
  if (isIPad) return 'ipad'
  if (/iphone|ipod/i.test(ua)) return /crios|fxios|edgios|opios/i.test(ua) ? 'ios-other' : 'ios-safari'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function useInstallState() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick(t => t + 1)
    listeners.add(fn)
    let mq: MediaQueryList | null = null
    try {
      mq = window.matchMedia('(display-mode: standalone)')
      mq.addEventListener?.('change', fn)
    } catch {}
    return () => {
      listeners.delete(fn)
      try { mq?.removeEventListener?.('change', fn) } catch {}
    }
  }, [])
  return { hidden: isStandalone() || installedThisSession }
}

// ── Basit çizgi simgeler ──
function Svg({ children, size = 18, color = 'currentColor' }: { children: ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  )
}
const ICONS: Record<string, ReactNode> = {
  download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  share: <><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
  dots: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  dotsV: <><circle cx="12" cy="5" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="19" r="1.3" /></>,
  plusSquare: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8" /><path d="M8 12h8" /></>,
  toggle: <><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></>,
  check: <><path d="M5 12l5 5 9-10" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
}

type Step = { icon: string; text: string }
const GUIDES: Record<Platform, { title: string; steps: Step[]; note?: string }> = {
  'ios-safari': {
    title: 'Ana ekrana ekle',
    steps: [
      { icon: 'dots', text: 'Adres çubuğunun yanındaki üç nokta (•••) düğmesine dokun.' },
      { icon: 'share', text: 'Açılan menüde Paylaş\'a dokun (kare içinden yukarı çıkan ok).' },
      { icon: 'plusSquare', text: 'Listeyi aşağı kaydır, Ana Ekrana Ekle\'yi seç.' },
      { icon: 'toggle', text: 'Web uygulaması olarak açma seçeneği açık kalsın, sonra Ekle\'ye dokun.' },
    ],
    note: 'Paylaş simgesini ekranda doğrudan görüyorsan 1. adımı atla.',
  },
  'ios-other': {
    title: 'Ana ekrana ekle',
    steps: [
      { icon: 'share', text: 'Paylaş simgesine dokun (kare içinden yukarı çıkan ok). Göremiyorsan önce üç nokta düğmesine dokun.' },
      { icon: 'plusSquare', text: 'Ana Ekrana Ekle\'yi seç.' },
      { icon: 'check', text: 'Ekle\'ye dokun.' },
    ],
  },
  ipad: {
    title: 'Ana ekrana ekle',
    steps: [
      { icon: 'share', text: 'Paylaş simgesine dokun (kare içinden yukarı çıkan ok). Göremiyorsan önce üç nokta düğmesine dokun.' },
      { icon: 'plusSquare', text: 'Listeyi aşağı kaydır, Ana Ekrana Ekle\'yi seç.' },
      { icon: 'check', text: 'Ekle\'ye dokun.' },
    ],
  },
  android: {
    title: 'Uygulamayı yükle',
    steps: [
      { icon: 'dotsV', text: 'Sağ üstteki üç nokta menüsüne dokun.' },
      { icon: 'download', text: 'Uygulamayı yükle ya da Ana ekrana ekle seçeneğini seç.' },
      { icon: 'check', text: 'Yükle\'ye dokun.' },
    ],
    note: 'Bu seçenekleri göremiyorsan siteyi Chrome ile aç.',
  },
  desktop: {
    title: 'Bilgisayara yükle',
    steps: [
      { icon: 'download', text: 'Chrome ya da Edge\'de adres çubuğunun sağındaki yükle simgesine tıkla.' },
      { icon: 'check', text: 'Yükle\'ye tıkla.' },
    ],
    note: 'Mac\'te Safari kullanıyorsan: Paylaş simgesi, sonra Dock\'a Ekle.',
  },
}

function InstallGuide({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const g = GUIDES[platform]
  const ink = '#0F172A'
  return (
    <div role="dialog" aria-modal="true" aria-label={g.title} onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,11,30,0.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', width: '100%', maxWidth: '440px', borderRadius: '20px 20px 0 0',
        padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))', color: ink,
        boxShadow: '0 -8px 30px rgba(15,23,42,0.25)', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: ink }}>{g.title}</p>
          <button onClick={onClose} aria-label="Kapat" style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', color: ink, display: 'flex' }}>
            <Svg size={20}>{ICONS.close}</Svg>
          </button>
        </div>
        {g.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
            <span style={{
              width: '26px', height: '26px', borderRadius: '50%', background: '#4F46E5', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{
              width: '36px', height: '36px', borderRadius: '10px', background: '#F1F5F9', color: ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Svg size={20}>{ICONS[s.icon]}</Svg></span>
            <span style={{ fontSize: '14px', lineHeight: 1.45, color: ink }}>{s.text}</span>
          </div>
        ))}
        {g.note && <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#475569', lineHeight: 1.45 }}>{g.note}</p>}
        <p style={{ margin: '12px 0 0', fontSize: '13px', lineHeight: 1.45, color: '#3730A3', background: '#EEF2FF', padding: '9px 11px', borderRadius: '10px' }}>
          Uygulamayı ilk açtığında bir kez daha giriş yapman gerekebilir.
        </p>
        <button onClick={onClose} style={{
          marginTop: '14px', width: '100%', background: '#4F46E5', color: '#fff', border: 'none',
          borderRadius: '12px', padding: '12px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
        }}>Anladım</button>
      </div>
    </div>
  )
}

const SEEN_KEY = 'nc_install_guide_seen'

// variant="auto": geniş ekranda yazılı düğme, telefonda (dar ekranda) yer kaplamayan yuvarlak düğme.
// roundBg / roundFg: auto modda yuvarlak hale geçtiğinde kullanılacak renkler.
export default function InstallButton({ variant = 'text', bg = '#4F46E5', fg = '#FFFFFF', roundBg, roundFg, autoOpenFirstVisit = false, style }: {
  variant?: 'text' | 'round' | 'auto'
  bg?: string
  fg?: string
  roundBg?: string
  roundFg?: string
  autoOpenFirstVisit?: boolean
  style?: CSSProperties
}) {
  const { hidden } = useInstallState()
  const [platform] = useState<Platform>(() => detectPlatform())
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    if (variant !== 'auto') return
    const fn = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [variant])

  // iPhone/iPad'de yükleme tamamen elle yapıldığı için rehber ilk girişte bir kez kendiliğinden açılır.
  useEffect(() => {
    if (!autoOpenFirstVisit || hidden) return
    if (platform !== 'ios-safari' && platform !== 'ios-other' && platform !== 'ipad') return
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch {}
    if (!seen) setOpen(true)
  }, [autoOpenFirstVisit, hidden, platform])

  if (hidden) return null

  function close() {
    setOpen(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch {}
  }

  async function onClick() {
    if (deferredPrompt) {
      const p = deferredPrompt
      try {
        p.prompt()
        await p.userChoice
      } catch {}
      // Tarayıcı aynı pencereyi ikinci kez açtırmıyor; bundan sonra düğme rehberi açar.
      deferredPrompt = null
      notify()
      return
    }
    setOpen(true)
  }

  const label = 'Uygulamayı yükle'
  const asRound = variant === 'round' || (variant === 'auto' && narrow)
  const rBg = variant === 'auto' ? (roundBg ?? bg) : bg
  const rFg = variant === 'auto' ? (roundFg ?? fg) : fg
  const button = asRound ? (
    <button onClick={onClick} aria-label={label} title={label} style={{
      width: '38px', height: '38px', borderRadius: '50%', background: rBg, color: rFg, border: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0,
      ...(variant === 'auto' ? { width: '34px', height: '34px' } : style),
    }}>
      <Svg size={19}>{ICONS.download}</Svg>
    </button>
  ) : (
    <button onClick={onClick} style={{
      background: bg, color: fg, border: 'none', borderRadius: '7px', padding: '5px 10px',
      fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      flexShrink: 0, whiteSpace: 'nowrap', ...style,
    }}>
      <Svg size={14}>{ICONS.download}</Svg>
      {label}
    </button>
  )

  return (
    <>
      {button}
      {open && <InstallGuide platform={platform} onClose={close} />}
    </>
  )
}

