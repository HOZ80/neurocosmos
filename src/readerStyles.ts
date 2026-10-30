// Okuyucunun tüm stilleri. Sınıf adları "rd-" ile başlar, sitenin geri kalanına
// karışmaz. Tasarım prototipten alındı; çocuk panelinin açık temasında çalışır.
export const READER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap');
.rd{
  --bg:#EFEBFA; --paper:#FFFFFF; --paper2:#F8F5FF; --ink:#1D1A3D; --ink2:#5B5784; --line:#DDD6F4;
  --brand:#6B46E5; --brand-ink:#FFFFFF; --sent:#EEE8FF;
  --learn:#FFD45E; --learn-ink:#2B2200; --known:#C4F0DC; --known-ink:#0B4F38;
  --bad:#C2325B; --good:#127A57; --shadow:0 12px 32px rgba(40,25,100,.14); --page:#FFFDF8;
  background:var(--bg); color:var(--ink); min-height:100vh; min-height:100dvh;
  font-family:'Quicksand',system-ui,'Segoe UI',Roboto,sans-serif; font-weight:600;
  -webkit-tap-highlight-color:transparent; color-scheme:light;
}
.rd *{box-sizing:border-box}
.rd :where(button){font:inherit;color:inherit;cursor:pointer}
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
.rd-stage{flex:0 0 auto}
.rd-book{position:relative;padding-bottom:10px}
.rd-spread{display:grid;grid-template-columns:1fr;background:var(--page);border-radius:20px;border:1px solid #E6DECB;overflow:hidden;
  box-shadow:0 2px 0 #EFE8D8,0 4px 0 #FBF7EE,0 5px 0 #E6DCC8,0 7px 0 #F7F1E5,0 8px 0 #DED3BD,0 22px 44px rgba(40,25,100,.22)}
.rd-art{padding:14px 14px 4px;display:flex;align-items:center;justify-content:center;background:var(--page)}
.rd-frame{width:100%;aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:#F1ECFF;box-shadow:inset 0 0 0 1.5px rgba(40,25,100,.10),0 2px 8px rgba(40,25,100,.10)}
.rd-frame img{width:100%;height:100%;object-fit:cover;display:block}
.rd-spread:not(.dbl) .rd-frame{width:min(100%,520px);margin:0 auto}
.rd-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--ink2);font-size:15px;border:2px dashed var(--line);border-radius:14px}
.rd-ph span{font-size:34px;opacity:.6}
.rd-text{position:relative;padding:16px 18px 14px;display:flex;flex-direction:column;gap:10px;background:var(--page);min-height:300px}
.rd-spread.dbl{grid-template-columns:1fr 1fr;min-height:560px;position:relative}
.rd-spread.dbl .rd-art{padding:30px 26px 30px 30px;background:linear-gradient(90deg,var(--page) 0%,var(--page) 82%,#EDE4D0 100%)}
.rd-spread.dbl .rd-text{padding:28px 30px 20px 30px;background:linear-gradient(270deg,var(--page) 0%,var(--page) 82%,#EDE4D0 100%)}
.rd-spread.dbl::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:44px;margin-left:-22px;background:linear-gradient(90deg,transparent,rgba(60,40,10,.16) 48%,rgba(60,40,10,.22) 50%,rgba(60,40,10,.16) 52%,transparent);pointer-events:none;z-index:2}
.rd-flipclone{position:absolute;z-index:8;pointer-events:none;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:var(--page);box-shadow:0 0 36px rgba(20,10,60,.28);margin:0;will-change:transform}
.rd-curl{position:absolute;right:0;bottom:0;width:46px;height:46px;border:0;padding:0;background:linear-gradient(315deg,var(--bg) 0 48%,#D9CFF5 50%,#F4EFFF 72%);border-top-left-radius:12px;box-shadow:-3px -3px 8px rgba(40,25,100,.12);transition:width .15s,height .15s;z-index:3}
.rd-curl:hover{width:58px;height:58px}
.rd-dots{display:inline-flex;align-items:center;gap:6px}
.rd-dots i{width:9px;height:9px;border-radius:99px;background:var(--line);display:inline-block;transition:width .2s}
.rd-dots i.past{background:#BFB2F0}
.rd-dots i.on{width:26px;background:var(--brand)}
.rd-dots b{margin-left:6px;font-size:13px;color:var(--ink2);font-weight:700}
@media (max-width:520px){.rd-hint{display:none}}
.rd-home{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:14px;background:var(--brand);color:var(--brand-ink);padding:10px 16px;font-weight:700;font-size:15.5px;min-height:46px;box-shadow:0 4px 12px rgba(107,70,229,.3);flex:none}
.rd-home:hover{filter:brightness(1.08)}
.rd-top{flex-wrap:wrap}
.rd-title{white-space:nowrap}
.rd-pghead{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--ink2);font-size:13px}
.rd-body{flex:1;display:flex;flex-direction:column;justify-content:center}
.rd-sent{padding:.3em .55em;margin:.1em 0;border-radius:14px;cursor:pointer;line-height:1.5;font-size:clamp(21px,5.2vw,28px);border-left:4px solid transparent;transition:background .2s}
.rd-sent.act{background:var(--sent);border-left-color:var(--brand)}
.rd-sent.blur .rd-line{filter:blur(7px);user-select:none}
.rd-sent.blur.rev .rd-line{filter:none}
.rd-tr{margin-top:2px;font-size:clamp(15px,3.8vw,18px);color:#8480A0;font-weight:500;font-style:italic}
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
.rd-foot{display:flex;justify-content:space-between;gap:8px;padding:8px 52px 0 0;border-top:1.5px solid var(--line)}

/* bitti */
.rd-solo{background:var(--paper);border:1.5px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:24px 20px;min-height:340px;display:flex;flex-direction:column;gap:14px;justify-content:center}
.rd-solo h2{margin:0;font-size:26px}
.rd-solo p{margin:0;font-size:18px;line-height:1.45}
.rd-solo .row{display:flex;gap:10px;flex-wrap:wrap}

/* ses çubuğu */
.rd-bar{margin-top:auto;position:sticky;bottom:0;z-index:20;background:var(--paper);border:1.5px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0;box-shadow:0 -8px 24px rgba(40,25,100,.10);padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.rd-tp{display:flex;align-items:center;gap:6px}
.rd-tp .rd-btn{padding:8px 10px}
.rd-play{width:54px;height:54px;border-radius:16px;border:0;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center}
.rd-scrub{flex:1;min-width:200px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink2)}
.rd-scrub input{flex:1;accent-color:var(--brand);height:28px}
.rd-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rd-file{position:relative;overflow:hidden;cursor:pointer}
.rd-file input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}

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
/* başlık düzeni: masaüstünde tek satır, telefonda başlık alt satırda */
.rd-titlebox{flex:1;min-width:0;order:1}
.rd-titlebox h1{margin:0;font-size:19px;line-height:1.15;font-weight:700;overflow:hidden;text-overflow:ellipsis}
.rd-titlebox p{margin:0;font-size:12.5px;color:var(--ink2)}
.rd-vocabbtn{order:2}
.rd-nowrap{white-space:nowrap}
.rd-vicon{display:none}
@media (max-width:420px){.rd-vlabel{display:none}.rd-vicon{display:inline}}
@media (max-width:620px){
  .rd-app{padding-left:10px;padding-right:10px;gap:10px}
  .rd-titlebox{order:3;flex-basis:100%}
  .rd-home{padding:8px 11px;min-height:42px;font-size:14.5px;gap:6px}
  .rd-btn{padding:7px 10px;font-size:13.5px;min-height:38px}
  .rd-grp>span{display:none}
  .rd-controls{gap:6px 8px}
  .rd-seg button{padding:6px 9px;font-size:13px}
  .rd-tgl{padding:6px 9px;font-size:13px}
  .rd-text{padding:12px 14px 12px}
  .rd-art{padding:10px 10px 2px}
  .rd-foot .rd-btn{white-space:nowrap}
  .rd-bar{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));gap:6px 8px;border-radius:16px 16px 0 0}
  .rd-skip{display:none}
  .rd-tp{gap:5px}
  .rd-play{width:46px;height:46px;border-radius:14px}
  .rd-scrub{order:3;flex-basis:100%;min-width:0;font-size:12px}
  .rd-rate{margin-left:auto}
  .rd-rate button{padding:4px 6px;font-size:11.5px;min-height:30px}
  .rd-vocabbtn{padding:7px 8px;gap:5px}
  .rd-cnt{padding:1px 6px;font-size:12px}
  .rd-brand{gap:6px}
  .rd-top{gap:8px}
  .rd-dots b{font-size:12px}
}
@media (prefers-reduced-motion: reduce){.rd *{transition:none!important;animation:none!important}}

/* sorular */
.rd-quiz{display:flex;flex-direction:column;gap:14px}
.rd-qhead{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--ink2);font-size:14px}
.rd-qdots{display:flex;gap:6px}
.rd-qdots i{width:10px;height:10px;border-radius:50%;background:var(--line);display:block}
.rd-qdots i.on{background:var(--brand);width:26px;border-radius:6px}
.rd-qdots i.done{background:var(--brand);opacity:.45}
.rd-solo .rd-qtext{margin:0;font-size:clamp(22px,5.6vw,30px);line-height:1.3;font-weight:700}
.rd-opts{display:flex;flex-direction:column;gap:10px}
.rd-opt{text-align:left;width:100%;border:2px solid var(--line);background:var(--paper);border-radius:16px;padding:14px 16px;font-size:clamp(17px,4.4vw,21px);font-weight:600;min-height:56px}
.rd-opt:hover:not(:disabled){border-color:var(--brand)}
.rd .rd-opt:disabled{opacity:1;cursor:default}
.rd-opt.good{background:var(--known);border-color:var(--good);color:var(--known-ink)}
.rd-opt.bad{background:#FBE3EA;border-color:var(--bad);color:#7A1B38}
.rd .rd-opt.dim:disabled{opacity:.55}
.rd-qexp{background:var(--sent);border:1.5px solid var(--brand);border-radius:14px;padding:12px 14px;font-size:16px;line-height:1.45}
.rd-qexp b{display:block;margin-bottom:2px}
.rd-wc-mean{font-size:19px;font-weight:700;margin-top:2px}
`
