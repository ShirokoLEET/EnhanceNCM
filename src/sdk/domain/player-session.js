(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  if (namespace._player) return;
  var activeSession = null;
  function recommendationLoader(kind) {
    if (kind !== "roaming" && kind !== "heartmode") throw new TypeError("dynamic source must be roaming or heartmode");
    return function (state) {
      var api = namespace.sdk.recommendations;
      if (kind === "roaming") return api.getPrivateRoaming();
      return api.getHeartMode(state.song ? { songId: state.song.id,
        startMusicId: state.queue.length ? state.queue[0].id : state.song.id } : {});
    };
  }
  function createSession(options) {
    options = options || {};
    ["onError", "onMediaError", "resolveSong", "preparePlayback"].forEach(function (name) {
      if (options[name] !== undefined && typeof options[name] !== "function") throw new TypeError(name + " must be a function");
    });
    if (activeSession) throw new Error("A player session already owns this page; reuse it or await dispose()");
    var playback = namespace.sdk.playback;
    var listeners = new Set(), queue = Object.freeze([]), song = null, source = null;
    var shuffle = false, repeatOne = false, loading = false, disposed = false;
    var version = 0, handledEnd = null, loadMore = null, advancing = null;
    var nativeState = playback.getState(), media = null, mediaSignature = null, disposeJob = null;
    var previousVolume = Number.isFinite(options.previousVolume) && options.previousVolume > 0 && options.previousVolume <= 1
      ? options.previousVolume : nativeState.volume || 0.7;
    var restoredPosition = null, resumeAt = 0, revision = 0;
    function snapshot() {
      var state = restoredPosition !== null && song ? Object.freeze(Object.assign({}, nativeState, {
        songId: String(song.id), playId: null, status: "paused", current: restoredPosition,
        duration: Number(song.dt) / 1000 || 0, restored: true
      })) : nativeState;
      return Object.freeze({ song: song, queue: queue, source: source,
        shuffle: shuffle, repeatOne: repeatOne, loading: loading, dynamic: !!loadMore, playback: state });
    }
    function report(cause) { if (!disposed && options.onError) options.onError(cause); }
    function mediaError(cause) { if (!disposed && options.onMediaError) options.onMediaError(cause); }
    function publish() {
      var state = snapshot();
      if (media && !disposed) {
        // The chosen track is known before authorization and Native audio load finish.
        // Publish its artwork immediately, but keep the media control paused until playback confirms it.
        var mediaState = loading && song ? Object.assign({}, state.playback,
          { songId: String(song.id), status: "loading" }) : state.playback;
        var signature = JSON.stringify([song, mediaState.songId, mediaState.status]);
        if (signature !== mediaSignature) { mediaSignature = signature; media.update(song, mediaState).catch(mediaError); }
      }
      listeners.forEach(function (fn) { try { fn(state); } catch (_) {} });
    }
    function check() { if (disposed) throw new Error("Player session is disposed"); }
    function cloneSong(value) {
      if (!value || (!/^[1-9]\d*$/.test(String(value.id)) && !(namespace.sdk.localMusic && namespace.sdk.localMusic.isLocal(value)))) throw new TypeError("song requires a positive integer id");
      if (typeof value.id === "number" && !Number.isSafeInteger(value.id)) throw new TypeError("song id must be a safe integer or string");
      // Clone input once; progress snapshots retain stable song/queue references.
      function freeze(item) {
        if (item && typeof item === "object") { Object.keys(item).forEach(function (key) { freeze(item[key]); }); Object.freeze(item); }
        return item;
      }
      var result = JSON.parse(JSON.stringify(value));
      if (!result.name) result.name = "歌曲 " + result.id;
      return freeze(result);
    }
    function replaceQueue(items) {
      if (!Array.isArray(items)) throw new TypeError("queue must be an array");
      var unique = new Map();
      items.forEach(function (item) { unique.set(String(item.id), cloneSong(item)); });
      queue = Object.freeze(Array.from(unique.values()));
    }
    function append(items, expectedSource) {
      check();
      if (expectedSource !== undefined && expectedSource !== source) return snapshot();
      ++revision; replaceQueue(queue.concat(items)); publish(); return snapshot();
    }
    var nextSongId = null;
    function insertNext(value) {
      check(); var item = cloneSong(value);
      if (song && String(song.id) === String(item.id)) return snapshot();
      var items = queue.filter(function (entry) { return String(entry.id) !== String(item.id); });
      var index = items.findIndex(function (entry) { return song && String(entry.id) === String(song.id); });
      items.splice(index + 1, 0, item); ++revision; replaceQueue(items);
      nextSongId = String(item.id); publish(); return snapshot();
    }
    function clearContinuation() { check(); source = null; loadMore = null; publish(); }
    async function play(value, settings) {
      check(); settings = settings || {};
      ++revision;
      if (settings.source != null && typeof settings.source !== "string") throw new TypeError("source must be a string");
      if (settings.level !== undefined && !/^(standard|exhigh|lossless|hires|jyeffect|vivid|jymaster|sky)$/.test(settings.level))
        throw new TypeError("unsupported audio level");
      var selected = cloneSong(value);
      if (settings.loadMore !== undefined && settings.loadMore !== null && typeof settings.loadMore !== "function")
        throw new TypeError("loadMore must be a function");
      if (settings.queue) {
        nextSongId = null;
        replaceQueue(settings.queue); source = settings.source || null; loadMore = settings.loadMore || null;
        if (loadMore) shuffle = false;
      }
      if (!queue.some(function (item) { return String(item.id) === String(selected.id); })) replaceQueue(queue.concat([selected]));
      song = queue.find(function (item) { return String(item.id) === String(selected.id); });
      restoredPosition = null; resumeAt = settings.startPosition || 0;
      var current = ++version; loading = true; publish();
      try {
        if (options.preparePlayback) await options.preparePlayback();
        if (disposed || current !== version) throw new Error("Playback was cancelled");
        await playback.play(song.localPath ? song : song.id, { level: settings.level || "standard", startPosition: resumeAt });
      }
      finally { if (!disposed && current === version) { loading = false; nativeState = playback.getState(); publish(); } }
      return snapshot();
    }
    async function stop() { check(); ++revision; ++version; loading = false; await playback.stop(); return snapshot(); }
    async function toggle() {
      check();
      if (loading || nativeState.status === "loading") return stop();
      if (restoredPosition !== null && song) return play(song, { startPosition: restoredPosition });
      var status = nativeState.pendingStatus || nativeState.status;
      if (status === "playing") { await playback.pause(); return snapshot(); }
      if (status === "paused") { await playback.resume(); return snapshot(); }
      if (song) return play(song);
      return snapshot();
    }
    async function next(settings) {
      check(); settings = settings || {};
      if (!queue.length) return snapshot();
      if (nextSongId) {
        var queuedNext = queue.find(function (item) { return String(item.id) === nextSongId; });
        nextSongId = null;
        if (queuedNext) return play(queuedNext);
      }
      var index = queue.findIndex(function (item) { return song && String(item.id) === String(song.id); });
      if (settings.ended && repeatOne && song) return play(song);
      if (index === queue.length - 1 && loadMore) {
        if (advancing && advancing.version === version) return advancing.job;
        var current = version, expectedSource = source, loader = loadMore;
        var request = { version: current, job: null };
        advancing = request;
        request.job = (async function () {
          var items;
          try { items = await loader(snapshot()); }
          catch (cause) {
            if (disposed || version !== current || source !== expectedSource || loader !== loadMore) return snapshot();
            throw cause;
          }
          if (disposed || version !== current || source !== expectedSource || loader !== loadMore) return snapshot();
          append(items, expectedSource);
          if (index + 1 < queue.length) return play(queue[index + 1]);
          var cause = new Error("No new recommendations"); cause.code = "NO_RECOMMENDATIONS"; throw cause;
        })();
        try { return await request.job; }
        finally { if (advancing === request) advancing = null; }
      }
      if (settings.ended && !shuffle && index === queue.length - 1) return snapshot();
      var nextIndex = shuffle && queue.length > 1 ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length : (index + 1) % queue.length;
      return play(queue[nextIndex]);
    }
    async function previous() {
      check();
      if (snapshot().playback.current > 3) return seek(0);
      if (!queue.length) return snapshot();
      var index = queue.findIndex(function (item) { return song && String(item.id) === String(song.id); });
      var previousIndex = shuffle && queue.length > 1 ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length : (index - 1 + queue.length) % queue.length;
      return play(queue[previousIndex]);
    }
    function setShuffle(value) { check(); if (typeof value !== "boolean") throw new TypeError("shuffle must be boolean"); ++revision; shuffle = loadMore ? false : value; publish(); }
    function setRepeatOne(value) { check(); if (typeof value !== "boolean") throw new TypeError("repeatOne must be boolean"); ++revision; repeatOne = value; publish(); }
    async function seek(seconds) {
      check();
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("invalid seek position");
      ++revision;
      if (restoredPosition !== null) { restoredPosition = resumeAt = seconds; publish(); }
      else await playback.seek(seconds);
      return snapshot();
    }
    function restoreState(saved) {
      check();
      if (nativeState.playId || loading) throw new Error("Cannot restore over active playback");
      saved = saved || {};
      nextSongId = null;
      replaceQueue(saved.queue || []);
      song = queue.find(function (item) { return String(item.id) === String(saved.songId); }) || null;
      source = typeof saved.source === "string" ? saved.source : null;
      loadMore = ["roaming", "heartmode"].includes(source) ? recommendationLoader(source) : null;
      shuffle = !loadMore && saved.shuffle === true; repeatOne = saved.repeatOne === true;
      restoredPosition = song ? Math.max(0, Number(saved.position) || 0) : null;
      resumeAt = restoredPosition || 0;
      publish(); return snapshot();
    }
    function exportState() { return { version: 1, queue: queue, songId: song ? String(song.id) : null,
      source: source, shuffle: shuffle, repeatOne: repeatOne,
      position: restoredPosition !== null ? restoredPosition : resumeAt }; }
    async function setVolume(value) { check(); await playback.setVolume(value); if (value > 0) previousVolume = value; return snapshot(); }
    function toggleMute() { check(); return setVolume(nativeState.volume ? 0 : previousVolume); }
    async function systemAction(action) {
      if (disposed) return;
      try {
        var status = nativeState.pendingStatus || nativeState.status;
        if (action === "next") await next();
        else if (action === "prev") await previous();
        else if (action === "stop") await stop();
        else if (action === "pause" && (loading || status === "loading")) await stop();
        else if (action === "pause" && status === "playing") await playback.pause();
        else if (action === "play" && !loading && status !== "playing") await toggle();
      } catch (cause) { report(cause); }
    }
    function connectSystemMedia(onShellAction) { check(); if (!media) media = namespace.sdk.systemMedia.createSession(systemAction, onShellAction); publish(); }
    async function clearSystemMedia() { mediaSignature = null; if (media) await media.clear(); }
    function sync(state) {
      if (disposed) return;
      if (loading && state.songId && song && String(state.songId) !== String(song.id)) return;
      var volumeChanged = state.volume !== nativeState.volume;
      nativeState = state;
      if (song && String(state.songId) === String(song.id) && /^(playing|paused|ended)$/.test(state.status) && Number.isFinite(state.current))
        resumeAt = state.current;
      // Initial synchronization must retain the persisted pre-mute volume.
      if (volumeChanged && state.volume > 0) previousVolume = state.volume;
      if (state.songId && (!song || String(state.songId) !== String(song.id))) {
        var current = ++version;
        song = cloneSong(state.localSong || { id: state.songId, name: "歌曲 " + state.songId });
        queue = Object.freeze([song]); source = null; loadMore = null;
        var resolveSong = options.resolveSong || function (id) { return state.localSong || namespace.sdk.songs.get(id); };
        Promise.resolve().then(function () { return resolveSong(state.songId); }).then(function (detail) {
          if (detail && !disposed && version === current && song && String(detail.id) === String(song.id)) {
            song = cloneSong(detail); replaceQueue([song]); publish();
          }
        }).catch(report);
      }
      if (/^(playing|paused)$/.test(state.status)) loading = false;
      publish();
      if (state.status === "ended" && state.playId && handledEnd !== state.playId && !loading) {
        handledEnd = state.playId; next({ ended: true }).catch(report);
      }
    }
    var unsubscribe = playback.subscribe(sync);
    function dispose() {
      if (disposeJob) return disposeJob;
      disposed = true; ++version; unsubscribe(); listeners.clear();
      disposeJob = Promise.all([playback.stop(), media ? media.dispose() : Promise.resolve()])
        .then(function () { if (activeSession === api) activeSession = null; })
        .catch(function (cause) { disposeJob = null; throw cause; });
      return disposeJob;
    }
    var api = Object.freeze({ getState: snapshot, subscribe: function (listener) {
      check(); if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener); return function () { listeners.delete(listener); };
    }, play: play, toggle: toggle, pause: async function () { check(); await playback.pause(); return snapshot(); },
    resume: async function () { check(); if (restoredPosition !== null && song) return play(song, { startPosition: restoredPosition }); await playback.resume(); return snapshot(); }, stop: stop, next: next, previous: previous,
    seek: seek, setVolume: setVolume, toggleMute: toggleMute,
    restoreState: restoreState, exportState: exportState, getRevision: function () { return revision; },
    setShuffle: setShuffle, setRepeatOne: setRepeatOne, append: append, insertNext: insertNext, clearContinuation: clearContinuation,
    connectSystemMedia: connectSystemMedia, clearSystemMedia: clearSystemMedia, dispose: dispose });
    activeSession = api; sync(nativeState); return api;
  }
  Object.defineProperty(namespace, "_player", { value: Object.freeze({ createSession: createSession, recommendationLoader: recommendationLoader,
    getActiveSession: function () { return activeSession; } }) });
})(globalThis);
