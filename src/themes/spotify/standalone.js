(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  function isStandalone() {
    return !!(namespace.app.isStandalone && namespace.app.isStandalone()) ||
      !!(root.location && root.location.href === "about:blank#enhancencm");
  }
  var recommendationModes = {
    daily: { title: "每日推荐", icon: "discover", copy: "今天的旋律，为你挑选。" },
    radar: { title: "私人雷达", icon: "search", copy: "发现与你合拍的新声音。" },
    roaming: { title: "私人漫游", icon: "shuffle", copy: "随心出发，让音乐继续。", dynamic: true },
    heartmode: { title: "心动模式", icon: "heart", copy: "从喜欢出发，遇见更多心动。", dynamic: true }
  };
  var icons = {
    music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
    discover: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    library: '<path d="M4 4v16M9 4v16M14 4l6 16"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 4v16M17 4v16" stroke-width="5"/>',
    next: '<path d="m4 5 11 7-11 7Z" fill="currentColor" stroke="none"/><path d="M19 5v14" stroke-width="3"/>',
    previous: '<path d="m20 5-11 7 11 7Z" fill="currentColor" stroke="none"/><path d="M5 5v14" stroke-width="3"/>',
    shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-5m2-3c2-3 3-4 5-4h3m-4-4 4 4-4 4"/>',
    repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
    volume: '<path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 4 6 8H3v8h3l5 4Zm5 5 6 6m0-6-6 6"/>',
    queue: '<path d="M4 5h16M4 11h16M4 17h9m4-2 4 3-4 3Z"/>',
    microphone: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>'; }
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function safeUrl(url) {
    try { var parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.href : ""; }
    catch (_) { return ""; }
  }
  function artists(song) { return namespace.sdk.presentation.artists(song); }
  function album(song) { return namespace.sdk.presentation.album(song); }
  function time(seconds) { return namespace.sdk.presentation.time(seconds); }
  function cover(song) {
    var url = song && song.localPath && namespace.sdk.localMusic ? namespace.sdk.localMusic.getArtwork(song) : namespace.sdk.artwork.getUrl(album(song).picUrl);
    return '<span class="cover">' + icon("music") + (url ? '<img loading="lazy" src="' + escape(url) + '" alt="" referrerpolicy="no-referrer">' : "") + '</span>';
  }

  function render(options) {
    var shadow = options.root;
    shadow.host.style.cssText = "position:fixed;inset:0;z-index:2147483646;";
    shadow.innerHTML = '<style>' + namespace._musicStyles + '</style>' + `
      <div class="app">
        <header class="window-bar" data-window-drag><span id="shell-status" role="status" aria-live="polite"></span><div class="window-actions"><button class="icon-button" id="refresh" title="刷新界面" aria-label="刷新界面">${icon("refresh")}</button><button class="original-button" id="original" aria-label="返回网易云原版" title="返回网易云原版">${icon("back")}</button></div><div class="window-buttons"><button id="window-minimize" class="window-button" aria-label="最小化" title="最小化"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button><button id="window-maximize" class="window-button" aria-label="最大化" title="最大化"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg></button><button id="window-close" class="window-button" aria-label="关闭网易云音乐" title="退出网易云音乐">${icon("close")}</button></div></header>
        <div class="resize-handles" aria-hidden="true"><div data-resize="topleft"></div><div data-resize="topright"></div><div data-resize="bottomleft"></div><div data-resize="bottomright"></div><div data-resize="right"></div></div>
        <aside class="sidebar" aria-label="音乐导航">
          <div class="brand"><span class="brand-icon">${icon("music")}</span><span>EnhanceNCM</span></div>
          <div class="nav-label">探索音乐</div>
          <nav><button class="nav-item selected" data-view="discover" aria-label="现在就听" aria-current="page">${icon("discover")}<span>现在就听</span></button><button class="nav-item" data-view="songs" aria-label="歌曲">${icon("music")}<span>歌曲</span></button></nav>
          <div class="nav-label">为你推荐</div>
          <nav aria-label="为你推荐">${Object.keys(recommendationModes).map(function (key) { var mode = recommendationModes[key]; return '<button class="nav-item" data-view="' + key + '" aria-label="' + mode.title + '" title="' + mode.title + '">' + icon(mode.icon) + '<span>' + mode.title + '</span></button>'; }).join("")}</nav>
          <div class="nav-label">资料库</div>
          <nav><button class="nav-item" data-view="liked" aria-label="我喜欢的音乐">${icon("heart")}<span>我喜欢的音乐</span></button><button class="nav-item" data-view="created" aria-label="我创建的歌单">${icon("library")}<span>我创建的歌单</span></button><button class="nav-item" data-view="subscribed" aria-label="我收藏的歌单">${icon("library")}<span>我收藏的歌单</span></button></nav>
          <div class="nav-label playlist-label">歌单<button class="icon-button" id="add-playlist" title="打开歌单" aria-label="打开歌单">${icon("plus")}</button></div>
          <div id="sidebar-created" aria-label="自己创建和收藏的歌单"></div>
          <div class="sidebar-bottom"><div class="account-line"><span id="account-name">正在读取账号…</span><button id="refresh-library" class="icon-button" aria-label="刷新账号歌单" title="刷新账号歌单">${icon("refresh")}</button></div></div>
        </aside>
        <div class="workspace">
          <header class="toolbar"><span class="toolbar-title" id="toolbar-title">主页</span><label class="search">${icon("search")}<input id="search" type="search" placeholder="搜索全站歌曲，回车搜索" aria-label="搜索全站歌曲"></label></header>
          <div class="notice" id="notice" role="status" aria-live="polite" hidden><span id="notice-text"></span><button class="text-button" id="retry" hidden>重试</button></div>
          <main id="main" tabindex="-1">
            <section id="discover">
              <div class="page-heading"><div><h1>现在就听</h1></div><span class="date" id="date"></span></div>
              <div class="quick-grid" aria-label="快捷播放">
                <button class="quick-card" id="hero-library"><span class="quick-cover liked-cover">${icon("heart")}</span><strong>我喜欢的音乐</strong><span class="quick-play">${icon("arrow")}</span></button>
                ${Object.keys(recommendationModes).map(function (key) { var mode = recommendationModes[key]; return '<button class="quick-card" data-view="' + key + '"><span class="quick-cover quick-' + key + '">' + icon(mode.icon) + '</span><strong>' + mode.title + '</strong><span class="quick-play">' + icon("arrow") + '</span></button>'; }).join("")}
              </div>
              <section class="recommendations"><div class="section-heading"><h2>推荐歌单</h2><button class="text-button" id="refresh-home-playlists">刷新</button></div><p id="home-recommendation-status" class="library-status" role="status">正在加载推荐歌单…</p><div class="album-grid" id="albums"></div></section>
              <section class="home-library"><div class="section-heading"><h2>我创建的歌单</h2><button class="text-button" id="open-created">查看全部</button></div><p id="home-created-status" class="library-status" role="status"></p><div class="album-grid" id="home-created-grid"></div></section>
              <section class="home-library"><div class="section-heading"><h2>我收藏的歌单</h2><button class="text-button" id="open-subscribed">查看全部</button></div><p id="home-subscribed-status" class="library-status" role="status"></p><div class="album-grid" id="home-subscribed-grid"></div></section>
            </section>
            <section id="created-view" hidden aria-labelledby="created-heading"><div class="section-heading"><div><p class="eyebrow">你的音乐资料库</p><h1 id="created-heading">我创建的歌单</h1><p class="section-detail" id="created-detail"></p></div><button class="soft-button" id="reload-created">${icon("refresh")}刷新</button></div><p id="created-status" class="library-status" role="status"></p><div id="created-grid" class="created-grid"></div><button class="soft-button load-more" id="more-created" hidden>加载更多歌单</button></section>
            <section id="subscribed-view" hidden aria-labelledby="subscribed-heading"><div class="section-heading"><div><p class="eyebrow">你的音乐资料库</p><h1 id="subscribed-heading">我收藏的歌单</h1><p class="section-detail" id="subscribed-detail"></p></div><button class="soft-button" id="reload-subscribed">${icon("refresh")}刷新</button></div><p id="subscribed-status" class="library-status" role="status"></p><div id="subscribed-grid" class="created-grid"></div><button class="soft-button load-more" id="more-subscribed" hidden>加载更多歌单</button></section>
            <section class="track-section" aria-labelledby="list-heading" hidden>
              <div class="section-heading"><div><p class="eyebrow" id="list-eyebrow">精选歌单</p><h2 id="list-heading">云音乐热歌榜</h2><p class="section-detail" id="list-detail">正在获取歌单…</p></div><div class="list-actions"><button class="icon-button" id="reload-liked" hidden aria-label="刷新我喜欢的音乐" title="刷新我喜欢的音乐">${icon("refresh")}</button><button class="soft-button" id="play-all">${icon("play")}播放全部</button></div></div>
              <p id="liked-status" class="library-status" role="status" hidden></p>
              <div class="recommendation-actions" id="recommendation-actions" hidden><p id="recommendation-description" class="section-detail"></p><button class="soft-button" id="reload-recommended">${icon("refresh")}刷新推荐</button></div>
              <p id="recommendation-status" class="library-status" role="status" hidden></p>
              <button class="text-button" id="reload-playlist" hidden>刷新歌单</button>
              <div class="table-wrap"><table><thead><tr><th class="number-column" scope="col">#</th><th scope="col">歌曲</th><th class="album-column" scope="col">专辑</th><th class="time-column" scope="col">时长</th><th class="favorite-column" scope="col"><span class="sr-only">账号喜欢</span></th></tr></thead><tbody id="tracks"></tbody></table></div>
              <div class="empty" id="empty" hidden>${icon("music")}<h3 id="empty-title">还没有歌曲</h3><p id="empty-copy">打开一份歌单，让音乐开始。</p></div>
              <button class="soft-button load-more" id="more-search" hidden>加载更多搜索结果</button><button class="soft-button load-more" id="more-liked" hidden>加载更多喜欢的歌曲</button>
              <button class="soft-button load-more" id="more-playlist" hidden>再载入 500 首</button>
              <button class="soft-button load-more" id="more-recommended" hidden>下一批推荐</button>
              <p class="library-note">爱心会同步到网易云音乐账号的“我喜欢的音乐”；播放权限以账号为准。</p>
            </section>
          </main>
          <section class="lyrics-view" id="lyrics-view" aria-label="歌词" tabindex="-1" hidden>
            <div class="lyrics-top"><button class="lyrics-back" id="lyrics-close" aria-label="返回音乐页面">${icon("back")}<span>返回</span></button><span>歌词</span></div>
            <div class="lyrics-scroll" id="lyrics-scroll"><div class="lyrics-heading"><span id="lyrics-song">歌曲</span><small id="lyrics-artist"></small></div><p class="lyrics-status" id="lyrics-status" role="status"></p><div class="lyrics-lines" id="lyrics-lines"></div><button class="lyrics-retry" id="lyrics-retry" hidden>重试</button></div>
          </section>
          <aside class="queue-panel" id="queue-panel" aria-label="待播清单" hidden><div class="section-heading"><h2>待播清单</h2><button class="icon-button" id="close-queue" aria-label="关闭待播清单">${icon("close")}</button></div><p class="section-detail" id="queue-detail">选择一首歌曲开始播放</p><div id="queue-tracks"></div></aside>
        </div>
        <footer class="player" aria-label="音乐播放器">
          <div class="now-playing"><button id="cover-toggle" class="cover-toggle" aria-label="打开歌词" aria-expanded="false" aria-controls="lyrics-view" title="打开歌词"><span id="now-cover">${cover({})}</span></button><div class="now-info"><strong id="now-title">让音乐陪着你</strong><span id="now-artist">选择一首喜欢的歌曲</span></div><button id="now-favorite" class="icon-button" aria-label="喜欢当前歌曲" aria-pressed="false" disabled>${icon("heart")}</button></div>
          <div class="playback"><div class="playback-buttons"><button class="icon-button minor" id="shuffle" aria-label="随机播放" aria-pressed="false">${icon("shuffle")}</button><button class="icon-button" id="previous" aria-label="上一首" disabled>${icon("previous")}</button><button class="play-button" id="play" aria-label="播放" disabled>${icon("play")}</button><button class="icon-button" id="next" aria-label="下一首" disabled>${icon("next")}</button><button class="icon-button minor" id="repeat" aria-label="单曲循环" aria-pressed="false">${icon("repeat")}</button></div><div class="timeline"><span id="elapsed">0:00</span><input id="seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="播放进度" disabled><span id="duration">0:00</span></div></div>
          <div class="player-tools"><button class="icon-button" id="mute" aria-label="静音" aria-pressed="false">${icon("volume")}</button><input id="volume" type="range" min="0" max="1" value="0.7" step="0.01" aria-label="音量"><span class="tool-divider"></span><button class="icon-button" id="lyrics-toggle" aria-label="打开歌词" aria-pressed="false" aria-controls="lyrics-view" title="歌词">${icon("microphone")}</button><button class="icon-button" id="queue-toggle" aria-label="待播清单" aria-expanded="false" aria-controls="queue-panel">${icon("queue")}</button></div>
        </footer>
        <div id="song-menu" role="menu" aria-label="歌曲操作" hidden></div>
        <dialog id="add-track-dialog"><div class="section-heading"><h2>添加到歌单</h2><button class="icon-button" id="close-add-track" aria-label="关闭添加到歌单">${icon("close")}</button></div><p id="add-track-status" role="status"></p><div id="add-track-list"></div></dialog>
        <dialog id="playlist-dialog"><form id="playlist-form"><div class="section-heading"><h2>打开歌单</h2><button type="button" class="icon-button" id="close-dialog" aria-label="关闭">${icon("close")}</button></div><p>输入网易云音乐歌单 ID，载入你想听的音乐。</p><label for="playlist-id">歌单 ID</label><input id="playlist-id" name="playlist" inputmode="numeric" pattern="[1-9][0-9]*" placeholder="例如：3778678" required><p class="section-detail">可在歌单分享链接的 id 参数中找到。</p><button type="submit" class="soft-button">打开歌单</button></form></dialog>
      </div>`;
    function $(selector) { return shadow.querySelector(selector); }
    var playback = options.sdk.playback;
    var windowControls = options.sdk.window;

    var shellReleases = [];
    var dragOrigin = null;
    var playbackState = playback.getState();
    var repeatOne = false;
    var previousVolume = playbackState.volume || 0.7;
    var desiredVolume = null;
    var volumeRunning = false;
    var seeking = false;

    var leaving = false;
    var state = { songs: [], queue: [], current: null, view: "discover", query: "", playlistId: "3778678", requestedId: "3778678", playlistName: "云音乐热歌榜", loading: false, pending: false, shuffle: false, disposed: false };
    var searchState = { items: [], keyword: "", total: 0, more: false, loading: false, version: 0, error: null };
    var loadVersion = 0;
    var playVersion = 0;
    var libraryVersion = 0;
    var createdVersion = 0;
    var subscribedVersion = 0;
    var likedVersion = 0;
    var likedIdsVersion = 0;
    var library = { account: null, created: [], offset: 0, more: false, loading: false, loaded: false, error: null,
      liked: [], likedMeta: null, likedOffset: 0, likedMore: false, likedLoading: false, likedLoaded: false, likedError: null,
      likedIds: new Set(), likedIdsLoaded: false, likedIdsError: null };
    var subscribed = { items: [], offset: 0, more: false, loading: false, loaded: false, error: null };
    var snapshot = options.sdk.librarySnapshots;
    var snapshotOwner = null;
    var identityConfirmed = false;
    var restoreLikedOnBoot = false;
    function saveSnapshot(key, value) {
      if (snapshot && snapshotOwner) snapshot.save(snapshotOwner, key, value).catch(function () {});
    }
    function restorePlaylist(id, saved) {
      if (!saved || !saved.meta || !Array.isArray(saved.songs) || String(saved.meta.id) !== String(id)) return false;
      playlistMeta = saved.meta;
      state.playlistId = String(id);
      state.playlistName = saved.meta.name || "我的歌单";
      state.songs = saved.songs;
      playlistOffset = Number(saved.offset) || saved.songs.length;
      playlistMore = playlistOffset < Number(saved.meta.trackCount);
      drawAlbums(); drawTracks(); markPlaylist();
      return true;
    }
    async function restoreSession() {
      if (!snapshot) return;
      var account = await snapshot.lastAccount();
      var original = !account && snapshot.original ? await snapshot.original() : null;
      if (original) account = original.account;
      if (!account || state.disposed) return;
      var owner = String(account.userId);
      var saved = await Promise.all([snapshot.read(owner, "created"), snapshot.read(owner, "liked"),
        snapshot.read(owner, "liked-ids"), snapshot.read(owner, "playlist:" + state.playlistId), snapshot.read(owner, "subscribed")]);
      if (state.disposed) return;
      if (original) { saved[0] = saved[0] || original.created; saved[2] = saved[2] || original.likedIds; }
      snapshotOwner = owner;
      library.account = { userId: owner, profile: { nickname: account.nickname } };
      if (saved[0] && Array.isArray(saved[0].items)) {
        library.created = saved[0].items; library.offset = Number(saved[0].offset) || 0;
        library.more = !!saved[0].more; library.loaded = true;
      }
      if (saved[1] && Array.isArray(saved[1].items)) {
        library.liked = saved[1].items; library.likedMeta = saved[1].meta || null;
        library.likedOffset = Number(saved[1].offset) || 0;
        library.likedMore = !!saved[1].more; library.likedLoaded = true;
        restoreLikedOnBoot = true;
      }
      if (Array.isArray(saved[2])) {
        library.likedIds = new Set(saved[2].map(String)); library.likedIdsLoaded = true;
      }
      if (saved[4] && Array.isArray(saved[4].items)) {
        subscribed.items = saved[4].items; subscribed.offset = Number(saved[4].offset) || 0;
        subscribed.more = !!saved[4].more; subscribed.loaded = true;
      }
      restorePlaylist(state.playlistId, saved[3]);
      drawLibrary(); drawSubscribed(); drawTracks();
      if (persistence) await persistence.restore(owner, false).catch(persistenceError);
    }
    function confirmAccount(account) {
      var owner = String(account.userId);
      var switched = !!snapshotOwner && snapshotOwner !== owner;
      if (switched) {
        // Remove the previous account's visible data as soon as identity is known.
        ++loadVersion; ++likedVersion; ++likedIdsVersion; ++libraryVersion; ++subscribedVersion;
        library.created = []; library.offset = 0; library.more = false; library.loaded = false;
        subscribed.items = []; subscribed.offset = 0; subscribed.more = false; subscribed.loaded = false;
        subscribed.loading = false; subscribed.error = null;
        library.liked = []; library.likedMeta = null; library.likedOffset = 0;
        library.likedMore = false; library.likedLoaded = false; library.likedLoading = false;
        library.likedIds = new Set(); library.likedIdsLoaded = false;
        state.songs = [];
        playlistMeta = null; playlistOffset = 0; playlistMore = false;
      }
      snapshotOwner = owner;
      identityConfirmed = true;
      library.account = account;
      if (persistence) persistence.restore(owner, true).catch(persistenceError);
      if (snapshot) snapshot.rememberAccount(account).catch(function () {});
      if (switched) loadPlaylist(state.playlistId);
    }
    var lyricsOpen = false, lyricsVersion = 0, lyricLines = [], lyricSynced = false, lyricActive = -2;
    var lyricsCache = new Map(), lyricsColorCache = new Map(), lyricsColorVersion = 0, userScrollUntil = 0;
    var likePending = new Set();
    var pageSize = 500, playlistMeta = null, playlistOffset = 0, playlistMore = false;
    var recommendationStates = {}, queueSource = null;
    var home = { items: [], loading: false, error: null, version: 0 };
    Object.keys(recommendationModes).forEach(function (key) {
      recommendationStates[key] = { items: [], loaded: false, loading: false, error: null, version: 0, offset: 0, meta: null, more: false, job: null };
    });
    var ownsPlayer = !options.player;
    var player = options.player || options.sdk.player.createSession({
      previousVolume: options.sdk.settings ? options.sdk.settings.getPlayback().previousVolume : previousVolume,
      resolveSong: function (id) { return findSong(id) || (options.sdk.songs.get ? options.sdk.songs.get(id) : null); },
      preparePlayback: function () { return persistence ? persistence.restoreVolume() : Promise.resolve(); },
      onError: playbackError, onMediaError: mediaError
    });
    var persistence = ownsPlayer && options.sdk.persistence && isStandalone()
      ? options.sdk.persistence.attach(player, { onError: persistenceError, onRecovered: function () { if ($("#notice-text").textContent === "播放状态保存或恢复失败，请重试。") report(""); } }) : null;
    if (persistence) previousVolume = options.sdk.settings.getPlayback().previousVolume;
    function persistenceError(error) {
      if (!state.disposed) report("播放状态保存或恢复失败，请重试。", error, function () { persistence.retry().catch(persistenceError); });
      if (namespace.log) namespace.log("Playback persistence: " + error.message);
    }
    var renderedButtonIcons = Object.create(null);
    function buttonIcon(selector, name) {
      // Progress events must not replace an SVG between pointer down and up:
      // removing the pressed node makes Chromium cancel the eventual click.
      if (renderedButtonIcons[selector] === name) return;
      renderedButtonIcons[selector] = name;
      $(selector).innerHTML = icon(name);
    }
    var retryAction = null;
    function report(message, error, retry) {
      retryAction = typeof retry === "function" ? retry : null;
      var visible = !!message && !!error;
      $("#notice").hidden = !visible;
      $("#notice").classList.toggle("error", visible);
      $("#notice-text").textContent = visible ? message : "";
      $("#retry").hidden = !visible || !retry;
    }
    async function runSearch(append) {
      var keyword = append ? searchState.keyword : $("#search").value.trim();
      if (!keyword || (append && searchState.loading)) return;
      var version = ++searchState.version;
      if (!append) { searchState.items = []; searchState.more = false; searchState.keyword = keyword; }
      searchState.loading = true; searchState.error = null; state.query = ""; setView("search");
      try {
        var result = await options.sdk.songs.search(keyword, { limit: 30, offset: append ? searchState.offset : 0 });
        if (state.disposed || version !== searchState.version) return;
        searchState.offset = (append ? searchState.offset : 0) + result.items.length;
        var items = new Map((append ? searchState.items : []).map(function (song) { return [String(song.id), song]; }));
        result.items.forEach(function (song) { items.set(String(song.id), song); });
        searchState.items = Array.from(items.values()); searchState.total = result.total; searchState.more = result.more;
      } catch (error) { if (version === searchState.version) searchState.error = error; }
      finally { if (!state.disposed && version === searchState.version) { searchState.loading = false; drawTracks(); } }
    }
    var menuSong = null, menuPlaylist = null, addTrackSong = null, addTrackVersion = 0;
    function closeSongMenu() { $("#song-menu").hidden = true; }
    function ownPlaylist(meta) {
      return identityConfirmed && meta && ((meta.creator && String(meta.creator.userId) === String(library.account.userId)) ||
        library.created.some(function (item) { return String(item.id) === String(meta.id); }));
    }
    shadow.addEventListener("contextmenu", function (event) {
      var row = event.target.closest("[data-song],[data-queue-play],.now-playing");
      if (!row) { closeSongMenu(); return; }
      var song = row.classList.contains("now-playing") ? state.current : findSong(row.dataset.song || row.dataset.queuePlay);
      if (!song) return;
      event.preventDefault(); menuSong = song;
      menuPlaylist = row.dataset.song && state.view === "playlist" && ownPlaylist(playlistMeta) ? playlistMeta.id :
        row.dataset.song && state.view === "liked" && ownPlaylist(library.likedMeta) ? library.likedMeta.id : null;
      var menu = $("#song-menu");
      menu.innerHTML = '<button role="menuitem" data-song-action="next">下一首播放</button>' + (song.localPath ? '' : '<button role="menuitem" data-song-action="add">添加到歌单</button>') +
        (menuPlaylist ? '<button role="menuitem" data-song-action="remove">从歌单删除</button>' : '');
      menu.hidden = false;
      menu.style.left = Math.max(8, Math.min(event.clientX, root.innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(event.clientY, root.innerHeight - menu.offsetHeight - 8)) + "px";
      menu.querySelector("button").focus();
    });
    shadow.addEventListener("pointerdown", function (event) { if (!event.target.closest("#song-menu")) closeSongMenu(); });
    shadow.addEventListener("keydown", function (event) { if (event.key === "Escape") closeSongMenu(); });
    shadow.addEventListener("scroll", closeSongMenu, true);
    async function showAddTrack(song) {
      addTrackSong = song; var version = ++addTrackVersion;
      $("#add-track-dialog").showModal(); $("#add-track-status").textContent = "正在读取你创建的歌单…"; $("#add-track-list").innerHTML = "";
      try {
        var items = [], offset = 0, result;
        do {
          result = await options.sdk.playlists.listCreated({ limit: 100, offset: offset });
          if (state.disposed || version !== addTrackVersion) return;
          items = items.concat(result.items); offset += result.items.length;
        } while (result.more && result.items.length);
        $("#add-track-status").textContent = items.length ? "选择目标歌单" : "还没有可添加的歌单，请先创建歌单。";
        $("#add-track-list").innerHTML = items.map(function (item) { return '<button class="soft-button" data-add-track="' + escape(item.id) + '">' + escape(item.name) + '</button>'; }).join("");
      } catch (error) { if (!state.disposed && version === addTrackVersion) $("#add-track-status").textContent = libraryMessage(error); }
    }
    $("#close-add-track").onclick = function () { ++addTrackVersion; $("#add-track-dialog").close(); };
    shadow.addEventListener("click", async function (event) {
      var button = event.target.closest("[data-song-action],[data-add-track]");
      if (!button) return;
      var song = menuSong, playlistId = menuPlaylist;
      closeSongMenu();
      try {
        if (button.dataset.songAction === "next") { player.insertNext(song); }
        if (button.dataset.songAction === "add") { await showAddTrack(song); }
        if (button.dataset.songAction === "remove") {
          await options.sdk.playlists.removeTrack(playlistId, song.id);
          if (state.disposed) return;
          if (String(state.playlistId) === String(playlistId)) await loadPlaylist(playlistId);
          if (library.likedMeta && String(library.likedMeta.id) === String(playlistId)) { await loadLikedIds(); await loadLiked(); }
          await loadLibrary();
        }
        if (button.dataset.addTrack) {
          var version = addTrackVersion;
          $("#add-track-list").querySelectorAll("button").forEach(function (item) { item.disabled = true; });
          try {
            await options.sdk.playlists.addTrack(button.dataset.addTrack, addTrackSong.id);
            if (state.disposed || version !== addTrackVersion) return;
            $("#add-track-status").textContent = "已添加到歌单";
            if (String(state.playlistId) === button.dataset.addTrack) await loadPlaylist(state.playlistId);
            await loadLikedIds(); await loadLibrary();
          } catch (error) { if (!state.disposed && version === addTrackVersion) $("#add-track-status").textContent = "添加失败，请重试（" + (error.code || error.message) + "）"; }
          finally { if (!state.disposed && version === addTrackVersion) $("#add-track-list").querySelectorAll("button").forEach(function (item) { item.disabled = false; }); }
        }
      } catch (error) { if (!state.disposed) report("歌曲操作失败（" + (error.code || error.message) + "）", true); }
    });
    function visibleSongs() {
      var songs = recommendationStates[state.view] ? recommendationStates[state.view].items : ["created", "subscribed", "discover"].includes(state.view) ? [] : state.view === "search" ? searchState.items : state.view === "songs" ? state.queue : state.view === "liked" ? library.liked : state.songs;
      return options.sdk.presentation.filterSongs(songs, state.view === "search" ? "" : state.query);
    }
    function selected(song) { return state.current && String(song.id) === String(state.current.id); }
    var renderedSongs = [], trackWindow = "", trackFrame = null;
    function renderTrackRows(songs, force) {
      var main = $("#main"), body = $("#tracks");
      var count = songs.length, start = 0, end = count;
      body.dataset.total = String(count);
      body.closest("table").setAttribute("aria-rowcount", String(count + 1));
      if ($(".track-section").hidden) { body.textContent = ""; trackWindow = ""; return; }
      if (count > 120) {
        var tableTop = body.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
        var size = Math.min(80, Math.max(24, Math.ceil(main.clientHeight / 56) + 16));
        start = Math.min(Math.max(0, count - size), Math.max(0, Math.floor((main.scrollTop - tableTop) / 56) - 8));
        end = Math.min(count, start + size);
      }
      var windowKey = start + ":" + end;
      if (!force && windowKey === trackWindow) return;
      trackWindow = windowKey;
      var focused = shadow.activeElement;
      var focusedId = focused && (focused.dataset.play || focused.dataset.like);
      var focusedType = focused && focused.dataset.play ? "play" : "like";
      var html = songs.slice(start, end).map(function (song, offset) {
        var index = start + offset;
        var key = String(song.id);
        var liked = library.likedIds.has(key);
        return '<tr aria-rowindex="' + (index + 2) + '" data-song="' + escape(song.id) + '" class="' + (selected(song) ? "current" : "") + '"><td class="track-index">' + (selected(song) ? icon("music") : String(index + 1).padStart(2, "0")) + '</td><td><button class="track-button" data-play="' + escape(song.id) + '" aria-label="播放 ' + escape(song.name) + '">' + cover(song) + '<span class="track-copy"><strong>' + escape(song.name) + '</strong><small>' + escape(artists(song)) + '</small></span><span class="row-play">' + icon("play") + '</span></button></td><td class="album-column">' + escape(album(song).name || "—") + '</td><td class="time-column">' + time((song.dt || song.duration || 0) / 1000) + '</td><td><button class="icon-button favorite" data-like="' + escape(song.id) + '" aria-pressed="' + liked + '" aria-label="' + (liked ? "取消喜欢 " : "喜欢 ") + escape(song.name) + '" ' + (song.localPath || !library.likedIdsLoaded || !identityConfirmed || likePending.has(key) ? 'disabled ' : '') + '>' + icon("heart") + '</button></td></tr>';
      }).join("");
      function spacer(height) { return '<tr class="track-spacer" aria-hidden="true"><td colspan="5" style="height:' + height + 'px"></td></tr>'; }
      body.innerHTML = (start ? spacer(start * 56) : "") + html + (end < count ? spacer((count - end) * 56) : "");
      if (focusedId) {
        var replacement = Array.from(body.querySelectorAll("[data-" + focusedType + "]")).find(function (button) { return button.dataset[focusedType] === focusedId; });
        if (replacement) replacement.focus({ preventScroll: true });
      }
    }
    function refreshTrackWindow() {
      if (trackFrame !== null || renderedSongs.length <= 120) return;
      trackFrame = root.requestAnimationFrame(function () { trackFrame = null; if (!state.disposed) renderTrackRows(renderedSongs, false); });
    }
    $("#main").addEventListener("scroll", refreshTrackWindow, { passive: true });
    root.addEventListener("resize", refreshTrackWindow);
    function drawTracks() {
      var songs = visibleSongs();
      renderedSongs = songs;
      renderTrackRows(songs, true);
      $("#empty").hidden = songs.length > 0 || state.loading;
      $(".table-wrap").hidden = !songs.length;
      $("#empty-title").textContent = state.query ? "没有找到匹配的歌曲" : "暂时没有歌曲";
      $("#empty-copy").textContent = state.query ? "试试其他歌曲名、艺人或专辑名。" : "尝试重新加载，或打开另一份歌单。";
      $("#list-heading").textContent = state.query ? "搜索结果" : state.playlistName;
      $("#list-eyebrow").textContent = state.query ? "当前歌单" : "精选歌单";
      $("#list-detail").textContent = state.loading ? state.songs.length ? "正在更新歌单… · 已载入 " + state.songs.length + " 首" : "正在获取歌单…" : songs.length + " 首歌曲 · 网易云音乐";
      $("#play-all").disabled = !songs.length;
      $("#play").disabled = !state.current && !songs.length;
      var liked = !!state.current && library.likedIds.has(String(state.current.id));
      $("#now-favorite").setAttribute("aria-pressed", String(liked));
      $("#now-favorite").setAttribute("aria-label", liked ? "取消喜欢当前歌曲" : "喜欢当前歌曲");
      $("#now-favorite").disabled = !state.current || !!state.current.localPath || !library.likedIdsLoaded || !identityConfirmed || likePending.has(String(state.current.id));
      $("#reload-liked").hidden = state.view !== "liked";
      $("#reload-liked").disabled = library.likedLoading;
      $("#more-liked").hidden = state.view !== "liked" || !library.likedMore;
      $("#more-liked").disabled = library.likedLoading;
      $("#more-liked").textContent = library.likedLoading ? "正在加载…" : "加载更多喜欢的歌曲";
      $("#liked-status").hidden = state.view !== "liked" || (!library.likedError && !library.likedLoading && !library.likedIdsError);
      $("#liked-status").textContent = library.likedError ? libraryMessage(library.likedError) : library.likedIdsError ? "喜欢状态读取失败，请刷新账号歌单重试。" : "正在读取喜欢的歌曲…";
      if (state.view === "liked") {
        $("#list-heading").textContent = "我喜欢的音乐";
        $("#list-eyebrow").textContent = "网易云音乐 · 账号歌单";
        $("#list-detail").textContent = "已载入 " + library.liked.length + " 首" + (state.query ? " · 匹配 " + songs.length + " 首" : "") + (library.likedMeta ? " · " + library.likedMeta.name : "");
        $("#empty").hidden = songs.length > 0 || library.likedLoading || !!library.likedError;
        $("#empty-title").textContent = state.query ? "没有找到匹配的歌曲" : "还没有喜欢的歌曲";
        $("#empty-copy").textContent = state.query ? "搜索范围为已载入的喜欢的歌曲。" : "点击歌曲旁或播放器中的爱心，即可加入账号的我喜欢的音乐。";
      }
      $("#more-search").hidden = state.view !== "search" || !searchState.more;
      $("#more-search").disabled = searchState.loading;
      if (state.view === "songs") {
        $("#list-heading").textContent = "当前歌曲列表";
        $("#list-eyebrow").textContent = "播放队列";
        $("#list-detail").textContent = state.queue.length + " 首歌曲";
        $("#empty").hidden = !!songs.length;
        $("#empty-copy").textContent = "播放一份歌单或搜索歌曲后，这里会显示当前播放列表。";
      }
      if (state.view === "search") {
        $("#list-heading").textContent = "搜索结果";
        $("#list-eyebrow").textContent = "全站歌曲";
        $("#list-detail").textContent = searchState.loading ? "正在搜索…" : searchState.error ? "搜索失败，请按回车重试。" : "“" + searchState.keyword + "” · 共 " + searchState.total + " 首 · 已载入 " + songs.length + " 首";
        $("#empty").hidden = !!songs.length || searchState.loading || !!searchState.error;
      }
      var rec = recommendationStates[state.view], mode = recommendationModes[state.view];
      $("#recommendation-actions").hidden = !rec;
      $("#recommendation-status").hidden = !rec || (!rec.loading && !rec.error);
      $("#more-recommended").hidden = !rec || !rec.loaded || !(mode.dynamic || rec.more);
      $("#reload-playlist").hidden = !!rec || state.view !== "playlist";
      $("#reload-playlist").disabled = state.loading;
      $("#more-playlist").hidden = $("#reload-playlist").hidden || !playlistMore;
      $("#more-playlist").disabled = state.loading;
      if (rec) {
        $("#list-heading").textContent = mode.title;
        $("#list-eyebrow").textContent = "为你推荐";
        $("#list-detail").textContent = "已载入 " + rec.items.length + " 首" + (state.query ? " · 匹配 " + songs.length + " 首" : "");
        $("#recommendation-description").textContent = mode.copy + (mode.dynamic ? " 播放到队列末尾会继续获取推荐。" : "");
        $("#recommendation-status").textContent = rec.error ? (rec.error.code === "LOGIN_REQUIRED" ? "请先在网易云原版登录，再刷新推荐。" : "推荐加载失败，请点击刷新重试。") : "正在为你寻找音乐…";
        $("#reload-recommended").disabled = $("#more-recommended").disabled = rec.loading;
        $("#more-recommended").textContent = rec.loading ? "正在加载…" : mode.dynamic ? "下一批推荐" : "再载入 500 首";
        $("#play-all").disabled = !songs.length;
        $("#empty").hidden = !!songs.length || rec.loading || !!rec.error;
        $("#empty-title").textContent = state.query ? "没有找到匹配的歌曲" : "暂时没有推荐歌曲";
        $("#empty-copy").textContent = state.query ? "搜索范围为已载入的推荐歌曲。" : state.view === "heartmode" ? "先喜欢一些歌曲，再来开启心动模式。" : "稍后刷新，再发现新的旋律。";
      }
    }
    function drawAlbums() {
      $("#albums").innerHTML = home.items.slice(0, 12).map(function (item) {
        return '<button class="album-card" data-playlist="' + escape(item.id) + '" data-playlist-name="' + escape(item.name) + '" aria-label="打开歌单 ' + escape(item.name) + '"><span class="album-art">' + cover({ al: { picUrl: item.coverImgUrl } }) + '<span class="album-play">' + icon("arrow") + '</span></span><strong>' + escape(item.name) + '</strong></button>';
      }).join("");
      $("#home-recommendation-status").textContent = home.error ? home.items.length ? "推荐歌单更新失败，已显示上次的内容。" : "推荐歌单加载失败，请点击刷新重试。" : home.loading ? home.items.length ? "正在更新推荐歌单…" : "正在加载推荐歌单…" : home.items.length ? "" : "暂无推荐歌单。";
      $("#home-recommendation-status").hidden = !$("#home-recommendation-status").textContent;
      $("#refresh-home-playlists").disabled = home.loading;
    }
    async function loadHomePlaylists() {
      if (home.loading || state.disposed) return;
      var version = ++home.version;
      home.loading = true; home.error = null; drawAlbums();
      try {
        await namespace.app.whenReady(5000);
        if (state.disposed || version !== home.version) return;
        var result = await options.sdk.recommendations.getRecommendedPlaylists();
        if (state.disposed || version !== home.version) return;
        var seen = new Set();
        home.items = (Array.isArray(result) ? result : []).filter(function (item) {
          var id = item && String(item.id);
          if (!/^[1-9]\d*$/.test(id) || seen.has(id)) return false;
          seen.add(id); return true;
        }).map(function (item) { return { id: String(item.id), name: item.name || "歌单", coverImgUrl: item.coverImgUrl || "" }; });
      } catch (error) { if (!state.disposed && version === home.version) home.error = error; }
      finally { if (!state.disposed && version === home.version) { home.loading = false; drawAlbums(); } }
    }
    function drawQueue() {
      $("#queue-detail").textContent = state.queue.length ? state.queue.length + " 首歌曲" + (state.queue.length > 100 ? " · 仅显示前 100 首" : "") + " · " + (state.shuffle ? "随机播放" : "顺序播放") : "选择一首歌曲开始播放";
      $("#queue-tracks").innerHTML = state.queue.slice(0, 100).map(function (song) {
        return '<button class="queue-track ' + (selected(song) ? "current" : "") + '" data-queue-play="' + escape(song.id) + '">' + cover(song) + '<span class="track-copy"><strong>' + escape(song.name) + '</strong><small>' + escape(artists(song)) + '</small></span>' + (selected(song) ? icon("music") : "") + '</button>';
      }).join("");
    }
    function libraryMessage(error) {
      return error && error.code === "LOGIN_REQUIRED" ? "请先在网易云原版登录，再回到这里刷新。" : "账号歌单读取失败，请点击刷新重试。";
    }
    function playlistCard(item) {
      return '<button class="album-card created-card" data-playlist="' + escape(item.id) + '" data-playlist-name="' + escape(item.name) + '" aria-label="打开歌单 ' + escape(item.name) + '"><span class="album-art">' + cover({ al: { picUrl: item.coverImgUrl } }) + '</span><strong>' + escape(item.name) + '</strong><small>' + (Number(item.trackCount) || 0) + ' 首歌曲</small></button>';
    }
    function drawHomeLibrary() {
      [["created", library, "创建"], ["subscribed", subscribed, "收藏"]].forEach(function (entry) {
        var kind = entry[0], data = entry[1], label = entry[2];
        $("#home-" + kind + "-grid").innerHTML = (kind === "created" ? data.created : data.items).slice(0, 6).map(playlistCard).join("");
        var count = kind === "created" ? data.created.length : data.items.length;
        var status = data.error ? count ? "正在显示已保存的歌单，更新失败；请刷新账号歌单重试。" : libraryMessage(data.error)
          : data.loading ? count ? "正在更新歌单…" : "正在读取" + label + "的歌单…"
          : !data.loaded ? "正在读取" + label + "的歌单…" : count ? "" : "还没有" + label + "的歌单。";
        $("#home-" + kind + "-status").textContent = status;
        $("#home-" + kind + "-status").hidden = !status;
      });
      markPlaylist();
    }
    function drawLibrary() {
      var query = state.view === "created" ? state.query.toLocaleLowerCase().trim() : "";
      var items = library.created.filter(function (item) { return !query || String(item.name).toLocaleLowerCase().includes(query); });
      $("#account-name").textContent = library.account ? (library.account.profile && library.account.profile.nickname || "已登录网易云音乐") : library.loading ? "正在读取账号…" : library.error && library.error.code === "LOGIN_REQUIRED" ? "尚未登录" : "账号暂不可用";
      $("#account-name").title = $("#account-name").textContent;
      $("#refresh-library").disabled = $("#reload-created").disabled = library.loading;
      $("#created-detail").textContent = "已载入 " + library.created.length + " 份歌单" + (query ? " · 匹配 " + items.length + " 份" : "");
      $("#created-status").textContent = library.error ? library.created.length ? "正在显示本地歌单，刷新失败；请点击刷新重试。" : libraryMessage(library.error) : library.loading ? library.created.length ? "正在更新歌单…" : "正在读取创建的歌单…" : !items.length ? (query ? "没有找到匹配的歌单。" : "还没有自己创建的歌单。") : "";
      $("#created-status").hidden = !$("#created-status").textContent;
      $("#created-grid").innerHTML = items.map(playlistCard).join("");
      drawSidebarPlaylists();
      $("#more-created").hidden = !library.more;
      $("#more-created").disabled = library.loading;
      $("#more-created").textContent = library.loading ? "正在加载…" : "加载更多歌单";
      drawHomeLibrary();
    }
    function drawSubscribed() {
      var query = state.view === "subscribed" ? state.query.toLocaleLowerCase().trim() : "";
      var items = subscribed.items.filter(function (item) { return !query || String(item.name).toLocaleLowerCase().includes(query); });
      $("#subscribed-detail").textContent = "已载入 " + subscribed.items.length + " 份歌单" + (query ? " · 匹配 " + items.length + " 份" : "");
      $("#subscribed-status").textContent = subscribed.error ? subscribed.items.length ? "正在显示已保存的歌单，刷新失败；请点击刷新重试。" : libraryMessage(subscribed.error)
        : subscribed.loading ? subscribed.items.length ? "正在更新歌单…" : "正在读取收藏的歌单…"
        : !subscribed.loaded ? "正在读取收藏的歌单…"
        : !items.length ? query ? "没有找到匹配的歌单。" : "还没有收藏的歌单。" : "";
      $("#subscribed-status").hidden = !$("#subscribed-status").textContent;
      $("#subscribed-grid").innerHTML = items.map(playlistCard).join("");
      $("#reload-subscribed").disabled = $("#refresh-library").disabled;
      $("#more-subscribed").hidden = !subscribed.more;
      $("#more-subscribed").disabled = subscribed.loading;
      $("#more-subscribed").textContent = subscribed.loading ? "正在加载…" : "加载更多歌单";
      drawSidebarPlaylists();
      drawHomeLibrary();
    }
    function drawSidebarPlaylists() {
      var created = library.created, saved = subscribed.items;
      $("#sidebar-created").innerHTML = [["创建的歌单", created], ["收藏的歌单", saved]].map(function (group) {
        if (!group[1].length) return "";
        return '<div class="playlist-group-label">' + group[0] + '</div>' + group[1].map(function (item) {
          return '<button class="nav-item playlist-link" data-playlist="' + escape(item.id) + '" data-playlist-name="' + escape(item.name) + '" title="' + escape(item.name) + '">' + icon("music") + '<span>' + escape(item.name) + '</span></button>';
        }).join("");
      }).join("");
      markPlaylist();
    }
    function markPlaylist() {
      shadow.querySelectorAll("[data-playlist]").forEach(function (button) {
        var current = state.view === "playlist" && String(state.playlistId) === button.dataset.playlist;
        button.classList.toggle("selected", current);
        if (current) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      });
    }
    async function loadLibrary(append) {
      if (library.loading || state.disposed) return;
      var version = ++createdVersion;
      library.loading = true; library.error = null;
      if (!append) {
        if (library.loaded || ownsPlayer) player.clearContinuation();
        ++libraryVersion;
        ++subscribedVersion; subscribed.loading = false;
        Object.keys(recommendationStates).forEach(function (key) {
          var rec = recommendationStates[key]; ++rec.version;
          rec.items = []; rec.loaded = false; rec.loading = false; rec.error = null; rec.job = null;
        });
        ++likedVersion; ++likedIdsVersion;
        library.likedLoading = false; library.likedLoaded = false;
        library.likedError = null; library.likedIdsError = null;
      }
      drawLibrary(); drawTracks();
      try {
        await namespace.app.whenReady(5000);
        if (state.disposed || version !== createdVersion) return;
        var account = await options.sdk.account.getCurrent();
        if (state.disposed || version !== createdVersion) return;
        confirmAccount(account);
        if (!append) loadLikedIds();
        var result = await options.sdk.playlists.listCreated({ limit: 30, offset: append ? library.offset : 0 });
        if (state.disposed || version !== createdVersion) return;
        if (result.more && !result.items.length) throw new Error("playlist pagination did not advance");
        // Offset counts every SDK item, including specialType=5, which has its own entry.
        library.offset = (append ? library.offset : 0) + result.items.length;
        var byId = new Map((append ? library.created : []).map(function (item) { return [String(item.id), item]; }));
        result.items.forEach(function (item) { if (Number(item.specialType) !== 5) byId.set(String(item.id), item); });
        library.created = Array.from(byId.values());
        library.more = result.more; library.loaded = true;
        saveSnapshot("created", { items: library.created, offset: library.offset, more: library.more });
      } catch (error) {
        if (state.disposed || version !== createdVersion) return;
        library.error = error;
        if (error.code === "LOGIN_REQUIRED") {
          if (persistence) persistence.restore("guest", true).catch(persistenceError);
          if (snapshot && snapshotOwner) snapshot.forgetAccount(snapshotOwner).catch(function () {});
          snapshotOwner = null; identityConfirmed = false;
          ++libraryVersion; ++likedVersion; ++likedIdsVersion; ++subscribedVersion;
          library.account = null; library.created = []; library.offset = 0; library.more = false;
          subscribed.items = []; subscribed.offset = 0; subscribed.more = false;
          subscribed.loading = false; subscribed.loaded = false; subscribed.error = error;
          library.liked = []; library.likedMeta = null; library.likedOffset = 0; library.likedMore = false;
          library.likedLoading = false; library.likedLoaded = false; library.likedError = error;
          library.likedIds = new Set(); library.likedIdsLoaded = false; library.likedIdsError = error;
          if (state.playlistId !== "3778678") {
            ++loadVersion; state.songs = []; playlistMeta = null; playlistOffset = 0; playlistMore = false;
          }
          drawSubscribed(); drawTracks();
        }
      } finally {
        if (!state.disposed && version === createdVersion) {
          library.loading = false; drawLibrary();
          if (!append && identityConfirmed) loadSubscribed();
          if (!append && restoreLikedOnBoot) {
            restoreLikedOnBoot = false;
            if (!library.error && !library.likedLoading) loadLiked();
          }
          if (state.view === "liked" && !library.likedLoaded && !library.likedLoading && !library.likedError) loadLiked();
          if (recommendationStates[state.view] && !recommendationStates[state.view].loaded) loadRecommendation(state.view);
        }
      }
    }
    async function loadSubscribed(append) {
      if (subscribed.loading || !identityConfirmed || state.disposed) return;
      var version = ++subscribedVersion, accountVersion = libraryVersion;
      function active() { return !state.disposed && version === subscribedVersion && accountVersion === libraryVersion; }
      subscribed.loading = true; subscribed.error = null; drawSubscribed();
      try {
        await namespace.app.whenReady(5000);
        if (!active()) return;
        var account = await options.sdk.account.getCurrent();
        if (!active()) return;
        if (String(account.userId) !== snapshotOwner) { confirmAccount(account); loadLibrary(); return; }
        var result = await options.sdk.playlists.listSubscribed({ limit: 30, offset: append ? subscribed.offset : 0 });
        if (!active()) return;
        if (result.more && !result.items.length) throw new Error("playlist pagination did not advance");
        subscribed.offset = (append ? subscribed.offset : 0) + result.items.length;
        var byId = new Map((append ? subscribed.items : []).map(function (item) { return [String(item.id), item]; }));
        result.items.forEach(function (item) { byId.set(String(item.id), item); });
        subscribed.items = Array.from(byId.values()); subscribed.more = result.more; subscribed.loaded = true;
        saveSnapshot("subscribed", { items: subscribed.items, offset: subscribed.offset, more: subscribed.more });
      } catch (error) { if (active()) subscribed.error = error; }
      finally { if (active()) { subscribed.loading = false; drawSubscribed(); } }
    }
    async function loadLikedIds() {
      var version = ++likedIdsVersion;
      var accountVersion = libraryVersion;
      function active() { return !state.disposed && version === likedIdsVersion && accountVersion === libraryVersion; }
      try {
        var ids = await options.sdk.songs.getLikedIds();
        if (!active()) return;
        library.likedIds = new Set(ids.map(String));
        library.likedIdsLoaded = true; library.likedIdsError = null;
        saveSnapshot("liked-ids", Array.from(library.likedIds));
        if ($("#notice-text").textContent === "喜欢状态读取失败，请刷新账号歌单重试。") report("");
      } catch (error) {
        if (!active()) return;
        library.likedIdsError = error;
        report("喜欢状态读取失败，请刷新账号歌单重试。", true);
      } finally { if (active()) drawTracks(); }
    }
    async function loadLiked(append) {
      if (library.likedLoading || state.disposed) return;
      var version = ++likedVersion;
      var accountVersion = libraryVersion;
      function active() { return !state.disposed && version === likedVersion && accountVersion === libraryVersion; }
      library.likedLoading = true; library.likedError = null;
      drawTracks();
      try {
        await namespace.app.whenReady(5000);
        if (!active()) return;
        if (!append) {
          var meta = await options.sdk.playlists.getLiked();
          if (!active()) return;
          library.likedMeta = meta;
        }
        if (library.likedMeta) {
          var offset = append ? library.likedOffset : 0;
          var songs = await options.sdk.songs.listLiked({ limit: pageSize, offset: offset });
          if (!active()) return;
          var byId = new Map((append ? library.liked : []).map(function (song) { return [String(song.id), song]; }));
          songs.forEach(function (song) { byId.set(String(song.id), song); });
          library.liked = Array.from(byId.values());
          library.likedOffset = offset + pageSize;
          var total = Number(library.likedMeta.trackCount);
          library.likedMore = Number.isFinite(total) ? library.likedOffset < total : songs.length === pageSize;
        } else {
          library.liked = []; library.likedOffset = 0; library.likedMore = false;
        }
        library.likedLoaded = true;
        saveSnapshot("liked", { items: library.liked, meta: library.likedMeta,
          offset: library.likedOffset, more: library.likedMore });
      } catch (error) { if (active()) library.likedError = error; }
      finally { if (active()) { library.likedLoading = false; drawTracks(); } }
    }
    function loadRecommendation(kind, append) {
      var rec = recommendationStates[kind];
      if (!rec || state.disposed) return Promise.resolve([]);
      if (rec.loading) return rec.job;
      var version = ++rec.version, accountVersion = libraryVersion;
      function active() { return !state.disposed && rec.version === version && accountVersion === libraryVersion; }
      rec.loading = true; rec.error = null;
      drawTracks();
      rec.job = (async function () {
        try {
          await namespace.app.whenReady(5000);
          if (!active()) return [];
          var api = options.sdk.recommendations, songs = [], offset = append ? rec.offset : 0;
          if (kind === "daily") songs = await api.getDailySongs();
          else if (kind === "radar") {
            if (!append) rec.meta = await api.getPrivateRadar();
            if (!active()) return [];
            if (rec.meta) songs = await options.sdk.playlists.getTracks(rec.meta.id, { limit: pageSize, offset: offset });
          } else if (kind === "roaming") songs = await api.getPrivateRoaming();
          else {
            var seed = append && rec.items.length ? rec.items[rec.items.length - 1].id : null;
            songs = await api.getHeartMode(seed ? { songId: seed, startMusicId: rec.items[0].id } : {});
          }
          if (!active()) return [];
          var byId = new Map((append ? rec.items : []).map(function (song) { return [String(song.id), song]; }));
          var additions = [];
          songs.forEach(function (song) {
            if (!song || !/^[1-9]\d*$/.test(String(song.id))) return;
            var item = Object.assign({}, song, { name: song.name || "歌曲 " + song.id });
            if (!byId.has(String(song.id))) additions.push(item);
            byId.set(String(song.id), item);
          });
          rec.items = Array.from(byId.values()); rec.loaded = true;
          rec.offset = offset + pageSize;
          rec.more = kind === "radar" && rec.meta && rec.offset < Number(rec.meta.trackCount);
          if (append && queueSource === kind) player.append(additions, kind);

          return additions;
        } catch (cause) { if (active()) rec.error = cause; return []; }
        finally { if (active()) { rec.loading = false; rec.job = null; drawTracks(); } }
      })();
      return rec.job;
    }
    var refreshingData = false;
    async function refreshData(action) {
      if (refreshingData || state.disposed) return;
      refreshingData = true;
      try {
        if (options.sdk.cache) await options.sdk.cache.refresh().catch(function (cause) {
          if (namespace.log) namespace.log("Native library cache refresh: " + cause.message);
        });
        if (!state.disposed) await action();
      } finally { refreshingData = false; }
    }
    function setView(view) {
      if (lyricsOpen) toggleLyrics(false);
      if (state.view === "search" && view !== "search") { ++searchState.version; searchState.loading = false; }
      closeSongMenu();
      state.view = view;
      $("#main").scrollTop = 0;
      if (view === "discover") report("");
      $("#toolbar-title").textContent = recommendationModes[view] ? recommendationModes[view].title : { search: "搜索", discover: "主页", songs: "歌曲", liked: "我喜欢的音乐", created: "我创建的歌单", subscribed: "我收藏的歌单", playlist: "当前歌单" }[view];
      $("#discover").hidden = view !== "discover";
      $("#created-view").hidden = view !== "created";
      $("#subscribed-view").hidden = view !== "subscribed";
      $(".track-section").hidden = ["created", "subscribed", "discover"].includes(view);
      $("#main").classList.toggle("track-scroll", !$(".track-section").hidden);
      $(".search").hidden = false;
      shadow.querySelectorAll("[data-view]").forEach(function (button) {
        button.classList.toggle("selected", button.dataset.view === view);
        if (button.dataset.view === view) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      $("#search").placeholder = ["discover", "search"].includes(view) ? "搜索全站歌曲，回车搜索" : view === "songs" ? "搜索当前歌曲列表" : ["created", "subscribed"].includes(view) ? "搜索已载入的歌单" : view === "liked" ? "搜索已载入的喜欢歌曲" : "搜索当前歌单";
      $("#search").setAttribute("aria-label", $("#search").placeholder);
      drawTracks(); drawLibrary(); drawSubscribed();
      if (view === "liked" && (!snapshotOwner || identityConfirmed) && !library.likedLoaded && !library.likedLoading && !library.likedError) loadLiked();
      if (view === "created" && !library.loaded && !library.loading && !library.error) loadLibrary();
      if (view === "subscribed" && identityConfirmed && !subscribed.loaded && !subscribed.loading && !subscribed.error) loadSubscribed();
      if (recommendationStates[view] && !recommendationStates[view].loaded && !recommendationStates[view].error) loadRecommendation(view);
      $("#main").scrollTop = 0;
    }
    async function loadPlaylist(id, append, nameHint) {
      var version = ++loadVersion;
      state.requestedId = id;
      var switching = !append && String(state.playlistId) !== String(id);
      if (switching) {
        state.playlistId = String(id); state.playlistName = nameHint || "歌单 " + id;
        state.songs = []; playlistMeta = null; playlistOffset = 0; playlistMore = false;
      }
      state.loading = true;
      if (["songs", "playlist"].includes(state.view)) report("");
      drawTracks();
      try {
        if (!append && !state.songs.length && snapshot && snapshotOwner) {
          var saved = await snapshot.read(snapshotOwner, "playlist:" + id);
          if (state.disposed || version !== loadVersion) return;
          restorePlaylist(id, saved);
        }
        await namespace.app.whenReady(5000);
        if (state.disposed || version !== loadVersion) return;
        var verifiedAccount = await options.sdk.account.getCurrent().catch(function () { return null; });
        if (state.disposed || version !== loadVersion) return;
        if (verifiedAccount) {
          if (snapshotOwner && snapshotOwner !== String(verifiedAccount.userId)) {
            confirmAccount(verifiedAccount);
            return;
          }
          confirmAccount(verifiedAccount);
        }
        var offset = append ? playlistOffset : 0;
        var results = await Promise.all([append ? playlistMeta : options.sdk.playlists.get(id), options.sdk.playlists.getTracks(id, { limit: pageSize, offset: offset })]);
        if (state.disposed || version !== loadVersion) return;
        if (!results[0]) throw new Error("未找到这份歌单");
        state.playlistId = id;
        state.playlistName = results[0].name || "我的歌单";
        playlistMeta = results[0]; playlistOffset = offset + pageSize;
        playlistMore = playlistOffset < Number(playlistMeta.trackCount);
        var merged = new Map((append ? state.songs : []).map(function (song) { return [String(song.id), song]; }));
        results[1].forEach(function (song) { merged.set(String(song.id), song); });
        state.songs = Array.from(merged.values());
        if (verifiedAccount) saveSnapshot("playlist:" + id, { meta: playlistMeta, songs: state.songs, offset: playlistOffset });
        if (["songs", "playlist"].includes(state.view))
          report(library.likedIdsError ? "喜欢状态读取失败，请刷新账号歌单重试。" : "", !!library.likedIdsError);
      } catch (error) {
        if (state.disposed || version !== loadVersion) return;
        if (["songs", "playlist"].includes(state.view)) report((state.songs.length ? "正在显示本地歌单，更新失败；请稍后重试。" : "歌单加载失败，请稍后重试或返回原版。") + (error.code ? "（" + error.code + "）" : ""), true, true);
      } finally {
        if (!state.disposed && version === loadVersion) { state.loading = false; drawAlbums(); drawTracks(); markPlaylist(); }
      }
    }
    async function toggleLiked(song) {
      if (!song || song.localPath || !library.likedIdsLoaded || !identityConfirmed || state.disposed) return;
      var key = String(song.id);
      if (likePending.has(key)) return;
      var liked = !library.likedIds.has(key);
      var accountVersion = libraryVersion;
      likePending.add(key); drawTracks();
      try {
        await options.sdk.songs.setLiked(song.id, liked);
        if (state.disposed || accountVersion !== libraryVersion) return;
        if (liked) library.likedIds.add(key); else library.likedIds.delete(key);
        saveSnapshot("liked-ids", Array.from(library.likedIds));
        // The liked-list count and paging can change after a mutation.
        library.likedLoaded = false;
        if (state.view === "liked") {
          ++likedVersion;
          library.likedLoading = false;
          loadLiked();
        }
        report("");
      } catch (error) {
        if (!state.disposed && accountVersion === libraryVersion)
          report(error.code === "LOGIN_REQUIRED" ? "请先在网易云原版登录，再回来刷新。" : "喜欢操作失败，请稍后重试。" + (error.code ? "（" + error.code + "）" : ""), true);
      } finally { likePending.delete(key); if (!state.disposed) drawTracks(); }
    }
    function findSong(id) { return state.songs.concat(searchState.items, library.liked, state.queue,
      Object.keys(recommendationStates).flatMap(function (key) { return recommendationStates[key].items; }))
      .find(function (song) { return String(song.id) === String(id); }); }
    function showCurrent(song) {
      state.current = song;
      $("#now-title").textContent = song.name;
      $("#now-artist").textContent = artists(song);
      $("#now-cover").innerHTML = cover(song);
      if (lyricsOpen) { loadLyrics(song); updateLyricsColors(song); }
      $("#now-favorite").disabled = !!song.localPath || !library.likedIdsLoaded || likePending.has(String(song.id));
      $("#previous").disabled = state.queue.length < 2;
      $("#next").disabled = state.queue.length < 2 && !(recommendationModes[queueSource] || {}).dynamic;
      $("#shuffle").disabled = !!(recommendationModes[queueSource] || {}).dynamic;

    }
    function shellError(error) {
      if (!state.disposed) $("#shell-status").textContent = "窗口操作失败，请重试";
      if (namespace.log) namespace.log("Desktop shell: " + (error.code || error.message));
    }
    function mediaError(error) {
      if (!state.disposed) $("#shell-status").textContent = error.code === "ARTWORK_FAILED" ? "系统封面加载失败" : "系统媒体同步暂不可用";
      if (namespace.log) namespace.log("System media: " + (error.code || error.message));
    }

    function updateWindow(value) {
      if (state.disposed) return;
      $(".resize-handles").hidden = value.maximized;
      var label = value.maximized ? "还原窗口" : "最大化";
      $("#window-maximize").setAttribute("aria-label", label);
      $("#window-maximize").title = label;
      $("#window-maximize").innerHTML = value.maximized ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6V4h11v11h-2"/><rect x="4" y="9" width="11" height="11"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg>';
    }
    async function windowAction(action) {
      try { await action(); }
      catch (error) { shellError(error); }
    }

    function updatePlayback() {
      var loading = state.pending || playbackState.status === "loading";
      var status = playbackState.pendingStatus || playbackState.status;
      buttonIcon("#play", loading || status === "playing" ? "pause" : "play");
      $("#play").setAttribute("aria-label", loading ? "取消播放" : status === "playing" ? "暂停" : "播放");
      $("#play").setAttribute("aria-busy", String(loading || !!playbackState.pendingStatus || playbackState.buffering));
    }
    function updateTime() {
      if (seeking) return;
      var duration = Number.isFinite(playbackState.duration) ? playbackState.duration : 0;
      var current = Math.max(0, Math.min(playbackState.current || 0, duration || Infinity));
      $("#elapsed").textContent = time(current);
      $("#duration").textContent = time(duration);
      $("#seek").disabled = !duration || state.pending || !/^(playing|paused)$/.test(playbackState.status);
      $("#seek").max = duration || 100;
      $("#seek").value = current;
      $("#seek").style.setProperty("--fill", (duration ? current / duration * 100 : 0) + "%");
      $("#seek").setAttribute("aria-valuetext", time(current) + " / " + time(duration));
      syncLyrics();
    }
    function syncLyrics(force) {
      if (!lyricsOpen || !lyricSynced || !lyricLines.length) return;
      var position = Math.max(0, playbackState.current || 0);
      var next = -1;
      for (var i = 0; i < lyricLines.length && lyricLines[i].time <= position + 0.05; i++) next = i;
      if (next === lyricActive && !force) return;
      var rows = $("#lyrics-lines").children;
      if (rows[lyricActive]) rows[lyricActive].classList.remove("active");
      lyricActive = next;
      for (var row = 0; row < rows.length; row++) rows[row].classList.toggle("passed", row < next);
      if (rows[next]) {
        rows[next].classList.add("active");
        if (Date.now() >= userScrollUntil) {
          var scroller = $("#lyrics-scroll");
          scroller.scrollTop += rows[next].getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight * .32;
        }
      }
    }
    function showLyrics(result) {
      lyricLines = Array.isArray(result && result.lines) ? result.lines : [];
      lyricSynced = !!(result && result.synced);
      lyricActive = -2;
      $("#lyrics-status").textContent = lyricLines.length ? "" : "这首歌暂时没有歌词";
      $("#lyrics-lines").innerHTML = lyricLines.map(function (line) {
        var content = '<span>' + escape(line.text) + '</span>' + (line.translation ? '<small>' + escape(line.translation) + '</small>' : '');
        return lyricSynced ? '<button class="lyric-line" data-lyric-time="' + Number(line.time) + '" aria-label="跳转到 ' + time(line.time) + '：' + escape(line.text) + '">' + content + '</button>' : '<p class="lyric-line">' + content + '</p>';
      }).join("");
      syncLyrics(true);
    }
    async function loadLyrics(song) {
      var version = ++lyricsVersion;
      lyricLines = []; lyricSynced = false; lyricActive = -2;
      $("#lyrics-lines").textContent = "";
      $("#lyrics-scroll").scrollTop = 0;
      $("#lyrics-song").textContent = song ? song.name : "尚未播放歌曲";
      $("#lyrics-artist").textContent = song ? artists(song) : "";
      $("#lyrics-retry").hidden = true;
      $("#lyrics-status").textContent = song ? "正在加载歌词…" : "播放一首歌曲后即可查看歌词";
      if (!song) return;
      var key = String(song.id);
      try {
        var result = song.localPath ? await options.sdk.localMusic.getLyrics(song) : lyricsCache.get(key) || await options.sdk.songs.getLyrics(song.id);
        if (!lyricsOpen || state.disposed || version !== lyricsVersion || !state.current || String(state.current.id) !== key) return;
        lyricsCache.set(key, result);
        showLyrics(result);
      } catch (error) {
        if (!lyricsOpen || state.disposed || version !== lyricsVersion) return;
        $("#lyrics-status").textContent = "歌词加载失败，请重试";
        $("#lyrics-retry").hidden = false;
      }
    }
    function applyLyricsColors(palette) {
      var view = $("#lyrics-view");
      ["background", "inactive", "active", "passed"].forEach(function (key) {
        view.style.setProperty("--lyrics-color-" + key, palette[key]);
      });
    }
    async function updateLyricsColors(song) {
      var version = ++lyricsColorVersion;
      var colors = options.sdk.coverColors;
      applyLyricsColors(colors.fallback);
      if (!song) return;
      var artUrl = song.localPath ? options.sdk.localMusic.getArtwork(song) : album(song).picUrl || "";
      var cached = lyricsColorCache.get(artUrl);
      if (cached) { applyLyricsColors(cached); return; }
      var palette = colors.fallback;
      try {
        var image = $("#now-cover img");
        var sourceUrl = artUrl && !song.localPath ? options.sdk.artwork.getUrl(artUrl, 64).replace(/^orpheus:\/\/cache\/?\?/, "") : "";
        // Native cached images may be canvas-tainted; retry with the small HTTPS artwork.
        sourceUrl = sourceUrl.replace(/^http:\/\/(?=(?:p\d+\.music\.126\.net|nos\.netease\.com)\/)/i, "https://");
        palette = await colors.sample(image, sourceUrl);
      } catch (_) { /* Keep the neutral palette when artwork cannot be sampled. */ }
      if (!lyricsOpen || state.disposed || version !== lyricsColorVersion || !state.current || String(state.current.id) !== String(song.id)) return;
      applyLyricsColors(palette);
      if (palette !== colors.fallback && artUrl) lyricsColorCache.set(artUrl, palette);
    }
    function toggleLyrics(open) {
      if (lyricsOpen === open) return;
      lyricsOpen = open;
      $("#lyrics-view").hidden = !open;
      $("#main").hidden = open;
      $(".toolbar").hidden = open;
      $("#lyrics-toggle").setAttribute("aria-pressed", String(open));
      $("#lyrics-toggle").setAttribute("aria-label", open ? "关闭歌词" : "打开歌词");
      $("#cover-toggle").setAttribute("aria-expanded", String(open));
      $("#cover-toggle").setAttribute("aria-label", open ? "关闭歌词" : "打开歌词");
      $("#cover-toggle").title = open ? "关闭歌词" : "打开歌词";
      if (open) {
        if (!$("#queue-panel").hidden) toggleQueue(false);
        userScrollUntil = 0;
        loadLyrics(state.current);
        updateLyricsColors(state.current);
        $("#lyrics-close").focus();
      } else { ++lyricsVersion; ++lyricsColorVersion; }
    }
    function playbackError(error) {
      var code = error && (error.code || error.error);
      if (code === "CANCELLED") return;
      var messages = {
        PLAY_UNAVAILABLE: "这首歌曲暂时无法播放，可能需要登录或会员权限。",
        BRIDGE_UNAVAILABLE: "原生播放服务不可用，请刷新界面或返回原版。",
        LOAD_FAILED: "原生音频加载失败，请重试或选择其他歌曲。",
        NO_RECOMMENDATIONS: "暂时没有新的推荐，请稍后点击下一首重试。",
        TIMEOUT: "原生播放服务响应超时，请重试。"
      };
      report(messages[code] || "播放操作失败，请重试。" + (code ? "（" + code + "）" : ""), true);
    }
    function syncPlayback(next) {
      if (state.disposed) return;
      var previous = playbackState; playbackState = next;
      updatePlayback(); updateTime(); volumeChanged();
      if (next.status === "error" && (previous.status !== "error" || previous.error !== next.error)) playbackError(next);
    }
    function syncPlayer(value) {
      if (state.disposed) return;
      var queueChanged = state.queue !== value.queue;
      state.queue = value.queue; queueSource = value.source; state.shuffle = value.shuffle;
      state.pending = value.loading; repeatOne = value.repeatOne;
      if (queueChanged && recommendationStates[value.source]) {
        var rec = recommendationStates[value.source];
        var items = new Map(rec.items.map(function (song) { return [String(song.id), song]; }));
        value.queue.forEach(function (song) { items.set(String(song.id), song); });
        rec.items = Array.from(items.values()); rec.loaded = true;
      }
      if (value.song && state.current !== value.song) { showCurrent(value.song); drawTracks(); }
      if (!value.song && state.current) {
        state.current = null;
        $("#now-title").textContent = "让音乐陪着你"; $("#now-artist").textContent = "选择一首喜欢的歌曲";
        $("#now-cover").innerHTML = cover(null);
        $("#now-favorite").disabled = true;
      }
      $("#shuffle").disabled = value.dynamic;
      $("#shuffle").setAttribute("aria-pressed", String(value.shuffle));
      $("#repeat").setAttribute("aria-pressed", String(value.repeatOne));
      $("#previous").disabled = value.queue.length < 2;
      $("#next").disabled = value.queue.length < 2 && !value.dynamic;
      if (queueChanged) { drawQueue(); if (state.view === "songs") drawTracks(); }
      syncPlayback(value.playback);
    }
    async function playSong(song, queue) {
      if (!song || state.disposed || leaving) return;
      var version = ++playVersion;
      seeking = false; report("");
      var settings = { level: "standard" };
      if (queue) {
        settings.queue = queue; settings.source = recommendationModes[state.view] ? state.view : null;
        if ((recommendationModes[settings.source] || {}).dynamic) {
          settings.loadMore = options.sdk.player.recommendationLoader(settings.source);
        }
      }
      try {
        await player.play(song, settings);
      } catch (error) { if (!state.disposed && version === playVersion) playbackError(error); }
    }
    function nextTrack(direction, ended) {
      (direction < 0 ? player.previous() : player.next({ ended: !!ended })).catch(playbackError);
    }
    async function togglePlayback() {
      if (leaving || state.disposed) return;
      try {
        if (!player.getState().song && !state.pending) {
          var songs = visibleSongs(); return playSong(songs[0], songs);
        }
        await player.toggle();
      } catch (error) { playbackError(error); }
    }
    async function seekTo(position) {
      var version = playVersion;
      try { await player.seek(position); }
      catch (error) { if (!state.disposed && version === playVersion) playbackError(error); }
      finally { if (!state.disposed && version === playVersion) { seeking = false; syncPlayback(playback.getState()); } }
    }
    function toggleQueue(open) {
      if (open && lyricsOpen) toggleLyrics(false);
      $("#queue-panel").hidden = !open;
      $("#queue-toggle").setAttribute("aria-expanded", String(open));
      if (open) { drawQueue(); $("#close-queue").focus(); } else $("#queue-toggle").focus();
    }
    function volumeChanged() {
      var volume = desiredVolume === null ? playbackState.volume : desiredVolume;
      $("#volume").value = volume;
      $("#volume").style.setProperty("--fill", volume * 100 + "%");
      buttonIcon("#mute", volume ? "volume" : "mute");
      $("#mute").setAttribute("aria-pressed", String(!volume));
      $("#mute").setAttribute("aria-label", volume ? "静音" : "取消静音");
    }
    async function setVolume(volume) {
      desiredVolume = volume;
      if (volume > 0) previousVolume = volume;
      volumeChanged();
      if (volumeRunning) return;
      volumeRunning = true;
      try {
        // Coalesce slider movement while the preceding Native call is in flight.
        while (desiredVolume !== null && !state.disposed && !leaving) {
          var target = desiredVolume;
          try { await (persistence ? persistence.setVolume(target) : player.setVolume(target)); }
          catch (error) { if (!state.disposed) playbackError(error); }
          if (desiredVolume === target) desiredVolume = null;
        }
      } finally { volumeRunning = false; if (!state.disposed) volumeChanged(); }
    }
    async function navigate(action) {
      if (leaving) return;
      leaving = true; ++playVersion; state.pending = false;
      $("#refresh").disabled = $("#original").disabled = true;
      try {
        if (persistence) await persistence.prepareExit();
        await player.stop();
        await player.clearSystemMedia().catch(mediaError);
        if (!state.disposed) await action();
      }
      catch (error) { if (persistence) persistence.cancelExit(); if (!state.disposed) playbackError(error); }
      finally {
        leaving = false;
        if (!state.disposed) $("#refresh").disabled = $("#original").disabled = false;
      }
    }
    shadow.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.lyricTime !== undefined) { userScrollUntil = 0; seekTo(Number(button.dataset.lyricTime)); }
      if (button.dataset.view) { state.query = ""; $("#search").value = ""; setView(button.dataset.view); }
      if (button.dataset.play) playSong(findSong(button.dataset.play), visibleSongs());
      if (button.dataset.queuePlay) playSong(findSong(button.dataset.queuePlay));
      if (button.dataset.like) toggleLiked(findSong(button.dataset.like));
      if (button.dataset.playlist) {
        state.query = ""; $("#search").value = "";
        loadPlaylist(button.dataset.playlist, false, button.dataset.playlistName);
        setView("playlist");
      }
    });
    shadow.addEventListener("error", function (event) { if (event.target.tagName === "IMG") event.target.remove(); }, true);
    $("#search").addEventListener("input", function () {
      if (["discover", "search"].includes(state.view)) { ++searchState.version; searchState.loading = false; return; }
      state.query = this.value; setView(state.view);
    });
    $("#search").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && ["discover", "search"].includes(state.view)) { event.preventDefault(); runSearch(false); }
    });
    $("#more-search").onclick = function () { runSearch(true); };
    $("#refresh-home-playlists").onclick = loadHomePlaylists;
    $("#open-created").onclick = function () { state.query = ""; $("#search").value = ""; setView("created"); };
    $("#open-subscribed").onclick = function () { state.query = ""; $("#search").value = ""; setView("subscribed"); };
    $("#hero-library").onclick = function () { state.query = ""; $("#search").value = ""; setView("liked"); };
    $("#refresh-library").onclick = $("#reload-created").onclick = function () { refreshData(function () { return loadLibrary(); }); };
    $("#reload-subscribed").onclick = function () { refreshData(function () { return loadLibrary(); }); };
    $("#more-created").onclick = function () { loadLibrary(true); };
    $("#more-subscribed").onclick = function () { loadSubscribed(true); };
    $("#reload-liked").onclick = function () { refreshData(async function () { await loadLikedIds(); return loadLiked(); }); };
    $("#more-liked").onclick = function () { loadLiked(true); };
    $("#reload-playlist").onclick = function () { refreshData(function () { return loadPlaylist(state.playlistId); }); };
    $("#more-playlist").onclick = function () { if (!state.loading) loadPlaylist(state.playlistId, true); };
    $("#reload-recommended").onclick = function () { var kind = state.view; refreshData(function () { return loadRecommendation(kind); }); };
    $("#more-recommended").onclick = function () { loadRecommendation(state.view, true); };
    $("#play-all").onclick = function () { var songs = visibleSongs(); playSong(songs[0], songs); };
    $("#play").onclick = togglePlayback;
    $("#previous").onclick = function () { if (playbackState.current > 3) seekTo(0); else nextTrack(-1); };
    $("#next").onclick = function () { nextTrack(1); };
    $("#shuffle").onclick = function () { player.setShuffle(!state.shuffle); drawQueue(); };
    $("#repeat").onclick = function () { player.setRepeatOne(!repeatOne); };
    $("#now-favorite").onclick = function () { if (state.current) toggleLiked(state.current); };
    $("#lyrics-toggle").onclick = $("#cover-toggle").onclick = function () { toggleLyrics(!lyricsOpen); };
    $("#lyrics-close").onclick = function () { toggleLyrics(false); $("#lyrics-toggle").focus(); };
    $("#lyrics-retry").onclick = function () { loadLyrics(state.current); };
    $("#lyrics-scroll").addEventListener("wheel", function () { userScrollUntil = Date.now() + 5000; }, { passive: true });
    $("#lyrics-scroll").addEventListener("touchmove", function () { userScrollUntil = Date.now() + 5000; }, { passive: true });
    $("#seek").oninput = function () {
      seeking = true;
      $("#elapsed").textContent = time(Number(this.value));
      this.style.setProperty("--fill", Number(this.value) / Number(this.max) * 100 + "%");
      this.setAttribute("aria-valuetext", time(Number(this.value)) + " / " + time(playbackState.duration));
    };
    $("#seek").onchange = function () { seekTo(Number(this.value)); };
    $("#volume").oninput = function () { setVolume(Number(this.value)); };
    $("#mute").onclick = function () { setVolume(Number($("#volume").value) ? 0 : previousVolume); };
    $("#queue-toggle").onclick = function () { toggleQueue($("#queue-panel").hidden); };
    $("#close-queue").onclick = function () { toggleQueue(false); };
    $("#refresh").onclick = function () { navigate(function () { root.location.reload(); }); };
    $("#original").onclick = function () { navigate(function () { namespace.ui.setMode("original"); }); };
    $("#window-minimize").onclick = function () { windowAction(windowControls.minimize); };
    $("#window-maximize").onclick = function () { windowAction(windowControls.toggleMaximize); };
    $("#window-close").onclick = function () { navigate(windowControls.close); };
    var windowBar = $(".window-bar");
    function interactive(event) { return !!event.target.closest("button,input,label,a,[contenteditable]"); }
    windowBar.addEventListener("mousedown", function (event) {
      dragOrigin = event.button === 0 && !interactive(event) && event.detail < 2 ? { x: event.clientX, y: event.clientY } : null;
    });
    windowBar.addEventListener("mousemove", function (event) {
      if (!dragOrigin || !(event.buttons & 1)) return;
      if (Math.abs(event.clientX - dragOrigin.x) > 5 || Math.abs(event.clientY - dragOrigin.y) > 5) {
        dragOrigin = null; windowAction(windowControls.drag);
      }
    });
    function endWindowDrag() { dragOrigin = null; }
    root.addEventListener("mouseup", endWindowDrag);
    root.addEventListener("blur", endWindowDrag);
    windowBar.addEventListener("dblclick", function (event) { if (!interactive(event)) windowAction(windowControls.toggleMaximize); });
    shadow.querySelectorAll("[data-resize]").forEach(function (edge) {
      edge.addEventListener("mousedown", function (event) {
        if (event.button !== 0 || $(".resize-handles").hidden) return;
        event.preventDefault(); windowAction(function () { return windowControls.resize(edge.dataset.resize); });
      });
    });
    $("#retry").onclick = function () { if (retryAction) retryAction(); else loadPlaylist(state.requestedId); };
    $("#add-playlist").onclick = function () { $("#playlist-dialog").showModal(); $("#playlist-id").focus(); };
    $("#close-dialog").onclick = function () { $("#playlist-dialog").close(); };
    $("#playlist-form").onsubmit = function (event) {
      event.preventDefault();
      var id = $("#playlist-id").value.trim();
      if (!/^[1-9]\d*$/.test(id)) return;
      $("#playlist-dialog").close();
      state.query = ""; $("#search").value = "";
      loadPlaylist(id); setView("playlist");
    };
    shadow.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("#queue-panel").hidden) toggleQueue(false);
      else if (event.key === "Escape" && lyricsOpen) { toggleLyrics(false); $("#lyrics-toggle").focus(); }
      if (event.code === "Space" && !event.repeat && !/^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(event.target.tagName) && !$("#playlist-dialog").open) { event.preventDefault(); togglePlayback(); }
    });
    function localMusicOpened() { state.query = ""; $("#search").value = ""; setView("songs"); }
    root.addEventListener("enhancencm:localmusic", localMusicOpened);
    var unsubscribe = player.subscribe(syncPlayer);
    function pageHide() {
      if (persistence) persistence.prepareExit().catch(function (error) { if (namespace.log) namespace.log(error.message); }).finally(persistence.dispose);
      leaving = true; if (ownsPlayer) player.dispose().catch(function () {});
    }
    root.addEventListener("pagehide", pageHide);
    $("#date").textContent = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    drawAlbums(); drawTracks(); syncPlayer(player.getState()); loadHomePlaylists();
    restoreSession().catch(function () {}).then(async function () {
      if (state.disposed) return;
      // Unlike the SDK's five-minute response cache, a page snapshot always
      // revalidates in the background while its old rows remain on screen.
      if (snapshotOwner && options.sdk.cache)
        await options.sdk.cache.refresh().catch(function () {});
      if (!state.disposed) { loadPlaylist(state.playlistId); loadLibrary(); }
    });
    namespace.app.whenReady(5000).then(function () {
      if (state.disposed) return;
      if (persistence) persistence.restoreVolume().catch(persistenceError);
      try {
        shellReleases.push(windowControls.subscribe(updateWindow));
        shellReleases.push(windowControls.subscribeClose(function () { navigate(windowControls.close); }));
        shellReleases.push(windowControls.subscribeActivate(function () { windowControls.activate().catch(shellError); }));
        windowControls.getState().then(updateWindow).catch(shellError);
      } catch (error) { shellError(error); }
      try { player.connectSystemMedia(function (action) {
        if (action === "open") windowControls.activate().catch(shellError);
        else if (action === "exit") navigate(windowControls.close);
        else if (action === "getLikeState") return { liked: !!state.current && library.likedIds.has(String(state.current.id)),
          canLike: !!state.current && !state.current.localPath && library.likedIdsLoaded && identityConfirmed && !likePending.has(String(state.current.id)) };
        else if (action === "like" && state.current) toggleLiked(state.current);
      }); }
      catch (error) { mediaError(error); }
    }).catch(function () {});
    return function () {
      state.disposed = true;
      if (trackFrame !== null) root.cancelAnimationFrame(trackFrame);
      root.removeEventListener("resize", refreshTrackWindow);
      ++loadVersion; ++playVersion; ++libraryVersion; ++likedVersion; ++likedIdsVersion; ++createdVersion; ++subscribedVersion; ++lyricsVersion; ++lyricsColorVersion;
      root.removeEventListener("enhancencm:localmusic", localMusicOpened);
      unsubscribe();
      root.removeEventListener("pagehide", pageHide);
      root.removeEventListener("mouseup", endWindowDrag);
      root.removeEventListener("blur", endWindowDrag);
      shellReleases.forEach(function (release) { release(); });
      var saving = persistence ? persistence.prepareExit().finally(persistence.dispose) : Promise.resolve();
      return saving.finally(function () { return ownsPlayer ? player.dispose() : Promise.resolve(); })
        .catch(function (error) { if (namespace.log) namespace.log("Native cleanup failed: " + (error.code || error.message)); });
    };
  }
  // Reuse the production renderer in the local mock-SDK preview.
  namespace._renderMusic = render;
  if (namespace.themes) namespace.themes.register({ name: "Spotify", mount: render });
})(globalThis);
