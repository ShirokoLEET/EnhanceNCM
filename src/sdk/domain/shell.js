(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  if (namespace._shell) return;
  var bridge = namespace._native;
  // Verified against CloudMusic 3.1.39.205426's WindowHelper/AudioPlayer wrappers.
  function command(name, args, gesture) {
    if (!root.channel || typeof root.channel.call !== "function") {
      var unavailable = new Error("desktop shell channel is unavailable");
      unavailable.code = "BRIDGE_UNAVAILABLE";
      return Promise.reject(unavailable);
    }
    return new Promise(function (resolve, reject) {
      var timer = gesture ? null : root.setTimeout(function () {
        var error = new Error(name + " timed out"); error.code = "TIMEOUT"; reject(error);
      }, 3000);
      bridge.callArgs(name, args).then(function (result) { root.clearTimeout(timer); resolve(result); }, function (error) { root.clearTimeout(timer); reject(error); });
    });
  }
  function windowState(value) {
    if (Array.isArray(value)) value = value[0];
    var status = typeof value === "string" ? value : value && value.status;
    return Object.freeze({ status: status || "restore", maximized: status === "maximize" || status === "fullScreen" });
  }
  function getWindowState() { return command("winhelper.getWindowInfo", ["status"]).then(windowState); }
  function showWindow(action) { return command("winhelper.showWindow", [action]); }
  var windowKey = "enhancencm.window.v1";
  function validPosition(value) {
    return value && ["x", "y", "width", "height"].every(function (key) { return Number.isFinite(value[key]); }) && value.width > 64 && value.height > 64;
  }
  function rememberWindow() {
    return command("winhelper.getWindowPosition", []).then(function (position) {
      if (validPosition(position)) try { root.localStorage.setItem(windowKey, JSON.stringify(position)); } catch (_) {}
    }).catch(function () {});
  }
  async function initializeWindowPosition() {
    // A fresh native shell is only 32x32 until its frontend sets the bounds.
    var info = await command("os.getSystemInfo", ["monitor"]);
    var area = info && info.workArea;
    if (!validPosition(area)) area = { x: 0, y: 0, width: 1920, height: 1080 };
    var saved;
    try { saved = JSON.parse(root.localStorage.getItem(windowKey)); } catch (_) {}
    var ratio = root.devicePixelRatio || 1;
    var width = Math.round(Math.min(validPosition(saved) ? saved.width : 1200 * ratio, area.width));
    var height = Math.round(Math.min(validPosition(saved) ? saved.height : 820 * ratio, area.height));
    var x = validPosition(saved) ? saved.x : area.x + (area.width - width) / 2;
    var y = validPosition(saved) ? saved.y : area.y + (area.height - height) / 2;
    var position = { width: width, height: height, topmost: false,
      x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
      y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))) };
    await command("winhelper.setWindowPosition", [position]);
  }
  async function initializeTray() {
    // The original frontend normally performs this setup. Direct entry skips it.
    await command("trayicon.setIcon", ["orpheus://orpheus/pub/public/assets/img/common/tray/app.ico"]);
    await command("trayicon.setToolTip", ["网易云音乐"]);
    if (!(await command("trayicon.wasInstall", []))) await command("trayicon.install", []);
  }
  function initializeTaskbarIcon() {
    // Match the original frontend's setTaskBoardWindowConfig call. The direct
    // entry skips that bundle, so Windows otherwise has no icon for the title
    // row in the taskbar thumbnail preview. This Native command is deliberately
    // fire-and-forget in the original wrapper and may never invoke its callback;
    // awaiting it would prevent the tray and its event handlers from starting.
    bridge.callArgs("winhelper.setWindowIconFromLocalFile",
      ["orpheus://orpheus/pub/public/assets/img/common/tray/app_min.ico"])
      .catch(function (error) {
        if (namespace.log) namespace.log("Taskbar icon: " + (error.code || error.message));
      });
  }
  var windowInitialization = null;
  var windowControls = Object.freeze({
    initialize: function () {
      if (windowInitialization) return windowInitialization;
      windowInitialization = (async function () {
      await namespace._startup.initializeStorage();
      await command("winhelper.initMainWindow", []);
      await initializeWindowPosition();
      initializeTaskbarIcon();
      await command("winhelper.finishLoadMainWindow", []);
      await initializeTray();
      await command("app.appStartUpEnd", []);
      var startType = await command("app.getAppStartType", []);
      if (Array.isArray(startType)) startType = startType[0];
      // Startup from the OS remains in the tray; explicit launches show the UI.
      if (startType !== "autorun") {
        await showWindow("show");
        await command("winhelper.bringWindowToTop", []);
      }
      })().catch(function (error) { windowInitialization = null; throw error; });
      return windowInitialization;
    },
    getState: getWindowState,
    minimize: function () { return showWindow("minimize"); },
    maximize: function () { return showWindow("maximize"); },
    restore: function () { return showWindow("restore"); },
    toggleMaximize: async function () { return showWindow((await getWindowState()).maximized ? "restore" : "maximize"); },
    drag: function () { return command("winhelper.dragWindow", [], true).then(rememberWindow); },
    resize: function (edge) {
      if (!["topleft", "topright", "bottomleft", "bottomright", "right"].includes(edge))
        return Promise.reject(new TypeError("unsupported resize edge"));
      return command("winhelper.sizeWindow", [edge], true);
    },
    close: function () { return command("app.exit", []); },
    subscribe: function (listener) { return bridge.subscribe("winhelper.onSizeStatus", function (status) {
      listener(windowState(status));
      if (status === "restore") rememberWindow();
    }); },
    subscribeClose: function (listener) { return bridge.subscribe("winhelper.onclose", listener); },
    subscribeActivate: function (listener) {
      return bridge.subscribe("ipc.onipcmessagerecived", function (messageId) {
        if (messageId === 1) listener();
      });
    },
    activate: async function () { await showWindow("show"); await command("winhelper.bringWindowToTop", []); }
  });
  function coverUrl(value, logicalSize) {
    try {
      value = String(value || "").replace(/^orpheus:\/\/cache\/?\?/, "");
      var url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return "";
      if (/^p\d+\.music\.126\.net$/.test(url.hostname) || url.hostname === "nos.netease.com") {
        var query = new URLSearchParams({ enlarge: "1", type: "jpg", quality: "90" });
        url.searchParams.forEach(function (value, name) { if (name !== "param" && name !== "imageView") query.set(name, value); });
        var size = Math.max(1, Math.round((logicalSize || 108) * (root.devicePixelRatio || 1)));
        query.set("type", "jpg"); query.set("thumbnail", size + "y" + size);
        url.search = "imageView&" + query.toString();
      } else if (url.searchParams.get("type") === "webp") url.searchParams.set("type", "jpg");
      return url.href;
    } catch (_) { return ""; }
  }
  var artwork = Object.freeze({
    getUrl: function (value, logicalSize) {
      logicalSize = logicalSize === undefined ? 320 : logicalSize;
      if (!Number.isSafeInteger(logicalSize) || logicalSize < 16 || logicalSize > 1024)
        throw new RangeError("artwork size must be between 16 and 1024 CSS pixels");
      var url = coverUrl(value, logicalSize);
      return url ? "orpheus://cache?" + url : "";
    }
  });
  function mediaJob(song, state) {
    var active = song && state && String(song.id) === String(state.songId) && ["loading", "playing", "paused", "ended"].includes(state.status);
    var album = active && (song.al || song.album) || {};
    var info = {
      // setInfo uses the resource/song ID, not audioplayer's generated load ID.
      playId: active ? String(song.id) : "", songName: active ? String(song.name || "") : "",
      artistName: active ? (song.ar || song.artists || []).map(function (artist) { return artist && artist.name; }).filter(Boolean).join("/") : "",
      songType: "normal", albumId: active ? String(album.id || "") : "",
      albumName: active ? String(album.name || "") : "", url: active ? (song.localPath && namespace.sdk.localMusic ? namespace.sdk.localMusic.getArtwork(song) : coverUrl(album.picUrl, 320)) : ""
    };
    var status = active && state.status === "playing" ? 0 : active && ["paused", "loading"].includes(state.status) ? 1 : 2;
    return { info: info, cover: info.url, status: status, active: !!active, key: JSON.stringify([info, status]) };
  }
  var trayAssets = "orpheus://orpheus/pub/public/assets/img/common/tray/";
  var trayStateKey = "enhancencm.trayMenu.state.v1";
  var trayActionKey = "enhancencm.trayMenu.action.v1";
  var trayReadyKey = "enhancencm.trayMenu.ready.v1";
  function thumbnailButtons(status) {
    var suffix = root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches ? "" : "_dark";
    var playing = status === 0;
    return {
      btnLeft: { id: 300, tooltip: "上一首", url: trayAssets + "prev" + suffix + ".ico" },
      btnMiddle: { id: 301, tooltip: playing ? "暂停" : "播放", url: trayAssets + (playing ? "pause" : "play") + suffix + ".ico" },
      btnRight: { id: 302, tooltip: "下一首", url: trayAssets + "next" + suffix + ".ico" }
    };
  }
  function createMediaSession(onAction, onShellAction) {
    var desired = null, applied = null, running = null;
    var enabled = false, closed = false;
    var coverLoad = null, trayToken = null, trayCheck = null;
    var timelineSong = null, timelinePosition = -1, timelineDuration = -1, timelineActive = false;
    var timelinePositionValue = 0, timelineDurationValue = 0;
    function republishTimeline() {
      if (typeof namespace.updateSystemTimeline !== "function") return;
      try { namespace.updateSystemTimeline(timelinePositionValue, timelineDurationValue, timelineActive); }
      catch (error) { if (namespace.log) namespace.log("SMTC timeline: " + (error.code || error.message)); }
    }
    function updateTimeline(song, state, force) {
      if (typeof namespace.updateSystemTimeline !== "function") return;
      var active = !!(song && state && String(song.id) === String(state.songId) &&
        ["loading", "playing", "paused"].includes(state.status));
      var duration = active && Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0;
      var position = active && Number.isFinite(state.current) ? Math.max(0, Math.min(state.current, duration || Infinity)) : 0;
      var songId = active ? String(song.id) : null;
      var wholePosition = Math.floor(position);
      if (!force && songId === timelineSong && active === timelineActive && duration === timelineDuration &&
          Math.abs(wholePosition - timelinePosition) < 1) return;
      timelineSong = songId; timelineActive = active; timelineDuration = duration; timelinePosition = wholePosition;
      timelinePositionValue = position; timelineDurationValue = duration;
      republishTimeline();
    }
    var release = bridge.subscribe("player.onaction", function (action, from) {
      if (!closed && ["play", "pause", "stop", "prev", "next"].includes(action)) onAction(action, from);
    });
    var releaseThumbnail = bridge.subscribe("player.onthumbnailaction", function (id) {
      if (closed) return;
      if (id && typeof id === "object") id = id.id || id.action;
      var action = { 300: "prev", 301: desired && desired.status === 0 ? "pause" : "play", 302: "next" }[id];
      if (action) onAction(action, "thumbnail");
    });
    function shellAction(action) {
      if (onShellAction) return onShellAction(action);
      else if (action === "open") windowControls.activate().catch(function () {});
      else if (action === "exit") windowControls.close().catch(function () {});
    }
    var releaseTrayClick = bridge.subscribe("trayicon.onclick", function () { if (!closed) shellAction("open"); });
    function trayAction(action) {
      if (closed) return;
      if (action === "open" || action === "exit") shellAction(action);
      else if (action === "previous") onAction("prev", "tray");
      else if (action === "next") onAction("next", "tray");
      else if (action === "toggle") onAction(desired && desired.status === 0 ? "pause" : "play", "tray");
      else if (action === "like") shellAction("like");
    }
    function trayStorage(event) {
      if (closed || event.key !== trayActionKey || !event.newValue) return;
      try {
        var message = JSON.parse(event.newValue);
        if (message.token === trayToken) trayAction(message.action);
      } catch (_) {}
    }
    if (root.addEventListener) root.addEventListener("storage", trayStorage);
    function fallbackTray(state, error) {
      if (closed || !namespace._trayMenuUi) return;
      if (namespace.log && error) namespace.log("Tray popup: " + (error.code || error.message));
      windowControls.activate().then(function () {
        if (!closed) namespace._trayMenuUi.showFallback(trayAction, state);
      }).catch(function () {});
    }
    function rightClickPosition(eventPoint, eventY) {
      var point, nativePoint = false;
      try { if (typeof namespace.cursorPosition === "function") point = namespace.cursorPosition(); } catch (_) {}
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) nativePoint = true;
      else if (eventPoint && typeof eventPoint === "object") point = eventPoint;
      else if (Number.isFinite(eventPoint) && Number.isFinite(eventY)) point = { x: eventPoint, y: eventY };
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      // trayicon.onrightclick reports 96-DPI logical coordinates, while the
      // monitor work area and WindowHelper bounds use physical pixels. The CEF
      // cursor bridge already returns physical pixels, so scale only the event
      // fallback instead of applying devicePixelRatio twice.
      var scale = nativePoint ? 1 : root.devicePixelRatio || 1;
      return { x: point.x * scale, y: point.y * scale };
    }
    var releaseTrayRightClick = bridge.subscribe("trayicon.onrightclick", function (eventPoint, eventY) {
      if (closed) return;
      // Capture the cursor synchronously: async monitor/launch calls may run
      // after the pointer has already moved away from the tray icon.
      var anchor = rightClickPosition(eventPoint, eventY);
      var likeState = {};
      try { likeState = shellAction("getLikeState") || {}; } catch (_) {}
      var state = { token: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        playing: !!(desired && desired.status === 0),
        title: desired && desired.info.songName || "网易云音乐",
        liked: !!likeState.liked, canLike: !!likeState.canLike };
      trayToken = state.token;
      if (trayCheck) root.clearTimeout(trayCheck);
      try {
        root.localStorage.setItem(trayStateKey, JSON.stringify(state));
        root.localStorage.removeItem(trayReadyKey);
      } catch (error) { fallbackTray(state, error); return; }
      // A separate CEF window hosts our HTML/CSS menu; no native menu API is used.
      command("os.getSystemInfo", ["monitor"]).then(function (info) {
        if (closed || trayToken !== state.token) return;
        var area = info && info.workArea;
        if (!validPosition(area)) area = { x: root.screen.availLeft || 0, y: root.screen.availTop || 0,
          width: root.screen.availWidth, height: root.screen.availHeight };
        var ratio = root.devicePixelRatio || 1;
        var width = Math.round(212 * ratio), height = Math.round(132 * ratio);
        var inset = Math.round(8 * ratio);
        var x = anchor ? anchor.x - width / 2 : area.x + area.width - width - inset;
        var y = anchor ? anchor.y - height - inset : area.y + area.height - height - inset;
        var bounds = { x: Math.round(Math.max(area.x + inset,
            Math.min(x, area.x + area.width - width - inset))),
          y: Math.round(Math.max(area.y + inset,
            Math.min(y, area.y + area.height - height - inset))),
          width: width, height: height, factor: ratio };
        state.bounds = bounds;
        root.localStorage.setItem(trayStateKey, JSON.stringify(state));
        return command("winhelper.launchWindow", ["orpheus://orpheus/pub/app.html?enhancencm-tray=" + encodeURIComponent(state.token), bounds,
          { visible: true, resizable: false, taskbarButton: false, spec_window: true,
            bk_color: "#2b2b35", corner_size: 9 }]);
      }).then(function () {
        if (closed || trayToken !== state.token) return;
        trayCheck = root.setTimeout(function () {
          trayCheck = null;
          if (closed || trayToken !== state.token) return;
          try { if (root.localStorage.getItem(trayReadyKey) === state.token) return; } catch (_) {}
          fallbackTray(state, new Error("Tray popup did not become ready"));
        }, 2500);
      }).catch(function (error) { if (trayToken === state.token) fallbackTray(state, error); });
    });
    function desktopLabels(job) {
      // The original client updates both labels when its playing resource changes.
      // These two Native commands are fire-and-forget in its wrapper; sending them
      // synchronously keeps a late cover preload from restoring an older title.
      var title = job.info.songName ? job.info.songName + (job.info.artistName ? " - " + job.info.artistName : "") : "网易云音乐";
      ["trayicon.setToolTip", "winhelper.setWindowTitle"].forEach(function (name) {
        bridge.callArgs(name, [title]).catch(function (error) {
          if (namespace.log) namespace.log("Desktop label: " + (error.code || error.message));
        });
      });
    }
    function preloadCover(url) {
      if (coverLoad && coverLoad.url === url) return coverLoad.promise;
      if (coverLoad && coverLoad.cancel) coverLoad.cancel();
      var load = { url: url, cancel: null, promise: null };
      load.promise = new Promise(function (resolve, reject) {
        var image = new root.Image();
        var settled = false, cachedUrl = url, converted = !url.startsWith("orpheus://localmusic/pic?");
        var timer = root.setTimeout(function () { finish("ARTWORK_FAILED"); }, 8000);
        function finish(code) {
          if (settled) return;
          settled = true; root.clearTimeout(timer);
          image.onload = image.onerror = null;
          load.cancel = null;
          if (code) {
            if (coverLoad === load) coverLoad = null;
            if (typeof image.removeAttribute === "function") image.removeAttribute("src");
            var error = new Error("Native artwork preload failed"); error.code = code; reject(error);
          } else resolve(cachedUrl);
        }
        load.cancel = function () { finish("CANCELLED"); };
        image.onload = function () {
          if (settled) return;
          if (!converted) {
            try {
              cachedUrl = namespace.sdk.localMusic.prepareSystemArtwork(image);
              converted = true;
              image.src = "orpheus://cache?" + cachedUrl;
            } catch (_) { finish("ARTWORK_FAILED"); }
            return;
          }
          finish();
        };
        image.onerror = function () { finish("ARTWORK_FAILED"); };
        // Original client caches the bytes in Native before submitting the URL.
        image.src = url.startsWith("orpheus://localmusic/pic?") ? url : "orpheus://cache?" + url;
      });
      coverLoad = load;
      return load.promise;
    }
    function thumbnailPayload(job) {
      var payload = { tooltip: job.info.songName + (job.info.artistName ? " - " + job.info.artistName : "") || "网易云音乐" };
      var cover = job.systemCover || job.cover;
      if (cover && !job.useDefaultCover && !cover.startsWith("orpheus://localmusic/")) payload.albumCoverUrl = cover;
      else payload.defaultCover = "orpheus://orpheus/pub/public/assets/img/common/tray/default_disc.png";
      return Object.assign(payload, thumbnailButtons(job.status));
    }
    async function defaultCover(job) {
      job.useDefaultCover = true;
      await command("player.setCoverDefault", []);
      if (desired === job) await command("app.setThumbnail", [thumbnailPayload(job)]);
    }
    async function drain() {
      while (desired && (!applied || desired.key !== applied.key)) {
        var job = desired;
        if (job.active && namespace._entry && namespace._entry.active) await windowControls.initialize();
        if (desired !== job) continue;
        if (job.active && !enabled) { await command("player.setSMTCEnable", [true]); enabled = true; }
        if (desired !== job) continue;
        var metadataChanged = !applied || JSON.stringify(job.info) !== JSON.stringify(applied.info);
        if (!metadataChanged) { job.useDefaultCover = applied.useDefaultCover; job.systemCover = applied.systemCover; }
        var coverReady = metadataChanged && job.cover ? preloadCover(job.cover).then(function (url) { return { url: url }; }, function (error) { return { error: error }; }) : null;
        if (metadataChanged) {
          await command("player.setInfo", [job.info]);
          if (desired !== job) continue;
          desktopLabels(job);
        }
        if (!applied || applied.status !== job.status || metadataChanged)
          await command("player.setMiniPlayerState", [{ playstate: job.status }]);
        if (desired !== job) continue;
        if (!metadataChanged && applied.status !== job.status)
          // setMiniPlayerState rebuilds the Native thumbnail. setThumbnail is
          // a replacement API, so resend the cover and all three buttons.
          await command("app.setThumbnail", [thumbnailPayload(job)]);
        if (desired !== job) continue;
        if (metadataChanged) {
          if (job.cover) {
            var coverResult = await coverReady;
            if (coverResult.error) {
              var error = coverResult.error;
              if (error.code === "CANCELLED") continue;
              if (desired !== job) continue;
              await defaultCover(job); applied = job;
              if (job.cover.startsWith("orpheus://localmusic/pic?")) continue;
              throw error;
            }
            if (desired !== job) continue;
            job.systemCover = coverResult.url;
            await command("app.setThumbnail", [thumbnailPayload(job)]);
            if (desired !== job) continue;
            await command("player.setCover", [job.systemCover]);
          } else await defaultCover(job);
        }
        // Native SMTC creation and setInfo/setMiniPlayerState can reset the
        // timeline. Submit the latest position after those commands complete.
        if (desired === job) republishTimeline();
        applied = job;
      }
    }
    function publish(job) {
      if (!desired || desired.key !== job.key) {
        desired = job;
        if (coverLoad && coverLoad.url !== job.cover && coverLoad.cancel) coverLoad.cancel();
      }
      if (!running) {
        var failed = false;
        running = drain().catch(function (error) { failed = true; throw error; }).finally(function () {
          running = null;
          if (!failed && desired && (!applied || applied.key !== desired.key)) return publish(desired);
        });
      }
      return running;
    }
    return Object.freeze({
      update: function (song, state) { if (closed) return Promise.resolve(); updateTimeline(song, state, false); return publish(mediaJob(song, state)); },
      clear: function () { updateTimeline(null, null, true); return publish(mediaJob(null, null)); },
      dispose: function () { closed = true; release(); releaseThumbnail(); releaseTrayClick(); releaseTrayRightClick();
        if (root.removeEventListener) root.removeEventListener("storage", trayStorage);
        if (trayCheck) root.clearTimeout(trayCheck);
        updateTimeline(null, null, true);
        return publish(mediaJob(null, null)); }
    });
  }
  Object.defineProperty(namespace, "_shell", { value: Object.freeze({
    window: windowControls, artwork: artwork, systemMedia: Object.freeze({ createSession: createMediaSession })
  }) });
})(globalThis);
