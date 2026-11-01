// Okuyucunun tüm stilleri. Sınıf adları "rd-" ile başlar, sitenin geri kalanına
// karışmaz. Görsel kaynak: onaylanan okuyucu tasarım taslağı (Kasım 2026).
export const READER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:ital,wght@0,500;0,700;0,800;1,500&display=swap');
.rd{
  --ac:#6D4AFF; --ac2:#8B6CFF; --ink:#24194D; --ink2:#5F5888; --paper:#FFFBF2; --bar:#21154A; --sun:#FFD54A;
  --bg:#EEE9FC; --soft:#F1ECFF; --line:#E4DBFF;
  --sh1:0 1px 0 rgba(36,25,77,.07),0 3px 8px rgba(36,25,77,.08);
  --stack:0 2px 0 #EFE6D2,0 4px 0 #FFF9EE,0 6px 0 #E6DBC3,0 8px 0 #FBF5E8,0 10px 0 #DCCFB4,0 30px 60px rgba(42,27,94,.24),0 10px 20px rgba(42,27,94,.10);
  --head:'Baloo 2','Nunito',system-ui,sans-serif;
  background:var(--bg); color:var(--ink); min-height:100vh; min-height:100dvh;
  font-family:'Nunito',system-ui,'Segoe UI',Roboto,sans-serif; font-weight:700;
  -webkit-tap-highlight-color:transparent; color-scheme:light;
}
.rd *{box-sizing:border-box}
.rd :where(button){font:inherit;color:inherit;cursor:pointer}
.rd button:disabled{opacity:.45;cursor:default}
.rd :focus-visible{outline:3px solid var(--ac);outline-offset:2px}
.rd-i{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;width:20px;height:20px;flex:none}
.rd-app{max-width:1300px;margin:0 auto;padding:max(22px,env(safe-area-inset-top,0px)) 32px 0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;gap:16px}

/* düğmeler */
.rd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:14px;border:0;background:#fff;color:var(--ink);font:800 15px 'Nunito',sans-serif;box-shadow:var(--sh1);transition:transform .15s,box-shadow .15s,background .2s,color .2s;white-space:nowrap;text-decoration:none}
.rd-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 2px 0 rgba(36,25,77,.07),0 10px 20px rgba(36,25,77,.14)}
.rd-btn.pri,.rd-btn.on{background:var(--ac);color:#fff}
.rd-btn.pri{box-shadow:0 3px 0 rgba(0,0,0,.18),0 10px 22px rgba(109,74,255,.35)}
.rd-btn.lg{min-height:52px;font-size:17px;border-radius:16px;padding:0 20px}
.rd-sq{width:44px;height:44px;border-radius:14px;border:0;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--ink);box-shadow:var(--sh1);flex:none}
.rd-sq.pri{background:var(--ac);color:#fff;box-shadow:0 3px 0 rgba(0,0,0,.18),0 8px 18px rgba(109,74,255,.32)}
.rd-link{border:0;background:transparent;color:var(--ink2);font:800 14px 'Nunito',sans-serif;padding:8px 10px;border-radius:10px;text-decoration:underline;text-underline-offset:3px}
.rd-link:hover{color:var(--ac)}
.rd-cnt{min-width:26px;height:26px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;padding:0 7px}
.rd-cnt.k{background:#C9F2E3;color:#0B5E44}
.rd-cnt.l{background:#FFE7A8;color:#6E4A00}
.rd-muted{color:var(--ink2);font-size:14px}
.rd-note{background:#fff;border-radius:16px;padding:12px 16px;font-size:15px;box-shadow:var(--sh1);border-left:5px solid var(--ac)}
.rd-warn{background:#FFF4D6;border-radius:16px;padding:12px 16px;font-size:15px;color:#4A3600;border-left:5px solid #E8B11E}

/* üst sıra */
.rd-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.rd-ttl{display:flex;flex-direction:column;line-height:1.05;margin-left:8px;min-width:0}
.rd-ttl b{font:800 28px var(--head);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-ttl span{font-size:14px;line-height:19px;height:19px;color:var(--ink2);font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-ttl .sv{color:#0B6E50;display:inline-flex;align-items:center;gap:3px;height:19px;vertical-align:top}
.rd-ttl .sv .rd-i{width:14px;height:14px}
.rd-saved{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border-radius:999px;background:#D9F4E8;color:#0B5E44;font-weight:800;font-size:13px;animation:rd-pop .6s cubic-bezier(.3,1.6,.5,1)}
.rd-saved.pv{background:#E9E2FF;color:#4A36B0;animation:none}
.rd-saved .rd-i{width:15px;height:15px}
.rd-pgd{display:flex;gap:6px;align-items:center;margin-left:14px}
.rd-pgd i{display:block;width:10px;height:10px;border-radius:5px;background:#D6CCF7;transition:width .3s,background .3s}
.rd-pgd i.on{width:30px;background:var(--ac)}
.rd-pgd i.past{background:#B3A3F2}
.rd-grow{flex:1}

/* ayar satırı */
.rd-ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.rd-seg{display:inline-flex;align-items:center;background:#fff;border-radius:16px;padding:4px;gap:2px;box-shadow:var(--sh1);flex:none}
.rd-seg .lbl{font-size:12px;font-weight:800;color:#6F6898;padding:0 8px 0 10px}
.rd-seg button{height:36px;border:0;background:transparent;border-radius:12px;padding:0 12px;display:inline-flex;align-items:center;gap:6px;font:800 14px 'Nunito',sans-serif;color:var(--ink2);transition:background .2s,color .2s}
.rd-seg button .rd-i{width:17px;height:17px}
.rd-seg button.on{background:var(--ac);color:#fff;box-shadow:0 4px 12px rgba(109,74,255,.3)}
.rd-tg{flex:none;display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 14px 0 12px;border-radius:16px;border:0;background:#fff;color:var(--ink);font:800 14px 'Nunito',sans-serif;box-shadow:var(--sh1);white-space:nowrap}
.rd-tg .sw{position:relative;width:38px;height:22px;border-radius:11px;background:#DCD5F5;transition:background .25s;flex:none}
.rd-tg .sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .25s cubic-bezier(.3,1.4,.5,1)}
.rd-tg.on .sw{background:var(--ac)}
.rd-tg.on .sw::after{left:19px}
.rd-file{position:relative;overflow:hidden}
.rd-file input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}

/* kitap */
.rd-main{display:grid;grid-template-columns:minmax(0,1fr);gap:22px;align-items:start}
.rd-main.open{grid-template-columns:minmax(0,1fr) 300px}
.rd-book{position:relative}
.rd-book.tabbed{margin-right:44px}
.rd-spread{position:relative;display:grid;grid-template-columns:minmax(0,1fr);background:var(--paper);border-radius:24px;box-shadow:var(--stack)}
.rd-spread.dbl{grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:560px}
.rd-spread.dbl::after{content:"";position:absolute;left:50%;top:0;bottom:0;width:56px;margin-left:-28px;background:linear-gradient(90deg,transparent,rgba(90,60,20,.10) 40%,rgba(90,60,20,.22) 50%,rgba(90,60,20,.10) 60%,transparent);pointer-events:none;z-index:2}
.rd-art{padding:22px 22px 0;display:flex;background:var(--paper);border-radius:24px 24px 0 0}
.rd-spread.dbl .rd-art{padding:26px 24px 26px 26px;border-radius:24px 0 0 24px}
.rd-scene{position:relative;flex:none;width:min(100%,620px);margin:0 auto;aspect-ratio:4/3;border-radius:20px;overflow:hidden;background:#DCEBFF;box-shadow:inset 0 0 0 3px rgba(255,255,255,.55),0 14px 30px rgba(42,27,94,.22),0 2px 6px rgba(42,27,94,.14);isolation:isolate}
.rd-spread.dbl .rd-art{align-items:center}
.rd-spread.dbl .rd-scene{width:100%}
.rd-scene .bg{position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);object-fit:cover;filter:blur(18px) saturate(1.1);opacity:.9;z-index:0}
.rd-scene .fg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0}
.rd-scene::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(110% 70% at 82% 8%,rgba(255,244,190,.55),transparent 55%)}
.rd-scene::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,transparent 58%,rgba(33,21,74,.22))}
.rd-sweep{position:absolute;top:0;bottom:0;left:-60%;width:38%;z-index:2;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.32),transparent);animation:rd-sweep 8s ease-in-out infinite}
.rd-ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--ink2);font-size:15px;z-index:2}
.rd-ph .rd-i{width:40px;height:40px;color:var(--ac2)}
.rd-strip{position:absolute;right:12px;bottom:12px;z-index:3;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;background:rgba(33,21,74,.74);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;font-weight:800;font-size:13px}
.rd-strip .pg{display:flex;gap:4px}
.rd-strip .pg i{display:block;width:7px;height:7px;border-radius:4px;background:rgba(255,255,255,.35);transition:width .3s}
.rd-strip .pg i.on{width:18px;background:var(--sun)}
.rd-text{position:relative;padding:20px 26px 22px;display:flex;flex-direction:column;gap:12px;background:var(--paper);border-radius:0 0 24px 24px;min-height:300px}
.rd-spread.dbl .rd-text{padding:24px 30px 22px 34px;border-radius:0 24px 24px 0}
.rd-flipclone{position:absolute;z-index:8;pointer-events:none;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:var(--paper);box-shadow:0 0 36px rgba(20,10,60,.28);margin:0;will-change:transform}
.rd-rph{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;color:var(--ink2);font-weight:800;font-size:13px;min-height:30px}
.rd-rph .tap{display:inline-flex;align-items:center;gap:6px}
.rd-rph .tap .rd-i{width:16px;height:16px}
.rd-chap{flex:none;background:#FFEFC2;color:#6E4A00;padding:5px 10px;border-radius:8px;letter-spacing:.07em;font-size:12px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-hintw{flex:1;display:flex;align-items:center;justify-content:flex-end;gap:6px}
.rd-hint{white-space:nowrap;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:var(--ink2)}
.rd-hint .rd-i{width:16px;height:16px;color:var(--ac);animation:rd-nudge 1.6s ease-in-out infinite}
.rd-hx{flex:none;width:30px;height:30px;border-radius:9px;border:0;background:var(--soft);color:var(--ink2);display:flex;align-items:center;justify-content:center}
.rd-hx .rd-i{width:15px;height:15px}
.rd-sents{display:flex;flex-direction:column;gap:12px}

/* cümle kartları */
.rd-sc{position:relative;display:flex;gap:10px;align-items:center;width:100%;background:#fff;border:2px solid #EFE6D4;border-radius:18px;padding:12px 12px 12px 16px;box-shadow:0 2px 0 #EADFC9,0 6px 14px rgba(42,27,94,.06);transition:transform .3s cubic-bezier(.3,1.3,.5,1),box-shadow .3s,border-color .3s}
.rd-sc:hover{border-color:#DCD0FF}
.rd-sc.act{border-color:var(--ac2);transform:translateX(8px);box-shadow:0 0 0 5px rgba(139,108,255,.14),0 16px 30px rgba(42,27,94,.16)}
.rd-sb{cursor:pointer;flex:1;min-width:0;display:flex;gap:12px;align-items:flex-start;background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit}
.rd-num{flex:none;width:32px;height:32px;border-radius:11px;background:var(--soft);color:var(--ac);display:flex;align-items:center;justify-content:center;font:800 16px var(--head);margin-top:6px;transition:background .3s,color .3s}
.rd-sc.act .rd-num{background:var(--ac);color:#fff}
.rd-line{font:700 27px/1.5 var(--head);word-spacing:-.18em}
.rd-w{word-spacing:normal;display:inline-block;padding:0 5px;margin:0 1px;border-radius:10px;transition:background .18s,color .18s,transform .22s cubic-bezier(.3,1.6,.5,1),box-shadow .18s}
.rd-w.done{color:var(--ac)}
.rd-w.v{padding:0 7px;margin:0 2px;cursor:pointer;box-shadow:inset 0 -2px 0 #C9BDF5}
.rd-w.learn{background:#FFF0C4;box-shadow:inset 0 0 0 2px #F2CD6E}
.rd-w.known{background:#D9F4E8;box-shadow:inset 0 0 0 2px #93D9BC}
.rd-w.on,.rd-w.v.on{background:var(--sun);color:var(--ink);transform:translateY(-3px) scale(1.07);box-shadow:0 4px 0 #E3B11E,0 10px 16px rgba(255,190,40,.38)}
.rd-tr{display:block;font:italic 500 16px/1.4 'Nunito',sans-serif;color:#8480A0;margin-top:2px}
.rd-lis{flex:none;height:44px;padding:0 12px;border-radius:13px;border:0;background:var(--soft);color:#4A36B0;display:inline-flex;align-items:center;gap:6px;font:800 13px 'Nunito',sans-serif;transition:background .2s,color .2s}
.rd-lis:hover{background:#E4DBFF}
.rd-lis.on{background:var(--ac);color:#fff}
.rd-lis .rd-i{width:18px;height:18px}
.rd-trhint{align-self:flex-start}
.rd-hid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;flex:1;min-height:220px;border:2px dashed #E3D9C3;border-radius:18px;color:var(--ink2);font-weight:800;text-align:center;padding:24px}
.rd-hid .rd-i{width:34px;height:34px;color:var(--ac)}
.rd-pnav{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:6px}

/* şimdi sen söyle + kelime kartı */
.rd-say{position:absolute;left:30px;right:26px;bottom:84px;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:16px 18px;border-radius:22px;background:var(--bar);color:#fff;box-shadow:0 20px 44px rgba(33,21,74,.42);animation:rd-pop .45s cubic-bezier(.3,1.6,.5,1)}
.rd-say .top{display:flex;align-items:center;gap:14px;flex:1 1 230px;min-width:0}
.rd-say .ic{position:relative;flex:none;width:52px;height:52px;border-radius:17px;background:var(--sun);color:var(--ink);display:flex;align-items:center;justify-content:center;animation:rd-ring 1.6s ease-out infinite}
.rd-say .ic .rd-i{width:28px;height:28px}
.rd-say b{display:block;font:800 24px/1.1 var(--head)}
.rd-say small{display:block;color:#CFC7F3;font-size:14px;font-weight:700;margin-top:2px}
.rd-say .acts{display:flex;gap:10px;flex-wrap:wrap}
.rd-say .rd-btn.ghost{background:rgba(255,255,255,.12);color:#fff;box-shadow:none}
.rd-wcard{position:absolute;left:30px;right:26px;bottom:84px;z-index:6;display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:22px;background:#fff;border:2px solid var(--line);box-shadow:0 20px 44px rgba(33,21,74,.28);animation:rd-pop .4s cubic-bezier(.3,1.6,.5,1)}
.rd-wcard .t1{display:flex;align-items:center;gap:10px}
.rd-wcard .t1 b{display:block;font:800 24px/1.1 var(--head)}
.rd-wcard .t1 span{font-size:13px;color:var(--ink2);font-weight:700}
.rd-wcard .mean{font-size:18px;font-weight:800}
.rd-wcard .ex{font-size:15px;color:var(--ink2);font-style:italic;font-weight:500}
.rd-wcard img{width:100%;max-height:150px;object-fit:contain;border-radius:12px;background:var(--paper)}
.rd-wcard .rd-spk{background:var(--soft);box-shadow:none}
.rd-x{margin-left:auto;width:44px;height:44px;border-radius:13px;border:0;background:var(--soft);color:var(--ink);display:flex;align-items:center;justify-content:center;flex:none}

/* kelime paneli */
.rd-etab{position:absolute;right:-44px;top:110px;z-index:6;display:flex;flex-direction:column;align-items:center;gap:10px;width:44px;padding:16px 0;border:0;border-radius:0 16px 16px 0;background:var(--ac);color:#fff;font:800 14px 'Nunito',sans-serif;box-shadow:0 10px 22px rgba(109,74,255,.35);transition:width .2s,right .2s}
.rd-etab:hover{width:50px;right:-50px}
.rd-etab .vt{writing-mode:vertical-rl;letter-spacing:.04em}
.rd-pan{background:#fff;border-radius:24px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 0 rgba(36,25,77,.05),0 18px 40px rgba(42,27,94,.12);animation:rd-slide .45s cubic-bezier(.3,1.3,.5,1);position:sticky;top:16px;max-height:calc(100dvh - 32px)}
.rd-pan h3{margin:0;display:flex;align-items:center;gap:8px;font:800 21px var(--head)}
.rd-pan h3 .rd-i{color:var(--ac)}
.rd-pan .rd-seg{align-self:flex-start}
.rd-pan .rd-seg button{padding:0 10px;font-size:13px}
.rd-vlist{display:flex;flex-direction:column;gap:10px;overflow-y:auto;min-height:0;margin:0 -4px;padding:0 4px 4px}
.rd-vw{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:#F8F5FF;border:2px solid transparent;transition:border-color .2s,background .2s}
.rd-vw.here{background:#fff;border-color:var(--line);box-shadow:0 6px 16px rgba(42,27,94,.08)}
.rd-vt1{display:flex;align-items:center;gap:10px}
.rd-vt1 .t{flex:1;min-width:0}
.rd-vt1 .t b{display:block;font:800 19px/1.1 var(--head)}
.rd-vt1 .t span{font-size:13px;color:var(--ink2);font-weight:700}
.rd-spk{flex:none;width:44px;height:44px;border-radius:13px;border:0;background:#fff;color:var(--ac);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 #E6DFFA}
.rd-vw:not(.here) .rd-spk{background:#fff}
.rd-ref{flex:none;font-size:11px;font-weight:800;color:#4A36B0;background:#EEE8FF;padding:3px 8px;border-radius:7px}
.rd-mean{font-weight:700;font-size:15px}
.rd-vb{display:flex;gap:8px}
.rd-mk{flex:1;height:44px;border-radius:13px;border:0;display:flex;align-items:center;justify-content:center;gap:6px;background:#EEE8FF;color:#4A36B0;font:800 13px 'Nunito',sans-serif;transition:transform .2s,background .2s,color .2s}
.rd-mk .rd-i{width:17px;height:17px}
.rd-mk:hover{transform:scale(1.03)}
.rd-mk.on.k{background:#22A57B;color:#fff}
.rd-mk.on.l{background:#F0B429;color:#3A2800}
.rd-mk.ghost{flex:0 0 auto;padding:0 12px;background:#F4F1FA;color:var(--ink2)}
.rd-legend{display:flex;gap:12px;font-size:12px;font-weight:800;color:var(--ink2);flex-wrap:wrap}
.rd-legend i{display:inline-block;width:18px;height:12px;border-radius:4px;margin-right:5px;vertical-align:middle}
.rd-legend i.k{background:#D9F4E8;box-shadow:inset 0 0 0 2px #93D9BC}
.rd-legend i.l{background:#FFF0C4;box-shadow:inset 0 0 0 2px #F2CD6E}
.rd-empty{color:var(--ink2);text-align:center;padding:20px 8px;font-size:14px}
.rd-scrim{position:fixed;inset:0;background:rgba(20,10,60,.42);z-index:40;animation:rd-fade .2s}
.rd-pan.drawer{position:fixed;top:0;bottom:0;right:0;width:min(380px,92vw);max-height:none;z-index:50;border-radius:24px 0 0 24px;padding:calc(18px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))}

/* ses çubuğu */
.rd-bar{position:sticky;bottom:16px;z-index:20;margin-top:auto;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--bar);color:#fff;border-radius:28px;padding:12px 18px;box-shadow:0 3px 0 #120A2E,0 22px 46px rgba(33,21,74,.38)}
.rd-ib{height:44px;min-width:44px;padding:0 10px;border-radius:14px;border:0;background:rgba(255,255,255,.09);color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:6px;font:800 14px 'Nunito',sans-serif;transition:background .2s}
.rd-ib:hover:not(:disabled){background:rgba(255,255,255,.18)}
.rd-ib.lbl{padding:0 14px;height:48px;font-size:15px}
.rd-ib.on{background:var(--sun);color:var(--ink)}
.rd-play{position:relative;flex:none;width:66px;height:66px;border-radius:50%;border:0;background:var(--ac2);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(139,108,255,.22),0 12px 26px rgba(0,0,0,.35);transition:transform .2s}
.rd-play:hover{transform:scale(1.05)}
.rd-play svg{width:28px;height:28px}
.rd-play.on{animation:rd-pulse 1.8s ease-out infinite}
.rd-trk{flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px}
.rd-segs{display:flex;gap:6px}
.rd-sg{height:10px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden;border:0;padding:0;min-width:8px}
.rd-sg i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#8B6CFF,#C4B5FF);transition:width .2s linear}
.rd-sg.act{box-shadow:0 0 0 2px rgba(255,213,74,.55)}
.rd-tmr{display:flex;justify-content:space-between;align-items:center;font:800 13px 'Nunito',sans-serif;color:#CFC7F3;font-variant-numeric:tabular-nums;gap:8px}
.rd-tmr>span{display:inline-flex;align-items:center}
.rd-eq{display:inline-flex;gap:3px;align-items:flex-end;height:16px;margin-right:8px}
.rd-eq span{display:block;width:3px;height:16px;border-radius:2px;background:var(--sun);transform-origin:bottom;transform:scaleY(.3)}
.rd-eq.on span{animation:rd-eq .9s ease-in-out infinite}
.rd-eq.on span:nth-child(2){animation-delay:-.3s}
.rd-eq.on span:nth-child(3){animation-delay:-.6s}
.rd-eq.on span:nth-child(4){animation-delay:-.15s}
.rd-spd{display:inline-flex;background:rgba(255,255,255,.08);border-radius:14px;padding:3px}
.rd-spd button{height:38px;border:0;background:transparent;color:#CFC7F3;border-radius:11px;padding:0 10px;font:800 14px 'Nunito',sans-serif}
.rd-spd button.on{background:#fff;color:var(--bar)}
.rd-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;background:rgba(255,213,74,.16);color:var(--sun);font-weight:800;font-size:13px}
.rd-chip .rd-i{width:16px;height:16px}
.rd-bar .msg{color:#CFC7F3;font-size:14px}
.rd-bar .qlbl{margin-left:auto;font-weight:800;font-size:14px;color:#CFC7F3}

/* soru ve bölüm sonu */
.rd-solo{position:relative;background:var(--paper);border-radius:24px;box-shadow:var(--stack);padding:28px 24px;display:flex;flex-direction:column;overflow:hidden}
.rd-qbox{width:100%;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:14px;flex:1}
.rd-qh{display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:14px;color:var(--ink2)}
.rd-qdots{display:flex;gap:6px}
.rd-qdots i{display:block;width:10px;height:10px;border-radius:5px;background:#E2D9FA;transition:width .3s,background .3s}
.rd-qdots i.on{width:28px;background:var(--ac)}
.rd-qdots i.ok{background:#22A57B}
.rd-qdots i.no{background:#E8553B}
.rd-badge{align-self:center;width:84px;height:84px;border-radius:26px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 0 #EADFC9,0 10px 22px rgba(42,27,94,.12);animation:rd-bob 3s ease-in-out infinite;color:var(--ac)}
.rd-badge img{width:100%;height:100%;object-fit:cover}
.rd-badge .rd-i{width:40px;height:40px}
.rd-qt{margin:0;text-align:center;font:800 30px/1.2 var(--head);animation:rd-pop .45s cubic-bezier(.3,1.6,.5,1)}
.rd-opts{display:flex;flex-direction:column;gap:10px}
.rd-op{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:8px 14px 8px 8px;border-radius:18px;border:2px solid #EFE6D4;background:#fff;color:var(--ink);font:800 20px var(--head);text-align:left;box-shadow:0 3px 0 #EADFC9;transition:transform .2s,border-color .2s,background .2s,opacity .2s,box-shadow .2s}
.rd-op:hover:not(:disabled){transform:translateY(-1px);border-color:#DCD0FF}
.rd .rd-op:disabled{opacity:1;cursor:default}
.rd-op .lt{flex:none;width:40px;height:40px;border-radius:13px;background:var(--soft);color:var(--ac);display:flex;align-items:center;justify-content:center;font:800 17px var(--head)}
.rd-op .mk{margin-left:auto;display:flex}
.rd-op.reading{border-color:var(--ac2);box-shadow:0 0 0 5px rgba(139,108,255,.16),0 3px 0 #EADFC9}
.rd-op.good{border-color:#22A57B;background:#E6F8F0;box-shadow:0 3px 0 #9FDCC3;animation:rd-yay .5s cubic-bezier(.3,1.6,.5,1)}
.rd-op.good .lt{background:#22A57B;color:#fff}
.rd-op.good .mk{color:#22A57B}
.rd-op.bad{border-color:#E8553B;background:#FFECE6;box-shadow:0 3px 0 #F5B3A2;animation:rd-nope .4s ease}
.rd-op.bad .lt{background:#D04026;color:#fff}
.rd-op.bad .mk{color:#D04026}
.rd .rd-op.dim{opacity:.5}
.rd-exp{border-radius:18px;padding:12px 14px;background:#fff;border:2px solid var(--line);font-size:16px;line-height:1.45;font-weight:700;animation:rd-pop .4s cubic-bezier(.3,1.6,.5,1)}
.rd-exp b{display:block;font:800 19px var(--head);margin-bottom:2px}
.rd-res{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;max-width:520px;margin:0 auto;width:100%}
.rd-res h2{margin:0;font:800 26px var(--head)}
.rd-res .big{font:800 64px/1 var(--head);color:var(--ac);animation:rd-pop .5s cubic-bezier(.3,1.6,.5,1)}
.rd-res p{margin:0;font-size:16px;font-weight:700;color:var(--ink2);line-height:1.45}
.rd-res .acts{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px}
.rd-res .more{display:flex;flex-wrap:wrap;justify-content:center;gap:2px}
.rd-stars{display:flex;gap:8px}
.rd-stars svg{width:44px;height:44px;animation:rd-pop .5s cubic-bezier(.3,1.6,.5,1) both}
.rd-stars svg:nth-child(2){animation-delay:.12s}
.rd-stars svg:nth-child(3){animation-delay:.24s}
.rd-conf{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.rd-conf i{position:absolute;top:-20px;width:10px;height:14px;border-radius:3px;animation:rd-fall 2.6s linear infinite}

/* kitap listesi */
.rd-lhd{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.rd-lhd .hi{display:flex;flex-direction:column;line-height:1.05;min-width:0}
.rd-lhd .hi b{font:800 32px var(--head)}
.rd-lhd .hi span{font-size:15px;color:var(--ink2)}
.rd-shelf{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));padding-bottom:36px}
.rd-bk{display:flex;gap:18px;align-items:stretch;text-align:left;width:100%;background:#fff;border:0;border-radius:24px;padding:16px;box-shadow:0 2px 0 rgba(36,25,77,.05),0 18px 40px rgba(42,27,94,.12);transition:transform .2s,box-shadow .2s}
.rd-bk:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 2px 0 rgba(36,25,77,.05),0 24px 48px rgba(42,27,94,.18)}
.rd .rd-bk:disabled{opacity:1}
.rd-bk.locked{background:#F7F4FD;box-shadow:none}
.rd-bk.locked .rd-cover,.rd-bk.locked .bd{opacity:.55}
.rd-cover{position:relative;width:118px;height:156px;border-radius:14px;flex:none;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font:800 44px var(--head);box-shadow:0 2px 0 #EFE6D2,0 4px 0 #FFF9EE,0 6px 0 #E6DBC3,0 12px 22px rgba(42,27,94,.2)}
.rd-cover img{width:100%;height:100%;object-fit:cover;display:block}
.rd-lock{position:absolute;right:-6px;top:-6px;width:40px;height:40px;border-radius:14px;background:var(--bar);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(33,21,74,.3)}
.rd-bkw{position:relative;flex:none}
.rd-bk .bd{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;justify-content:center}
.rd-bk .h{display:block;font:800 25px/1.1 var(--head)}
.rd-bk .meta{font-size:13.5px;color:var(--ink2)}
.rd-cta{white-space:nowrap;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:0 16px;border-radius:14px;background:var(--ac);color:#fff;font:800 15px 'Nunito',sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.18),0 10px 22px rgba(109,74,255,.32);margin-top:6px}
.rd-cta.off{background:#E9E2FF;color:#4A36B0;box-shadow:none}
.rd-where{font-size:13.5px;color:var(--ink2);display:inline-flex;align-items:center;gap:5px}
.rd-where .rd-i{width:15px;height:15px;color:var(--ac)}

/* içerik kontrolü */
.rd-issues{display:flex;flex-direction:column;gap:10px;padding-bottom:30px}
.rd-issue{background:#fff;border-radius:14px;padding:10px 12px;box-shadow:var(--sh1)}
.rd-issue.hata{border-left:6px solid #C2325B}
.rd-issue.uyari{border-left:6px solid #E8A21A}
.rd-issue small{display:block;color:var(--ink2);font-size:12.5px;margin-bottom:2px}
.rd-issue .tag{display:inline-block;border-radius:8px;padding:0 8px;font-size:12px;margin-right:6px}
.rd-issue.hata .tag{background:#FBD9E3;color:#C2325B}
.rd-issue.uyari .tag{background:#FFEBC2;color:#7A4B00}
.rd-ok{background:#D9F4E8;color:#0B5E44;border-radius:14px;padding:14px;font-size:17px}

.rd-toast{position:fixed;left:50%;bottom:calc(var(--rd-barh,110px) + 24px);transform:translate(-50%,20px);background:var(--bar);color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:60;max-width:92vw;text-align:center}
.rd-toast.on{opacity:1;transform:translate(-50%,0)}

@media (max-width:1049px){.rd-main.open{grid-template-columns:minmax(0,1fr)}}

/* Canlı ders şeridi: okuma ekranı açıkken ses çubuğunun üstünde durur, düğmeleri kapatmaz */
body:has(.rd-app.reading) .nc-live-banner{bottom:calc(var(--rd-barh,0px) + 28px)!important}
@media (max-width:699px){
  body:has(.rd-app.reading) .nc-live-banner{bottom:calc(var(--rd-barh,0px) + 10px)!important}
  body:has(.nc-live-banner) .rd-say,body:has(.nc-live-banner) .rd-wcard{bottom:calc(var(--rd-barh,150px) + 76px)}
}

/* ─── telefon ─── */
@media (max-width:699px){
  .rd-app{padding:max(14px,env(safe-area-inset-top,0px)) 14px 0;gap:12px}
  .rd-app.reading{height:100vh;height:100dvh;min-height:0;padding:0;gap:0;overflow:hidden}
  .rd-app.reading .rd-hd{padding:max(14px,env(safe-area-inset-top,0px)) 14px 8px;gap:10px;flex-wrap:nowrap}
  .rd-ttl{flex:1;margin-left:2px}
  .rd-ttl b{font-size:22px}
  .rd-ttl span{font-size:12.5px}
  .rd-app.reading .rd-hd{gap:8px}
  .rd-hd .rd-btn.wb .rd-cnt{min-width:22px}
  .rd-hd .rd-btn.wb{padding:0 10px;gap:5px}
  .rd-hd .rd-btn.wb .rd-cnt{min-width:24px;height:24px;font-size:12px;padding:0 6px}
  .rd-ctl{flex-wrap:nowrap;overflow-x:auto;gap:8px;padding:2px 14px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .rd-ctl::-webkit-scrollbar{display:none}
  .rd-seg .lbl{display:none}
  .rd-seg{border-radius:15px}
  .rd-seg button{padding:0 10px;font-size:13px;border-radius:11px}
  .rd-tg{height:44px;padding:0 12px 0 10px;gap:8px;border-radius:15px}
  .rd-tg .sw{width:34px;height:20px;border-radius:10px}
  .rd-tg .sw::after{width:14px;height:14px}
  .rd-tg.on .sw::after{left:17px}
  .rd-app.reading .rd-main{flex:1;min-height:0;margin:0 12px;display:flex;flex-direction:column;align-items:stretch}
  .rd-app.reading .rd-book{flex:1;min-height:0;display:flex;flex-direction:column}
  .rd-app.reading .rd-spread{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 2px 0 #EFE6D2,0 4px 0 #FFF9EE,0 6px 0 #E6DBC3,0 18px 36px rgba(42,27,94,.22)}
  .rd-art{padding:10px 10px 0}
  .rd-app.reading .rd-art{flex:none}
  .rd-scene{width:100%;aspect-ratio:auto;height:clamp(180px,29dvh,250px);border-radius:18px}
  .rd-strip{right:8px;bottom:8px;padding:6px 10px;border-radius:11px;font-size:12px}
  .rd-text{padding:12px 12px 14px;gap:10px;min-height:0}
  .rd-app.reading .rd-text{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .rd-sents{gap:10px}
  .rd-chap{font-size:11px;padding:5px 9px}
  .rd-sc{gap:6px;border-radius:16px;padding:8px 8px 8px 12px;box-shadow:0 2px 0 #EADFC9,0 5px 12px rgba(42,27,94,.06)}
  .rd-sc.act{transform:translateX(4px);box-shadow:0 0 0 4px rgba(139,108,255,.14),0 12px 24px rgba(42,27,94,.14)}
  .rd-sb{gap:10px}
  .rd-num{width:28px;height:28px;border-radius:10px;font-size:14px;margin-top:4px}
  .rd-line{font-size:22px;line-height:1.45;word-spacing:-.15em}
  .rd-w{padding:0 4px;border-radius:9px}
  .rd-w.v{padding:0 6px}
  .rd-w.on,.rd-w.v.on{transform:translateY(-2px) scale(1.06);box-shadow:0 3px 0 #E3B11E,0 8px 14px rgba(255,190,40,.38)}
  .rd-tr{font-size:15px}
  .rd-lis{width:44px;padding:0;justify-content:center}
  .rd-lis span{display:none}
  .rd-pnav .rd-btn{min-height:42px;padding:0 12px;font-size:14px}
  .rd-say,.rd-wcard{position:fixed;left:12px;right:12px;bottom:calc(var(--rd-barh,150px) + 10px);z-index:30}
  .rd-say{flex-direction:column;align-items:stretch;gap:12px;padding:14px}
  .rd-say .top{gap:12px;flex:none}
  .rd-say .ic{width:48px;height:48px;border-radius:16px}
  .rd-say .ic .rd-i{width:26px;height:26px}
  .rd-say b{font-size:22px}
  .rd-say small{font-size:13px}
  .rd-say .acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .rd-say .acts .rd-btn{min-height:48px;font-size:15px;padding:0 10px}
  .rd-say .acts .rd-btn.pri{background:var(--ac2);box-shadow:0 3px 0 rgba(0,0,0,.25)}
  .rd-bar{position:relative;bottom:auto;margin:10px 0 0;border-radius:26px 26px 0 0;padding:12px 16px calc(18px + env(safe-area-inset-bottom,0px));flex-direction:column;align-items:stretch;gap:10px;flex-wrap:nowrap;box-shadow:0 -10px 30px rgba(33,21,74,.25)}
  .rd-segs{gap:5px}
  .rd-sg{height:8px;border-radius:4px}
  .rd-tmr{font-size:12px}
  .rd-ctr{display:flex;align-items:center;justify-content:space-between;gap:6px}
  .rd-ctr .rd-ib{padding:0 8px;font-size:13px}
  .rd-play{width:64px;height:64px}
  .rd-bar.q{flex-direction:row;align-items:center;padding:14px 16px calc(20px + env(safe-area-inset-bottom,0px))}
  .rd-app.reading .rd-solo{flex:1;min-height:0;overflow-y:auto;padding:20px 16px 18px;box-shadow:0 2px 0 #EFE6D2,0 4px 0 #FFF9EE,0 6px 0 #E6DBC3,0 18px 36px rgba(42,27,94,.22)}
  .rd-app.reading .rd-note{margin:0 12px 10px}
  .rd-qt{font-size:28px}
  .rd-lhd .hi b{font-size:26px}
  .rd-shelf{grid-template-columns:minmax(0,1fr);gap:14px}
  .rd-bk{gap:14px;padding:14px;border-radius:22px}
  .rd-cover{width:92px;height:122px;font-size:36px}
  .rd-bk .h{font-size:22px}
  .rd-cta{min-height:44px;font-size:14px;padding:0 14px}
}
@media (max-width:380px){
  .rd-ctr .rd-ib{min-width:40px;padding:0 6px}
  .rd-play{width:58px;height:58px}
}

@keyframes rd-sweep{0%,62%{left:-60%}100%{left:130%}}
@keyframes rd-pop{from{transform:translateY(18px) scale(.8);opacity:0}to{transform:none;opacity:1}}
@keyframes rd-ring{0%{box-shadow:0 0 0 0 rgba(255,213,74,.65)}100%{box-shadow:0 0 0 18px rgba(255,213,74,0)}}
@keyframes rd-pulse{0%{box-shadow:0 0 0 0 rgba(139,108,255,.55),0 12px 26px rgba(0,0,0,.35)}100%{box-shadow:0 0 0 22px rgba(139,108,255,0),0 12px 26px rgba(0,0,0,.35)}}
@keyframes rd-eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@keyframes rd-slide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
@keyframes rd-fade{from{opacity:0}to{opacity:1}}
@keyframes rd-nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(-4px)}}
@keyframes rd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes rd-yay{0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}}
@keyframes rd-nope{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes rd-fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(760px) rotate(540deg)}}
@media (prefers-reduced-motion:reduce){.rd *,.rd *::before,.rd *::after{animation:none!important;transition:none!important}}
`
