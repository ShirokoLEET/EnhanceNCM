(function (root) {
  "use strict";
  root.EnhanceNCM._musicStyles = `
    :host { font:.875rem/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","Microsoft YaHei",sans-serif; color:#252528; --accent:#d92d4c; --secondary:#76767c; --line:#e9e9ed; --surface:#fff; --hover:#f1f1f4; --sidebar:#f3f3f6; --fill:0%; color-scheme:light; }
    *,*::before,*::after { box-sizing:border-box; }
    [hidden] { display:none!important; }
    button,input { font:inherit; -webkit-tap-highlight-color:transparent; }
    button { color:inherit; cursor:pointer; -webkit-app-region:no-drag; border:0; background:none; transition:background-color 140ms ease-out,color 140ms ease-out,transform 100ms ease-out; }
    button:disabled { opacity:.4; cursor:default; }
    button:not(:disabled):active { transform:scale(.97); }
    button:focus-visible,input:focus-visible,main:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
    svg { width:20px; height:20px; flex-shrink:0; vertical-align:middle; }
    button svg { pointer-events:none; }
    .personal-section { margin:28px 0; }
    .personal-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
    .personal-card { text-align:left; padding:22px 18px; border-radius:14px; background:var(--surface); border:1px solid var(--line); }
    .personal-card:hover { background:var(--hover); }
    .personal-card strong,.personal-card small { display:block; }
    .personal-card strong { font-size:16px; letter-spacing:-.02em; margin:15px 0 5px; }
    .personal-card small { color:var(--secondary); line-height:1.6; }
    .personal-icon { display:grid; place-items:center; width:42px; height:42px; border-radius:12px; color:#fff; background:#d92d4c; }
    .personal-radar .personal-icon { background:#7761b5; } .personal-roaming .personal-icon { background:#347b91; } .personal-heartmode .personal-icon { background:#ba6489; }
    .personal-icon svg { width:23px; height:23px; }
    .recommendation-actions { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 0 18px; }
    @media(max-width:1100px) { .personal-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media(max-width:600px) { .personal-card { padding:16px 12px; } .recommendation-actions { align-items:flex-start; flex-direction:column; } }
    h1,h2,h3,p { margin:0; }
    h1 { font-size:2rem; font-weight:750; line-height:1.2; letter-spacing:-.035em; }
    h2 { font-size:1.3125rem; line-height:1.3; font-weight:700; letter-spacing:-.025em; }
    .app { display:grid; grid-template-columns:220px minmax(0,1fr); grid-template-rows:36px minmax(0,1fr) 96px; height:100vh; height:100dvh; overflow:hidden; background:#fafafa; }
    .sidebar { display:flex; flex-direction:column; padding:34px 16px 22px; background:var(--sidebar); border-right:1px solid #e2e2e7; overflow:auto; }
    .brand { display:flex; align-items:center; gap:11px; padding:0 12px 32px; font-size:1.5625rem; font-weight:750; letter-spacing:-.04em; line-height:1.15; }
    .brand>span:last-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .brand-icon { color:var(--accent); }
    .brand-icon svg { width:33px; height:33px; stroke-width:2; }
    .nav-label { font-size:0.6875rem; font-weight:650; letter-spacing:.04em; color:#84848b; margin:18px 12px 7px; }
    .nav-item { width:100%; min-height:39px; display:flex; align-items:center; gap:11px; padding:8px 12px; margin:2px 0; border-radius:7px; text-align:left; font-size:0.8125rem; }
    .nav-item>svg { color:var(--accent); width:18px; height:18px; }
    .nav-item>span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .nav-item:hover { background:#e9e9ee; }
    .nav-item.selected { color:white; background:var(--accent); font-weight:600; }
    .nav-item.selected>svg { color:white; }
    .playlist-label { display:flex; align-items:center; justify-content:space-between; margin-right:0; margin-top:29px; }
    .playlist-label .icon-button { width:28px; height:28px; }
    .playlist-label svg { width:15px; height:15px; }
    .playlist-link { color:#68686d; font-size:0.75rem; }
    .playlist-link>svg { color:#8e8e95; }
    #sidebar-created { max-height:210px; overflow:auto; flex-shrink:0; scrollbar-width:thin; }
    .account-line { display:flex; align-items:center; gap:5px; }
    #account-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; font-size:.6875rem; }
    .account-line .icon-button { width:27px; height:27px; }
    .account-line svg { width:14px; height:14px; }
    .created-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:28px 20px; margin-top:24px; }
    .list-actions { display:flex; align-items:center; gap:8px; }
    .library-status { font-size:.8125rem; color:var(--secondary); padding:18px 0; }
    .load-more { margin-top:24px; }
    @media(max-width:1100px) { .created-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
    @media(max-width:700px) { .created-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px 12px; } #sidebar-created { display:none; } #created-heading { font-size:1.5rem; } }
    .sidebar-bottom { margin-top:auto; padding:50px 12px 0; font-size:0.625rem; color:var(--secondary); }
    .sidebar-bottom small { display:block; font-size:0.6875rem; margin-top:9px; color:#96969c; }
    .workspace { min-width:0; min-height:0; position:relative; display:flex; flex-direction:column; }
    .window-bar { grid-column:1/-1; display:flex; align-items:center; min-width:0; height:36px; background:var(--sidebar); user-select:none; }
    #shell-status { font-size:.625rem; color:var(--secondary); margin-left:auto; padding:0 10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .window-actions { display:flex; align-items:center; flex-shrink:0; height:100%; gap:4px; padding-right:10px; }
    .window-actions .icon-button { width:32px; height:30px; border-radius:4px; color:var(--secondary); }
    .window-actions .icon-button svg { width:16px; height:16px; }
    .window-actions .original-button { width:32px; height:30px; padding:0; justify-content:center; border-radius:4px; }
    .window-actions .original-button:hover { background:#80808025; }
    .window-buttons { display:flex; flex-shrink:0; height:100%; margin-left:0; }
    .window-button { width:44px; height:36px; padding:10px 14px; display:grid; place-items:center; border-radius:0; }
    .window-button svg { width:16px; height:16px; stroke:currentColor; stroke-width:1.5; fill:none; }
    .window-button:hover { background:#80808025; }
    #window-close:hover { background:#c42b1c; color:white; }
    .window-button:active { transform:none!important; }
    .resize-handles { position:fixed; inset:0; pointer-events:none; z-index:10; }
    .resize-handles>div { position:absolute; pointer-events:auto; user-select:none; }
    [data-resize="topleft"] { top:0; left:0; width:7px; height:7px; cursor:nwse-resize; }
    [data-resize="topright"] { top:0; right:0; width:7px; height:7px; cursor:nesw-resize; }
    [data-resize="bottomleft"] { bottom:0; left:0; width:9px; height:9px; cursor:nesw-resize; }
    [data-resize="bottomright"] { bottom:0; right:0; width:9px; height:9px; cursor:nwse-resize; }
    [data-resize="right"] { top:7px; right:0; bottom:9px; width:4px; cursor:ew-resize; }
    .toolbar { height:68px; flex-shrink:0; display:flex; align-items:center; gap:16px; padding:0 36px; background:rgba(250,250,250,.88); backdrop-filter:blur(24px) saturate(160%); z-index:2; }
    .toolbar::after { content:""; position:absolute; top:68px; left:0; right:0; height:12px; background:linear-gradient(#fafafacc,transparent); pointer-events:none; }
    .toolbar-title { font-size:0.75rem; font-weight:600; color:var(--secondary); margin-right:auto; white-space:nowrap; }
    .search { display:flex; align-items:center; gap:8px; width:240px; padding:7px 10px; border-radius:7px; background:#ededf0; color:#86868c; }
    .search:focus-within { box-shadow:0 0 0 2px var(--accent); }
    .search svg { width:15px; height:15px; }
    .search input { background:none; width:100%; min-width:0; border:0; outline:none; font-size:0.75rem; color:#34343a; }
    .search input:focus-visible { outline:none; }
    .search input::placeholder { color:#808087; }
    .icon-button { display:inline-flex; justify-content:center; align-items:center; flex-shrink:0; width:34px; height:34px; border-radius:6px; padding:6px; color:#6e6e75; }
    .icon-button:hover:not(:disabled) { background:var(--hover); color:var(--accent); }
    .icon-button[aria-pressed="true"],.icon-button[aria-expanded="true"] { color:var(--accent); background:#d92d4c0d; }
    .favorite[aria-pressed="true"] svg,#now-favorite[aria-pressed="true"] svg { fill:currentColor; }
    .original-button { display:flex; align-items:center; gap:6px; font-size:0.6875rem; color:var(--secondary); white-space:nowrap; padding:8px 0 8px 8px; }
    .original-button svg { width:15px; height:15px; }
    .original-button:hover { color:var(--accent); }
    main { overflow:auto; min-height:0; padding:22px 36px 38px; scrollbar-width:thin; scrollbar-color:#c8c8ce transparent; scroll-behavior:auto; }
    .page-heading { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:25px; gap:12px; }
    .eyebrow { color:var(--secondary); font-size:0.6875rem; font-weight:550; letter-spacing:.035em; margin-bottom:7px; }
    .date { font-size:0.6875rem; color:#88888f; padding-bottom:4px; white-space:nowrap; }
    .editorial-grid { display:grid; grid-template-columns:minmax(0,1.8fr) minmax(0,1fr); gap:20px; margin-bottom:31px; }
    .hero { position:relative; overflow:hidden; border-radius:12px; min-height:280px; text-align:left; isolation:isolate; }
    .hero-primary { background:#eed8c9; color:#503630; display:flex; align-items:center; }
    .hero-copy { padding:29px; position:relative; z-index:2; pointer-events:none; }
    .hero-kicker { display:block; font-size:0.625rem; letter-spacing:.12em; font-weight:650; }
    .hero-copy h2 { font-size:clamp(25px,2.4vw,37px); font-weight:750; letter-spacing:-.045em; line-height:1.33; margin:16px 0 10px; }
    .hero-copy p { color:#7c6055; font-size:0.6875rem; }
    .hero-button { display:inline-flex; align-items:center; gap:5px; border-radius:6px; background:#fff9; padding:8px 14px; margin-top:22px; font-size:0.6875rem; font-weight:650; pointer-events:auto; }
    .hero-button:hover:not(:disabled) { background:#fff; }
    .hero-button svg { width:15px; height:15px; }
    .record-art { position:absolute; right:-60px; top:50%; width:330px; height:230px; transform:translateY(-50%) rotate(-12deg); z-index:0; }
    .sleeve { position:absolute; left:0; width:220px; height:230px; padding:16px; z-index:1; background:#c66143; box-shadow:0 12px 23px #59301b25; overflow:hidden; }
    .sleeve>span { position:relative; z-index:2; color:#f8eacb; font-size:1.75rem; font-weight:850; letter-spacing:-.06em; line-height:.95; }
    .sleeve>small { position:absolute; bottom:12px; left:16px; font-size:0.3125rem; letter-spacing:.14em; color:#ffe1c4; }
    .sleeve-sun { position:absolute; width:170px; height:170px; border-radius:50%; right:-12px; bottom:-9px; background:repeating-linear-gradient(0deg,transparent 0 6px,#b54d3933 6px 8px),#f1b35e; }
    .sleeve-sun::after { content:""; position:absolute; width:140px; height:200px; border-radius:50%; background:#cc503e; top:50px; left:-90px; }
    .vinyl { position:absolute; width:222px; height:222px; left:132px; top:4px; border-radius:50%; background:repeating-radial-gradient(circle,#242321 0 1px,#33312e 2px 3px,#242321 4px 5px); box-shadow:5px 12px 20px #50311c25; display:grid; place-items:center; }
    .vinyl-label { width:71px; height:71px; background:#d39c64; border-radius:50%; display:grid; place-items:center; color:#49372b; }
    .vinyl-label::after { content:""; position:absolute; width:6px; height:6px; background:#eed8c9; border-radius:50%; }
    .vinyl-label svg { width:27px; height:27px; opacity:.4; }
    .hero-secondary { background:#e7e9f4; color:#494e74; padding:25px; display:flex; flex-direction:column; align-items:flex-start; }
    .secondary-title { font-size:1.5625rem; font-weight:750; line-height:1.4; letter-spacing:-.04em; margin-top:17px; position:relative; z-index:1; }
    .favorite-art { position:absolute; right:10px; bottom:44px; transform:rotate(-15deg); color:#9c9fcd; }
    .favorite-art svg { width:123px; height:123px; stroke-width:.8; fill:#b7b9dd; filter:drop-shadow(0 10px 12px #6667a52b); }
    .secondary-bottom { margin-top:auto; display:flex; align-items:center; justify-content:space-between; width:100%; font-size:0.6875rem; padding-top:24px; position:relative; z-index:1; }
    .secondary-bottom svg { width:16px; height:16px; }
    .section-heading { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:17px; }
    .text-button { color:var(--accent); display:inline-flex; align-items:center; gap:2px; font-size:0.6875rem; white-space:nowrap; padding:5px 0; }
    .text-button svg { width:13px; height:13px; }
    .album-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:18px; }
    .album-card { min-width:0; text-align:left; padding:0; }
    .album-art { display:block; position:relative; }
    .cover { position:relative; display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; flex-shrink:0; border-radius:5px; background:linear-gradient(140deg,#e7d7d1,#d7c3c8); color:#b07b86; overflow:hidden; }
    .cover img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .album-art>.cover { width:100%; height:auto; aspect-ratio:1; border-radius:8px; box-shadow:0 4px 10px #2826340a; }
    .album-art .cover>svg { width:30%; height:30%; }
    .album-card:nth-child(3n+2) .cover { background:linear-gradient(140deg,#d3dad2,#a9bcb4); color:#6d8d79; }
    .album-card:nth-child(3n) .cover { background:linear-gradient(140deg,#d5dbe8,#a7acc6); color:#747c9e; }
    .album-card>strong,.album-card>small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .album-card>strong { margin-top:9px; font-size:0.75rem; font-weight:550; }
    .album-card>small { color:var(--secondary); font-size:0.6875rem; margin-top:2px; }
    .album-play { position:absolute; bottom:10px; right:10px; display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:#fffe; color:var(--accent); opacity:0; transition:opacity 150ms ease-out; }
    .album-card:hover .album-play,.album-card:focus-visible .album-play { opacity:1; }
    .track-section { margin-top:32px; }
    #discover[hidden]~.track-section { margin-top:8px; }
    .track-section>.section-heading { padding-top:22px; border-top:1px solid var(--line); }
    #discover[hidden]~.track-section>.section-heading { border-top:0; padding-top:0; }
    #discover[hidden]~.track-section h2 { font-size:1.875rem; }
    .section-detail { font-size:0.6875rem; color:var(--secondary); margin-top:6px; }
    .soft-button { background:#f9e8ec; color:var(--accent); border-radius:6px; display:inline-flex; align-items:center; gap:5px; font-size:0.75rem; font-weight:600; padding:8px 13px; white-space:nowrap; }
    .soft-button:hover:not(:disabled) { background:#f3d5de; }
    .soft-button svg { width:15px; height:15px; }
    .notice { position:absolute; bottom:16px; left:20px; right:20px; z-index:4; max-width:680px; margin:0 auto; padding:11px 14px; background:var(--surface); border:1px solid var(--line); border-radius:9px; box-shadow:0 4px 20px #24243615; font-size:0.75rem; display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .notice.error { color:#ac374c; background:#fcf0f2; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th { text-align:left; font-weight:450; font-size:0.625rem; color:#8c8c94; padding:8px 12px; border-bottom:1px solid var(--line); }
    td { padding:5px 12px; height:60px; font-size:0.6875rem; color:var(--secondary); }
    tbody tr:nth-child(even) { background:#f3f3f680; }
    tbody tr:hover { background:#ededf1; }
    tbody tr.current { background:#f9e9ed; }
    .current .track-copy strong,.current .track-index,.queue-track.current>svg { color:var(--accent); }
    .number-column { width:42px; }
    .track-index { text-align:center; font-size:0.625rem; color:#9999a1; font-variant-numeric:tabular-nums; }
    .track-index svg { width:14px; height:14px; }
    .album-column { width:27%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .time-column { width:68px; font-variant-numeric:tabular-nums; text-align:right; }
    .favorite-column { width:48px; }
    td:last-child { padding-left:6px; padding-right:6px; }
    .track-button { display:flex; align-items:center; gap:11px; width:100%; text-align:left; padding:0; }
    .track-copy { display:flex; flex-direction:column; min-width:0; gap:3px; }
    .track-copy strong { color:#38383d; font-size:0.75rem; font-weight:550; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
    .track-copy small { color:var(--secondary); font-size:0.625rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
    .row-play { color:var(--accent); margin-left:auto; opacity:0; }
    tr:hover .row-play,.track-button:focus-visible .row-play { opacity:1; }
    .favorite svg { width:16px; height:16px; }
    .library-note { font-size:0.625rem; color:var(--secondary); margin-top:20px; }
    .empty { display:flex; align-items:center; justify-content:center; text-align:center; flex-direction:column; padding:52px 16px; background:#f3f3f680; border-radius:8px; color:var(--secondary); }
    .empty>svg { width:36px; height:36px; color:#b4a2ad; margin-bottom:15px; }
    .empty h3 { font-size:1rem; font-weight:550; color:inherit; }
    .empty p { font-size:0.75rem; margin-top:7px; }
    .player { grid-column:1/-1; display:grid; grid-template-columns:minmax(180px,1fr) minmax(260px,1.25fr) minmax(160px,1fr); gap:25px; align-items:center; padding:10px 26px; background:rgba(255,255,255,.94); backdrop-filter:blur(28px) saturate(150%); border-top:1px solid var(--line); z-index:5; }
    .now-playing { display:flex; align-items:center; gap:12px; min-width:0; }
    .now-playing .cover { width:54px; height:54px; border-radius:6px; }
    #now-cover { display:flex; }
    .now-info { min-width:0; display:flex; flex-direction:column; gap:3px; }
    .now-info strong { font-size:0.75rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .now-info>span { font-size:0.625rem; color:var(--secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #now-favorite { margin-left:6px; }
    #now-favorite svg { width:17px; height:17px; }
    .playback { width:100%; max-width:530px; justify-self:center; }
    .playback-buttons { display:flex; align-items:center; justify-content:center; gap:15px; }
    .playback-buttons .icon-button { color:#55555e; }
    .playback-buttons .minor svg { width:15px; height:15px; }
    .playback-buttons [aria-pressed="true"] { color:var(--accent); }
    .play-button { width:37px; height:37px; display:grid; place-items:center; border-radius:50%; background:var(--accent); color:white; }
    .play-button svg { width:22px; height:22px; }
    .play-button:hover:not(:disabled) { background:#c32442; }
    .play-button[aria-busy="true"] { opacity:.5; }
    .timeline { display:flex; align-items:center; gap:9px; margin-top:6px; }
    .timeline>span { color:#929299; font-size:0.5625rem; font-variant-numeric:tabular-nums; min-width:28px; }
    .timeline>span:last-child { text-align:right; }
    input[type="range"] { appearance:none; -webkit-appearance:none; width:100%; min-width:0; height:16px; margin:0; background:transparent; cursor:pointer; border-radius:3px; }
    input[type="range"]::-webkit-slider-runnable-track { height:3px; border-radius:3px; background:linear-gradient(to right,#96969f var(--fill),#e2e2e7 var(--fill)); }
    input[type="range"]::-webkit-slider-thumb { appearance:none; -webkit-appearance:none; width:9px; height:9px; margin-top:-3px; border-radius:50%; background:#888891; }
    input[type="range"]:hover::-webkit-slider-thumb { background:var(--accent); }
    input[type="range"]:disabled { opacity:.5; cursor:default; }
    .player-tools { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
    #volume { max-width:85px; }
    .tool-divider { height:20px; width:1px; background:var(--line); margin:0 10px; }
    .queue-panel { position:absolute; right:14px; top:74px; bottom:14px; width:320px; max-width:calc(100% - 28px); padding:20px 15px; background:rgba(255,255,255,.97); backdrop-filter:blur(24px); border:1px solid var(--line); border-radius:12px; box-shadow:0 12px 40px #24243620; z-index:4; overflow:auto; }
    .queue-panel .section-heading { margin-bottom:0; }
    .queue-panel h2 { font-size:1.125rem; }
    #queue-tracks { margin-top:15px; }
    .queue-track { display:flex; align-items:center; gap:10px; padding:9px 7px; text-align:left; width:100%; border-radius:6px; }
    .queue-track:hover { background:var(--hover); }
    .queue-track.current { background:#f9e9ed; }
    .queue-track>.track-copy { flex:1; }
    .queue-track>svg { width:16px; height:16px; }
    dialog { width:390px; max-width:calc(100vw - 32px); border:1px solid var(--line); padding:25px; border-radius:15px; box-shadow:0 20px 80px #17172733; background:var(--surface); color:inherit; }
    #song-menu { position:fixed; z-index:100; min-width:190px; padding:5px; background:#282828; border:1px solid #484848; border-radius:6px; box-shadow:0 8px 28px #0009; }
    #song-menu button { display:block; width:100%; text-align:left; padding:12px; border:0; border-radius:3px; background:transparent; color:#fff; }
    #song-menu button:hover, #song-menu button:focus-visible { background:#414141; }
    #add-track-dialog { width:min(440px,90vw); max-height:75vh; overflow:auto; }
    #add-track-list { display:flex; flex-direction:column; gap:8px; }
    dialog::backdrop { background:#20202b45; }
    dialog h2 { font-size:1.3125rem; }
    dialog p { color:var(--secondary); font-size:0.75rem; margin-bottom:16px; }
    dialog label { display:block; font-size:0.75rem; font-weight:600; margin-bottom:6px; }
    #playlist-id { width:100%; padding:10px; border:1px solid #d2d2da; border-radius:6px; background:var(--surface); color:inherit; margin-bottom:5px; }
    dialog .soft-button { width:100%; justify-content:center; margin-top:8px; }
    .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
    main,.sidebar,.queue-panel,#sidebar-created { scrollbar-width:none; -ms-overflow-style:none; }
    main::-webkit-scrollbar,.sidebar::-webkit-scrollbar,.queue-panel::-webkit-scrollbar,#sidebar-created::-webkit-scrollbar { display:none; width:0; height:0; }
    main.track-scroll { scrollbar-width:thin; scrollbar-color:#585858 transparent; }
    main.track-scroll::-webkit-scrollbar { display:block; width:6px; height:6px; }
    main.track-scroll::-webkit-scrollbar-track { background:transparent; }
    main.track-scroll::-webkit-scrollbar-thumb { background:#585858; border-radius:6px; }
    main.track-scroll::-webkit-scrollbar-thumb:hover { background:#777; }
    @media(min-width:1450px) { main { padding-left:48px; padding-right:48px; } .hero { min-height:320px; } .record-art { right:5%; transform:translateY(-50%) rotate(-12deg) scale(1.2); } .hero-copy { padding:36px; } }
    @media(max-width:1180px) { .app { grid-template-columns:190px minmax(0,1fr); } .toolbar { padding:0 26px; } main { padding:20px 26px 32px; } .hero { min-height:250px; } .hero-copy { padding:23px; } .record-art { right:-125px; opacity:.8; } .hero-copy h2 { font-size:1.8125rem; } .hero-copy p { max-width:150px; } .hero-secondary { padding:23px; } .secondary-title { font-size:1.4375rem; } .favorite-art svg { width:95px; height:95px; } .album-grid { gap:14px; } .player { gap:14px; padding-left:18px; padding-right:18px; } }
    @media(max-width:950px) { .app { grid-template-columns:170px minmax(0,1fr); } .sidebar { padding-left:10px; padding-right:10px; } .toolbar { gap:10px; padding:0 22px; } .search { width:190px; } .record-art { right:-183px; opacity:.45; } .hero-copy h2 { font-size:1.625rem; } .secondary-title { font-size:1.3125rem; } .hero-secondary { padding:21px; } .favorite-art { right:-10px; bottom:55px; opacity:.65; } .hero-kicker { font-size:0.5625rem; } .album-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px 15px; } .album-grid .album-card:nth-child(n+4) { display:none; } .player { grid-template-columns:minmax(120px,1fr) minmax(230px,1.4fr) auto; } #volume,.tool-divider,#mute { display:none; } #now-favorite { margin-left:0; } .now-playing { gap:9px; } .now-playing .cover { width:44px; height:44px; } .date { font-size:0.625rem; } }
    @media(max-width:700px) { .app { grid-template-columns:68px minmax(0,1fr); grid-template-rows:36px minmax(0,1fr) 110px; } .sidebar { padding:25px 10px 15px; } .brand { justify-content:center; padding:0 0 24px; } .brand>span:last-child,.nav-label,.nav-item>span,.sidebar-bottom,.playlist-link { display:none; } .nav-item { justify-content:center; padding:12px 0; margin:5px 0; } .playlist-label { display:flex; font-size:0; justify-content:center; margin:20px 0 0; } .playlist-label .icon-button { width:40px; height:40px; } .toolbar { height:58px; padding:0 17px; gap:8px; } .toolbar::after { top:58px; } .toolbar-title { display:none; } .search { width:auto; flex:1; } main { padding:18px 18px 30px; } .date { display:none; } h1 { font-size:1.8125rem; } .editorial-grid { grid-template-columns:1fr; gap:13px; } .hero-primary { min-height:245px; } .hero-copy h2 { font-size:1.8125rem; } .record-art { right:-120px; opacity:.7; } .hero-secondary { min-height:140px; padding:19px 22px; } .hero-secondary .hero-kicker { font-size:0.5625rem; } .secondary-title { font-size:1.375rem; margin-top:8px; } .secondary-title br { display:none; } .secondary-bottom { padding-top:10px; } .favorite-art { right:25px; bottom:22px; } .favorite-art svg { width:90px; height:90px; } .album-grid { gap:10px; } .section-heading h2 { font-size:1.125rem; } .album-column { display:none; } td { padding:5px 7px; } .number-column { width:27px; } .time-column { width:48px; } .favorite-column { width:38px; } .track-button { gap:8px; } .track-button .cover { width:32px; height:32px; } .track-copy strong { font-size:0.6875rem; } .row-play { display:none; } .player { grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; padding:8px 15px; position:relative; } .now-playing { align-self:start; padding-top:3px; padding-right:100px; grid-column:1/-1; } .now-playing .cover { width:38px; height:38px; } .now-info { max-width:calc(100% - 85px); } .playback { grid-column:1/-1; max-width:none; } .playback-buttons { position:absolute; top:10px; right:47px; gap:3px; } .playback-buttons .minor,#previous { display:none; } .play-button { width:32px; height:32px; } .playback-buttons #next { width:30px; } .timeline { margin:0; } .player-tools { position:absolute; top:10px; right:9px; } .queue-panel { top:64px; } .track-section { margin-top:23px; } .album-card>strong { font-size:0.6875rem; } .album-card>small { font-size:0.625rem; } }
    @media(max-width:950px) { .record-art { right:-235px; opacity:.55; } .hero-copy { background:linear-gradient(90deg,#eed8c9 55%,#eed8c900); } .hero-copy h2 { font-size:1.5rem; } }
    @media(max-width:700px) { .hero-primary { min-height:260px; } .hero-copy { padding:22px; width:100%; background:linear-gradient(90deg,#eed8c9 65%,#eed8c900); } .hero-copy h2 { font-size:1.625rem; } .record-art { right:-225px; opacity:.35; } .hero-copy p { max-width:200px; } .favorite-art { right:-15px; bottom:15px; opacity:.3; } }
    @media(prefers-color-scheme:dark) { :host { color-scheme:dark; color:#eeeef1; --secondary:#a0a0aa; --line:#353539; --surface:#252528; --hover:#333338; --sidebar:#242427; --accent:#fa5876; } .app { background:#1c1c1f; } .sidebar { border-color:#353539; } .nav-item:hover { background:#333338; } .nav-item.selected { background:#b92746; } .toolbar { background:#1c1c1fe6; } .toolbar::after { background:linear-gradient(#1c1c1fcc,transparent); } .search { background:#303035; } .search input,.track-copy strong { color:#e7e7ec; } .player { background:#252528f5; } .playback-buttons .icon-button { color:#d1d1d8; } .playback-buttons [aria-pressed="true"] { color:var(--accent); } .play-button { background:#d92d4c; } tbody tr:nth-child(even),.empty { background:#ffffff04; } tbody tr:hover { background:#ffffff0b; } tbody tr.current,.queue-track.current { background:#fa587616; } .soft-button { background:#fa58761c; } .soft-button:hover:not(:disabled) { background:#fa58762e; } .notice.error { background:#402a32; color:#ffa0b2; } .queue-panel { background:#252528f7; } .icon-button { color:#a9a9b3; } input[type="range"]::-webkit-slider-runnable-track { background:linear-gradient(to right,#a0a0aa var(--fill),#45454d var(--fill)); } }
    @media(prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none!important; } button:not(:disabled):active { transform:none; } }
    @media(prefers-reduced-transparency:reduce) { .toolbar,.player,.queue-panel { backdrop-filter:none; background:var(--surface); } .toolbar::after { display:none; } }
    @media(prefers-contrast:more) { :host { --secondary:currentColor; } .sidebar,.toolbar,.player,.queue-panel,.search,dialog { border:1px solid currentColor; background:var(--surface); backdrop-filter:none; } .date,.nav-label,.library-note,th,.track-index,.timeline>span { color:inherit; } .hero-copy p { color:#503630; } }
    /* Spotify-inspired desktop shell: neutral surfaces, artwork-led content, restrained green. */
    :host { color-scheme:dark; color:#f7f7f7; --accent:#1ed760; --secondary:#a7a7a7; --line:#303030; --surface:#242424; --hover:#2a2a2a; --sidebar:#121212; font:14px/1.45 Arial,"Microsoft YaHei",sans-serif; }
    button:not(:disabled):active { transform:none; }
    h1 { font-size:2rem; font-weight:750; letter-spacing:-.035em; }
    h2 { font-size:1.375rem; font-weight:700; letter-spacing:-.025em; }
    .app { grid-template-columns:260px minmax(0,1fr); grid-template-rows:32px minmax(0,1fr) 88px; column-gap:8px; row-gap:4px; padding:0 8px; background:#000; }
    .window-bar { height:32px; background:#000; }
    .window-button { width:36px; height:32px; padding:8px 10px; color:#b3b3b3; }
    .window-actions { gap:2px; padding-right:5px; }
    .window-actions .icon-button,.window-actions .original-button { width:28px; height:28px; }
    .window-actions .icon-button,.window-actions .original-button { color:#b3b3b3; }
    .window-actions .icon-button:hover:not(:disabled),.window-actions .original-button:hover:not(:disabled) { color:#fff; background:#292929; }
    .window-button:hover { background:#292929; color:#fff; }
    .sidebar { padding:25px 12px 15px; border:0; border-radius:8px; background:#121212; }
    .brand { font-size:1.25rem; padding:0 12px 23px; gap:9px; letter-spacing:-.03em; }
    .brand-icon { color:#fff; }
    .brand-icon svg { width:27px; height:27px; }
    .nav-label { color:#a7a7a7; font-size:11px; font-weight:700; letter-spacing:0; margin:20px 12px 7px; }
    .nav-item { min-height:42px; margin:1px 0; padding:9px 12px; border-radius:4px; color:#a7a7a7; font-size:13px; font-weight:650; }
    .nav-item>svg,.playlist-link>svg { color:currentColor; width:19px; height:19px; }
    .nav-item:hover,.nav-item.selected { background:#242424; color:#fff; }
    .nav-item.selected { font-weight:700; }
    .nav-item.selected>svg { color:#fff; }
    .playlist-label { margin-top:25px; padding-top:13px; border-top:1px solid #292929; }
    .playlist-link { color:#b3b3b3; font-size:12px; font-weight:500; }
    #sidebar-created { max-height:min(42vh,360px); }
    .playlist-group-label { margin:10px 12px 3px; color:#777; font-size:11px; font-weight:700; }
    .sidebar-bottom { padding:24px 12px 0; color:#8b8b8b; }
    .workspace { border-radius:8px; background:linear-gradient(180deg,#252525 0,#1b1b1b 260px,#121212 470px); overflow:hidden; }
    .toolbar { height:64px; gap:12px; padding:0 30px; background:transparent; backdrop-filter:none; }
    .toolbar::after { display:none; }
    .toolbar-title { color:#fff; font-size:13px; font-weight:700; }
    .search { width:280px; padding:9px 13px; border-radius:24px; background:#2a2a2a; color:#b3b3b3; }
    .search:focus-within { box-shadow:0 0 0 2px #fff; }
    .search input { color:#fff; font-size:13px; }
    .search input::placeholder { color:#a7a7a7; }
    .icon-button { color:#a7a7a7; border-radius:50%; }
    .icon-button:hover:not(:disabled) { color:#fff; background:#303030; }
    .icon-button[aria-pressed="true"],.icon-button[aria-expanded="true"] { color:#1ed760; background:none; }
    .original-button { color:#b3b3b3; font-size:12px; font-weight:650; }
    .original-button:hover { color:#fff; }
    main { padding:25px 30px 42px; scrollbar-color:#555 transparent; }
    .page-heading { margin-bottom:19px; }
    .date { color:#a7a7a7; font-size:11px; }
    .eyebrow { color:#a7a7a7; letter-spacing:0; }
    .quick-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:34px; }
    .quick-card { display:flex; align-items:center; gap:13px; min-width:0; height:58px; padding:0 11px 0 0; overflow:hidden; border-radius:4px; background:#ffffff19; color:#fff; text-align:left; font-size:13px; font-weight:700; }
    .quick-card:hover { background:#ffffff30; }
    .quick-card:disabled { opacity:.6; }
    .quick-card strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .quick-cover { display:grid; place-items:center; width:58px; height:58px; flex-shrink:0; background:#3b3b3b; color:#fff; overflow:hidden; }
    .quick-cover>.cover { width:58px; height:58px; border-radius:0; }
    .quick-cover>svg { width:25px; height:25px; }
    .liked-cover { background:linear-gradient(135deg,#4034a3,#8f80d7); }
    .quick-daily { background:#26514c; } .quick-radar { background:#394865; }
    .quick-roaming { background:#694d47; } .quick-heartmode { background:#64425d; }
    .quick-play { display:grid; place-items:center; width:34px; height:34px; flex-shrink:0; margin-left:auto; border-radius:50%; background:#1ed760; color:#000; opacity:0; transform:translateY(4px); transition:opacity 160ms ease,transform 160ms ease; }
    .quick-play svg { width:17px; height:17px; }
    .quick-card:hover .quick-play,.quick-card:focus-visible .quick-play { opacity:1; transform:none; }
    .section-heading { margin-bottom:15px; }
    .text-button { color:#b3b3b3; font-size:12px; font-weight:700; }
    .text-button:hover { color:#fff; text-decoration:underline; }
    .album-grid { grid-template-columns:repeat(6,minmax(0,1fr)); gap:15px; }
    .album-card { padding:10px; margin:-10px; border-radius:6px; }
    .album-card:hover { background:#ffffff16; }
    .album-art>.cover { border-radius:4px; box-shadow:0 7px 15px #0005; background:#333; color:#aaa; }
    .album-card:nth-child(n) .cover { background:#333; color:#aaa; }
    .album-card>strong { color:#fff; margin-top:10px; font-size:13px; font-weight:700; }
    .album-card>small { color:#a7a7a7; font-size:12px; margin-top:4px; }
    .album-play { width:42px; height:42px; bottom:9px; right:9px; background:#1ed760; color:#000; box-shadow:0 5px 15px #0007; }
    .album-play svg { width:20px; height:20px; }
    .home-library { margin-top:42px; }
    .created-grid { gap:27px 17px; }
    .track-section { margin-top:32px; }
    .track-section>.section-heading { padding-top:25px; border-color:#343434; }
    .section-detail,.library-status,.library-note { color:#a7a7a7; }
    .soft-button { padding:9px 16px; border-radius:24px; background:#fff; color:#121212; font-weight:700; }
    .soft-button:hover:not(:disabled) { background:#f2f2f2; transform:scale(1.03); }
    .soft-button#play-all { background:#1ed760; color:#000; }
    .soft-button#play-all:hover:not(:disabled) { background:#3be477; }
    .notice { bottom:12px; border:0; border-radius:4px; background:#2e2e2e; color:#fff; box-shadow:0 7px 25px #0008; }
    .notice.error { color:#fff; background:#ad2828; }
    th { color:#a7a7a7; font-size:11px; border-color:#ffffff24; }
    .table-wrap { overflow-anchor:none; }
    .track-spacer, .track-spacer:hover { background:transparent !important; }
    .track-spacer td { padding:0; border:0; line-height:0; font-size:0; }
    td { height:56px; color:#a7a7a7; font-size:12px; }
    tbody tr:nth-child(even) { background:transparent; }
    tbody tr:hover { background:#ffffff16; }
    tbody tr.current { background:#ffffff12; }
    .current .track-copy strong,.current .track-index,.queue-track.current>svg { color:#1ed760; }
    .track-copy strong { color:#fff; font-size:13px; }
    .track-copy small { color:#a7a7a7; font-size:12px; }
    .track-index { color:#a7a7a7; }
    .row-play { color:#fff; }
    .cover { background:#333; color:#a7a7a7; border-radius:4px; }
    .empty { color:#a7a7a7; background:#1f1f1f; }
    .empty>svg { color:#a7a7a7; }
    .player { grid-template-columns:minmax(180px,1fr) minmax(260px,1.25fr) minmax(160px,1fr); gap:24px; padding:8px 12px 10px; background:#000; backdrop-filter:none; border:0; }
    .now-playing .cover { width:55px; height:55px; border-radius:4px; }
    .cover-toggle { display:block; width:55px; height:55px; flex-shrink:0; padding:0; border-radius:4px; overflow:hidden; }
    .cover-toggle:hover { box-shadow:0 0 0 2px #fff8; }
    #now-cover { display:block; width:100%; height:100%; }
    .now-info strong { color:#fff; font-size:13px; }
    .now-info>span { color:#a7a7a7; font-size:11px; }
    .playback-buttons { gap:13px; }
    .playback-buttons .icon-button { color:#b3b3b3; }
    .playback-buttons .icon-button:hover { color:#fff; }
    .playback-buttons [aria-pressed="true"] { color:#1ed760; }
    .play-button { width:34px; height:34px; background:#fff; color:#000; }
    .play-button:hover:not(:disabled) { background:#fff; transform:scale(1.06); }
    .play-button svg { width:19px; height:19px; }
    .timeline { margin-top:4px; }
    .timeline>span { color:#a7a7a7; font-size:10px; }
    input[type="range"]::-webkit-slider-runnable-track { height:4px; background:linear-gradient(to right,#fff var(--fill),#4d4d4d var(--fill)); }
    input[type="range"]::-webkit-slider-thumb { width:10px; height:10px; margin-top:-3px; background:#fff; opacity:0; }
    input[type="range"]:hover::-webkit-slider-runnable-track { background:linear-gradient(to right,#1ed760 var(--fill),#4d4d4d var(--fill)); }
    input[type="range"]:hover::-webkit-slider-thumb { background:#fff; opacity:1; }
    .queue-panel { top:72px; right:8px; bottom:0; border:0; border-radius:8px 0 0 0; background:#1b1b1b; backdrop-filter:none; box-shadow:-8px 0 25px #0007; }
    .queue-track.current { background:#ffffff16; }
    .lyrics-view { --lyrics-color-background:rgb(36,36,36); --lyrics-color-inactive:rgb(190,190,190); --lyrics-color-active:#fff; --lyrics-color-passed:#fff; position:absolute; inset:0; z-index:3; overflow:hidden; background:var(--lyrics-color-background); color:var(--lyrics-color-active); }
    .lyrics-top { position:absolute; inset:0 0 auto; height:66px; z-index:1; display:flex; align-items:center; justify-content:space-between; padding:0 34px; background:linear-gradient(var(--lyrics-color-background) 75%,transparent); color:var(--lyrics-color-inactive); font-size:12px; font-weight:700; }
    .lyrics-back { display:flex; align-items:center; gap:8px; padding:8px 0; color:var(--lyrics-color-inactive); font-size:12px; font-weight:700; }
    .lyrics-back:hover { color:#fff; }
    .lyrics-back svg { width:16px; height:16px; }
    .lyrics-scroll { position:absolute; inset:0; overflow:auto; padding:90px clamp(32px,7vw,100px) 42vh; scrollbar-width:none; }
    .lyrics-scroll::-webkit-scrollbar { display:none; }
    .lyrics-heading { display:flex; align-items:baseline; gap:12px; margin-bottom:38px; color:var(--lyrics-color-inactive); font-size:13px; font-weight:700; }
    .lyrics-heading small { font-size:12px; font-weight:500; opacity:.8; }
    .lyrics-status { color:var(--lyrics-color-inactive); font-size:clamp(22px,2.8vw,38px); font-weight:700; }
    .lyrics-lines { max-width:1020px; }
    .lyric-line { display:block; width:100%; margin:0 0 26px; padding:0; color:var(--lyrics-color-inactive); opacity:.82; text-align:left; font-size:clamp(27px,3.1vw,52px); font-weight:750; letter-spacing:-.025em; line-height:1.34; transition:opacity 180ms ease,color 180ms ease; }
    .lyric-line.passed { color:var(--lyrics-color-passed); opacity:.87; }
    button.lyric-line:hover,button.lyric-line:focus-visible,.lyric-line.active { color:var(--lyrics-color-active); opacity:1; }
    .lyric-line small { display:block; margin-top:6px; font-size:.42em; font-weight:600; letter-spacing:0; }
    .lyrics-retry { margin-top:24px; padding:9px 20px; border-radius:24px; background:#fff; color:#181818; font-weight:700; }
    .lyrics-retry:hover { background:#eee; }
    dialog { background:#282828; border:1px solid #444; border-radius:8px; box-shadow:0 20px 80px #0009; }
    #song-menu { position:fixed; z-index:100; min-width:190px; padding:5px; background:#282828; border:1px solid #484848; border-radius:6px; box-shadow:0 8px 28px #0009; }
    #song-menu button { display:block; width:100%; text-align:left; padding:12px; border:0; border-radius:3px; background:transparent; color:#fff; }
    #song-menu button:hover, #song-menu button:focus-visible { background:#414141; }
    #add-track-dialog { width:min(440px,90vw); max-height:75vh; overflow:auto; }
    #add-track-list { display:flex; flex-direction:column; gap:8px; }
    dialog::backdrop { background:#000a; }
    #playlist-id { border-color:#666; background:#121212; }
    @media(max-width:1180px) { .app { grid-template-columns:225px minmax(0,1fr); } .toolbar { padding:0 24px; } main { padding:22px 24px 38px; } }
    @media(max-width:950px) { .app { grid-template-columns:185px minmax(0,1fr); } .quick-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .album-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:25px 15px; } .album-grid .album-card:nth-child(n+4) { display:block; } .search { width:210px; } }
    @media(max-width:950px) { .brand { font-size:15px; gap:7px; padding-left:5px; padding-right:5px; } .brand-icon svg { width:24px; height:24px; } }
    @media(max-width:700px) { .app { grid-template-columns:68px minmax(0,1fr); grid-template-rows:44px minmax(0,1fr) 110px; gap:6px; padding:0 6px; } .sidebar { padding:20px 8px; } .brand { padding-bottom:20px; } .brand-icon svg { width:25px; height:25px; } .nav-item { padding:10px 0; } .playlist-label { font-size:0; justify-content:center; margin:20px 0 0; } .toolbar { height:58px; padding:0 16px; } main { padding:18px 18px 32px; } .quick-grid { gap:8px; margin-bottom:28px; } .quick-card { height:50px; gap:9px; font-size:12px; } .quick-cover,.quick-cover>.cover { width:50px; height:50px; } .quick-play { display:none; } .album-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .player { grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; padding:7px 10px; position:relative; } .now-playing { padding-right:148px; } .cover-toggle,.now-playing .cover { width:38px; height:38px; } .playback-buttons { right:92px; } .player-tools { right:8px; gap:2px; } .play-button { width:32px; height:32px; } .queue-panel { top:58px; right:0; } .lyrics-top { padding:0 20px; } .lyrics-scroll { padding:85px 25px 40vh; } .lyric-line { margin-bottom:20px; } }
    @media(max-width:430px) { .quick-grid { grid-template-columns:1fr; } .album-grid { gap:18px 10px; } .search { min-width:0; } }
    @media(prefers-contrast:more) { :host { --secondary:#fff; } .sidebar,.workspace,.toolbar,.player,.queue-panel,.search,dialog { border:1px solid #fff; } .quick-card { border:1px solid #fff; } .date,.nav-label,.library-note,th,.track-index,.timeline>span { color:#fff; } }
    @media(prefers-reduced-motion:reduce) { .quick-play { transition:none; transform:none; } }
  `;
})(globalThis);
