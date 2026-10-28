// Okuyucunun tüm stilleri. Sınıf adları "rd-" ile başlar, sitenin geri kalanına
// karışmaz. Tasarım prototipten alındı; çocuk panelinin açık temasında çalışır.
export const READER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap');
.rd{
  --bg:#EFEBFA; --paper:#FFFFFF; --paper2:#F8F5FF; --ink:#1D1A3D; --ink2:#5B5784; --line:#DDD6F4;
  --brand:#6B46E5; --brand-ink:#FFFFFF; --sent:#EEE8FF;
  --learn:#FFD45E; --learn-ink:#2B2200; --known:#C4F0DC; --known-ink:#0B4F38;
  --bad:#C2325B; --good:#127A57; --shadow:0 12px 32px rgba(40,25,100,.14);
  background:var(--bg); color:var(--ink); min-height:100vh; min-height:100dvh;
  font-family:'Quicksand',system-ui,'Segoe UI',Roboto,sans-serif; font-weight:600;
  -webkit-tap-highlight-color:transparent; color-scheme:light;
}
.rd *{box-sizing:border-box}
.rd button{font:inherit;color:inherit;cursor:pointer}
.rd button:disabled{opacity:.45;cursor:default}
.rd :focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.rd-app{max-width:1100px;margin:0 auto;padding:max(12px,env(safe-area-inset-top,0px)) 14px 0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;gap:12px}
.rd-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.rd-brand{display:flex;align-items:center;gap:10px;min-width:0}
.rd-mark{width:40px;height:40px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;flex:none;font-weight:700;font-size:17px}
.rd-brand h1{margin:0;font-size:19px;line-height:1.15;font-weight:700;overflow:hidden;text-overflow:ellipsis}
.rd-brand p{margin:0;font-size:12.5px;color:var(--ink2)}
.rd-btn{border:1.5px solid var(--line);background:var(--paper);border-radius:12px;padding:9px 13px;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px;min-height:40px}
.rd-btn:hover:not(:disabled){border-color:var(--brand)}
.rd-btn.primary{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.rd-cnt{border-radius:8px;padding:1px 8px;font-size:12.5px}
.rd-cnt.k{background:var(--known);color:var(--known-ink)}
.rd-cnt.l{background:var(--learn);color:var(--learn-ink)}
.rd-muted{color:var(--ink2);font-size:14px}
.rd-note{background:var(--sent);border:1.5px solid var(--brand);border-radius:14px;padding:10px 12px;font-size:14.5px}
.rd-warn{background:#FFF4D6;border:1.5px solid #E8C25A;border-radius:14px;padding:10px 12px;font-size:14.5px;color:#4A3600}

/* kitap listesi */
.rd-list{display:grid;gap:12px;grid-template-columns:1fr;padding-bottom:30px}
@media (min-width:700px){.rd-list{grid-template-columns:1fr 1fr}}
.rd-card{display:flex;gap:14px;align-items:center;text-align:left;width:100%;background:var(--paper);border:1.5px solid var(--line);border-radius:20px;padding:14px;box-shadow:var(--shadow)}
.rd-card:hover:not(:disabled){border-color:var(--brand)}
.rd-card.locked{background:var(--paper2);box-shadow:none}
.rd-cover{width:72px;height:96px;border-radius:12px;flex:none;overflow:hidden;display:grid;place-items:center;color:#fff;font-size:30px;font-weight:700}
.rd-cover img{width:100%;height:100%;object-fit:cover;display:block}
.rd-card h2{margin:0 0 4px;font-size:19px;line-height:1.2}
.rd-card p{margin:0;font-size:13.5px;color:var(--ink2)}
.rd-sec{margin:6px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}

/* kontroller */
.rd-controls{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}
.rd-grp{display:flex;align-items:center;gap:8px}
.rd-grp>span{font-size:12.5px;color:var(--ink2)}
.rd-seg{display:inline-flex;background:var(--paper);border:1.5px solid var(--line);border-radius:12px;padding:3px}
.rd-seg button{border:0;background:transparent;padding:7px 11px;border-radius:9px;font-weight:700;font-size:13.5px;color:var(--ink2);min-height:34px}
.rd-seg button[aria-pressed="true"]{background:var(--brand);color:var(--brand-ink)}
.rd-tgl{display:inline-flex;align-items:center;gap:8px;background:var(--paper);border:1.5px solid var(--line);border-radius:12px;padding:7px 11px;font-weight:700;font-size:13.5px;min-height:40px}
.rd-tgl i{width:30px;height:18px;border-radius:99px;background:var(--line);position:relative;transition:background .15s}
.rd-tgl i::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:var(--paper);transition:transform .15s}
.rd-tgl[aria-pressed="true"] i{background:var(--brand)}
.rd-tgl[aria-pressed="true"] i::after{transform:translateX(12px)}
.rd-wide{display:none}
@media (min-width:700px){.rd-wide{display:flex}}

/* kitap */
.rd-stage{flex:1}
.rd-spread{display:grid;grid-template-columns:1fr;background:var(--paper);border-radius:22px;box-shadow:var(--shadow);border:1.5px solid var(--line);overflow:hidden}
.rd-art{padding:14px;display:flex;align-items:center;justify-content:center;background:var(--paper2)}
.rd-art img{width:100%;max-height:46vh;object-fit:contain;border-radius:14px;display:block}
.rd-text{padding:18px 18px 14px;display:flex;flex-direction:column;gap:10px;background:var(--paper);min-height:300px}
.rd-spread.dbl.has-art{grid-template-columns:1fr 1fr;min-height:520px;position:relative}
.rd-spread.dbl.has-art::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:36px;margin-left:-18px;background:linear-gradient(90deg,transparent,rgba(40,25,100,.10),transparent);pointer-events:none}
.rd-spread.dbl.has-art .rd-art{padding:22px}
.rd-spread.dbl.has-art .rd-art img{max-height:70vh}
.rd-spread.dbl .rd-text{padding:24px 26px 18px}
.rd-pghead{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--ink2);font-size:13px}
.rd-body{flex:1;display:flex;flex-direction:column;justify-content:center}
.rd-sent{padding:.3em .55em;margin:.1em 0;border-radius:14px;cursor:pointer;line-height:1.5;font-size:clamp(21px,5.2vw,28px);border-left:4px solid transparent;transition:background .2s}
.rd-sent.act{background:var(--sent);border-left-color:var(--brand)}
.rd-sent.blur .rd-line{filter:blur(7px);user-select:none}
.rd-sent.blur.rev .rd-line{filter:none}
.rd-tr{margin-top:2px;font-size:clamp(15px,3.8vw,18px);color:var(--ink2);font-weight:600}
.rd-w{border-radius:8px;padding:0 .08em;transition:background .12s,color .12s}
.rd-w.done{color:var(--brand)}
.rd-w.v{cursor:pointer;border-bottom:2px dotted var(--ink2)}
.rd-w.learn{background:var(--learn);color:var(--learn-ink);border-bottom-color:transparent}
.rd-w.known{background:var(--known);color:var(--known-ink);border-bottom-color:transparent}
.rd-w.on,.rd-w.on.learn,.rd-w.on.known{background:var(--brand);color:var(--brand-ink);border-bottom-color:transparent}
.rd-hide{border:2px dashed var(--line);border-radius:18px;padding:26px 18px;text-align:center;color:var(--ink2);display:flex;flex-direction:column;gap:12px;align-items:center}
.rd-hide b{color:var(--ink);font-size:17px}
.rd-trhint{align-self:flex-start;margin-top:6px}

.rd-wcard{background:var(--ink);color:#fff;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.rd-wc-top{display:flex;align-items:center;gap:10px}
.rd-wc-top .wd{font-size:22px;font-weight:700}
.rd-wc-top .ph{font-size:13px;opacity:.75}
.rd-wc-ex{font-size:15px;opacity:.9}
.rd-wc-img{width:100%;max-height:160px;object-fit:contain;border-radius:10px;background:#fff}
.rd-wc-act{display:flex;gap:8px;flex-wrap:wrap}
.rd-wc-act button{border:0;border-radius:10px;padding:9px 13px;font-weight:700;font-size:14px;min-height:40px}
.rd-b-known{background:var(--known);color:var(--known-ink)}
.rd-b-learn{background:var(--learn);color:var(--learn-ink)}
.rd-b-ghost{background:rgba(255,255,255,.16);color:#fff}
.rd-round{width:38px;height:38px;border-radius:50%;border:0;background:var(--learn);color:var(--learn-ink);display:grid;place-items:center;flex:none}
.rd-x{margin-left:auto;background:transparent;border:0;color:inherit;opacity:.75;font-size:24px;line-height:1;padding:4px 8px}

.rd-shadow{background:var(--sent);border:1.5px solid var(--brand);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rd-shadow b{flex:1;min-width:140px}
.rd-foot{display:flex;justify-content:space-between;gap:8px;padding-top:8px;border-top:1.5px solid var(--line)}

/* bitti */
.rd-solo{background:var(--paper);border:1.5px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:24px 20px;min-height:340px;display:flex;flex-direction:column;gap:14px;justify-content:center}
.rd-solo h2{margin:0;font-size:26px}
.rd-solo p{margin:0;font-size:18px;line-height:1.45}
.rd-solo .row{display:flex;gap:10px;flex-wrap:wrap}

/* ses çubuğu */
.rd-bar{position:sticky;bottom:0;z-index:20;background:var(--paper);border:1.5px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0;box-shadow:0 -8px 24px rgba(40,25,100,.10);padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.rd-tp{display:flex;align-items:center;gap:6px}
.rd-tp .rd-btn{padding:8px 10px}
.rd-play{width:54px;height:54px;border-radius:16px;border:0;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center}
.rd-scrub{flex:1;min-width:200px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink2)}
.rd-scrub input{flex:1;accent-color:var(--brand);height:28px}
.rd-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

/* kelime çekmecesi */
.rd-scrim{position:fixed;inset:0;background:rgba(10,6,40,.45);z-index:40;opacity:0;pointer-events:none;transition:opacity .2s}
.rd-scrim.open{opacity:1;pointer-events:auto}
.rd-drawer{position:fixed;top:0;bottom:0;right:0;width:min(390px,92vw);z-index:50;background:var(--paper);border-left:1.5px solid var(--line);transform:translateX(102%);transition:transform .25s;display:flex;flex-direction:column;padding:calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));gap:10px}
.rd-drawer.open{transform:none}
.rd-dh{display:flex;align-items:center;justify-content:space-between}
.rd-dh h3{margin:0;font-size:18px}
.rd-vlist{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.rd-vi{border:1.5px solid var(--line);background:var(--paper2);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.rd-vi.learn{border-color:var(--learn)}
.rd-vi.known{border-color:var(--known-ink)}
.rd-vi .r{display:flex;align-items:center;gap:8px}
.rd-vi .r b{font-size:17px}
.rd-vi .ph{font-size:12.5px;color:var(--ink2)}
.rd-vi .ex{font-size:14px;color:var(--ink2)}
.rd-vi .act{display:flex;gap:6px}
.rd-vi .act button{flex:1;border:1.5px solid var(--line);background:var(--paper);border-radius:10px;padding:7px 8px;font-weight:700;font-size:13.5px;min-height:38px}
.rd-vi .act button.on-k{background:var(--known);color:var(--known-ink);border-color:transparent}
.rd-vi .act button.on-l{background:var(--learn);color:var(--learn-ink);border-color:transparent}
.rd-sp{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--line);background:var(--paper);display:grid;place-items:center;flex:none}
.rd-empty{color:var(--ink2);text-align:center;padding:24px 8px}

.rd-toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);background:var(--ink);color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:60;max-width:92vw;text-align:center}
.rd-toast.on{opacity:1;transform:translate(-50%,0)}

/* içerik kontrolü */
.rd-issues{display:flex;flex-direction:column;gap:10px;padding-bottom:30px}
.rd-issue{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:10px 12px}
.rd-issue.hata{border-left:6px solid var(--bad)}
.rd-issue.uyari{border-left:6px solid #E8A21A}
.rd-issue small{display:block;color:var(--ink2);font-size:12.5px;margin-bottom:2px}
.rd-issue .tag{display:inline-block;border-radius:8px;padding:0 8px;font-size:12px;margin-right:6px}
.rd-issue.hata .tag{background:#FBD9E3;color:var(--bad)}
.rd-issue.uyari .tag{background:#FFEBC2;color:#7A4B00}
.rd-ok{background:var(--known);color:var(--known-ink);border-radius:14px;padding:14px;font-size:17px}
@media (prefers-reduced-motion: reduce){.rd *{transition:none!important;animation:none!important}}
`
