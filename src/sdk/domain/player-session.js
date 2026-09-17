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
    var listeners = new Set(), queue = Object.freeze([]), canonicalQueue = Object.freeze([]), song = null, source = null;
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
      if (namespace._nowPlaying && namespace._nowPlaying.publish) {
        try { namespace._nowPlaying.publish(state); } catch (cause) {
          if (namespace.log) namespace.log("Now-playing service: " + cause.message);
        }
      }
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
    function uniqueSongs(items) {
      if (!Array.isArray(items)) throw new TypeError("queue must be an array");
      var unique = new Map();
      items.forEach(function (item) { unique.set(String(item.id), cloneSong(item)); });
      return Array.from(unique.values());
    }
    function shuffled(items) {
      var result = Array.from(items);
      for (var index = result.length - 1; index > 0; index--) {
        var other = Math.floor(Math.random() * (index + 1));
        var item = result[index]; result[index] = result[other]; result[other] = item;
      }
      return result;
    }
    function replaceQueue(items) {
      var ordered = uniqueSongs(items);
      canonicalQueue = Object.freeze(ordered);
      queue = Object.freeze(shuffle ? shuffled(ordered) : ordered);
    }
    function append(items, expectedSource) {
      check();
      if (expectedSource !== undefined && expectedSource !== source) return snapshot();
      var additions = uniqueSongs(items), incoming = new Map();
      additions.forEach(function (item) { incoming.set(String(item.id), item); });
      var known = new Set(canonicalQueue.map(function (item) { return String(item.id); }));
      var ordered = canonicalQueue.map(function (item) { return incoming.get(String(item.id)) || item; });
      additions.forEach(function (item) { if (!known.has(String(item.id))) ordered.push(item); });
      canonicalQueue = Object.freeze(ordered);
      if (shuffle) {
        var active = queue.map(function (item) { return incoming.get(String(item.id)) || item; });
        var activeIds = new Set(queue.map(function (item) { return String(item.id); }));
        additions.forEach(function (item) { if (!activeIds.has(String(item.id))) active.push(item); });
        queue = Object.freeze(active);
      } else queue = canonicalQueue;
      ++revision; publish(); return snapshot();
    }
    var nextSongId = null;
    function insertNext(value) {
      check(); var item = cloneSong(value);
      if (song && String(song.id) === String(item.id)) return snapshot();
      var items = queue.filter(function (entry) { return String(entry.id) !== String(item.id); });
      var index = items.findIndex(function (entry) { return song && String(entry.id) === String(song.id); });
      items.splice(index + 1, 0, item);
      var ordered = canonicalQueue.filter(function (entry) { return String(entry.id) !== String(item.id); });
      var orderedIndex = ordered.findIndex(function (entry) { return song && String(entry.id) === String(song.id); });
      ordered.splice(orderedIndex + 1, 0, item);
      ++revision; canonicalQueue = Object.freeze(ordered); queue = Object.freeze(items);
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
        source = settings.source || null; loadMore = settings.loadMore || null;
        if (loadMore) shuffle = false;
        replaceQueue(settings.queue);
      }
      if (!queue.some(function (item) { return String(item.id) === String(selected.id); })) {
        canonicalQueue = Object.freeze(canonicalQueue.concat([selected]));
        queue = Object.freeze(queue.concat([selected]));
      }
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
      var nextIndex = (index + 1) % queue.length;
      return play(queue[nextIndex]);
    }
    async function previous() {
      check();
      if (snapshot().playback.current > 3) return seek(0);
      if (!queue.length) return snapshot();
      var index = queue.findIndex(function (item) { return song && String(item.id) === String(song.id); });
      var previousIndex = (index - 1 + queue.length) % queue.length;
      return play(queue[previousIndex]);
    }
    function setShuffle(value) {
      check(); if (typeof value !== "boolean") throw new TypeError("shuffle must be boolean");
      var nextShuffle = loadMore ? false : value;
      if (shuffle !== nextShuffle) {
        queue = Object.freeze(nextShuffle ? shuffled(canonicalQueue) : Array.from(canonicalQueue));
      }
      ++revision; shuffle = nextShuffle; publish();
    }
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
      source = typeof saved.source === "string" ? saved.source : null;
      loadMore = ["roaming", "heartmode"].includes(source) ? recommendationLoader(source) : null;
      shuffle = !loadMore && saved.shuffle === true; repeatOne = saved.repeatOne === true;
      canonicalQueue = Object.freeze(uniqueSongs(saved.queue || []));
      // Persisted queues already contain the order that was active when they were saved.
      // Keep it intact so restoring shuffle does not silently generate a new sequence.
      queue = Object.freeze(Array.from(canonicalQueue));
      song = queue.find(function (item) { return String(item.id) === String(saved.songId); }) || null;
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
        queue = canonicalQueue = Object.freeze([song]); source = null; loadMore = null;
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
      if (namespace._nowPlaying && namespace._nowPlaying.clear) {
        try { namespace._nowPlaying.clear(); } catch (cause) {
          if (namespace.log) namespace.log("Now-playing service: " + cause.message);
        }
      }
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
