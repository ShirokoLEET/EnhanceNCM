(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM;
  if (namespace._playback) return;
  var bridge = namespace._native;
  var listeners = new Set();
  var state = { songId: null, playId: null, status: "idle", current: 0,
    duration: 0, volume: 1, buffering: false, pendingStatus: null, audioCache: null, localSong: null, error: null };
  var generation = 0;
  var sequence = 0;
  var releaseEvents = null;
  var pendingLoad = null;
  var pendingControl = null;
  var latestControlId = null;
  var volumeVersion = 0;

  function error(message, code) {
    var result = new Error(message);
    result.name = "EnhanceNCMError";
    result.code = code;
    return result;
  }
  function snapshot() { return Object.freeze(Object.assign({}, state)); }
  function update(change) {
    state = Object.assign({}, state, change);
    var value = snapshot();
    listeners.forEach(function (fn) { try { fn(value); } catch (_) {} });
  }
  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }
  function number(value, label, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
      throw new RangeError(label + " must be between " + min + " and " + max);
    return value;
  }
  function id(value) {
    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
      return String(value);
    throw new TypeError("song ID must be a positive integer ID (number or string)");
  }
  function wait(promise, label, timeout) {
    var timer;
    return Promise.race([promise, new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(error(label + " timed out", "TIMEOUT")); }, timeout);
    })]).finally(function () { clearTimeout(timer); });
  }
  function command(name, args) {
    if (!root.channel || typeof root.channel.call !== "function")
      return Promise.reject(error("Native audio player is unavailable", "BRIDGE_UNAVAILABLE"));
    return wait(bridge.callArgs(name, args), name, 5000);
  }
  function disposeEvents() {
    if (releaseEvents) releaseEvents.forEach(function (release) { release(); });
    releaseEvents = null;
  }
  function cancelLoad() {
    if (pendingLoad) {
      pendingLoad.release();
      pendingLoad.reject(error("playback was superseded", "CANCELLED"));
    }
    pendingLoad = null;
  }
  function cancelControl() {
    if (pendingControl) pendingControl.finish();
  }
  function control(target) {
    cancelControl();
    var playId = state.playId;
    var currentGeneration = generation;
    var requestId = playId + (target === "playing" ? "|resume|" : "|pause|") + (++sequence);
    latestControlId = requestId;
    return new Promise(function (resolve, reject) {
      var timer;
      var request = { id: requestId, finish: function (confirmed, cause) {
        if (pendingControl !== request) return;
        clearTimeout(timer);
        pendingControl = null;
        if (currentGeneration === generation && state.playId === playId) {
          var change = { pendingStatus: null };
          if (confirmed) change.status = confirmed;
          update(change);
        }
        if (cause) reject(cause); else resolve(snapshot());
      } };
      pendingControl = request;
      timer = setTimeout(function () {
        request.finish(null, error("Native playback control timed out", "TIMEOUT"));
      }, 5000);
      update({ pendingStatus: target });
      // Some client builds deliver onPlayState before (or without) the call
      // callback. Either acknowledgement completes this request exactly once.
      bridge.callArgs(target === "playing" ? "audioplayer.play" : "audioplayer.pause", [playId, requestId])
        .then(function () { request.finish(target); }, function (cause) { request.finish(null, cause); });
    });
  }
  function watch(playId) {
    disposeEvents();
    try {
      releaseEvents = [];
      releaseEvents.push(bridge.subscribe("audioplayer.onPlayState", function (id, requestId, value) {
          if (id !== playId || (value !== 1 && value !== 2)) return;
          var ownRequest = typeof requestId === "string" &&
            (requestId.startsWith(playId + "|pause|") || requestId.startsWith(playId + "|resume|"));
          if (ownRequest && (requestId !== latestControlId || state.status === "ended")) return;
          if (!ownRequest) latestControlId = null;
          var status = value === 1 ? "playing" : "paused";
          if (pendingControl) pendingControl.finish(status);
          else update({ status: status });
        }));
      releaseEvents.push(bridge.subscribe("audioplayer.onPlayProgress", function (id, current) {
          if (id === playId && Number.isFinite(current)) update({ current: Math.max(0, current) });
        }));
      releaseEvents.push(bridge.subscribe("audioplayer.onEnd", function (id, info) {
          if (id === playId) {
            cancelControl();
            update({ status: "ended", buffering: false, pendingStatus: null });
          }
        }));
      releaseEvents.push(bridge.subscribe("audioplayer.onBuffering", function (id, value) {
          if (id === playId) update({ buffering: !!value });
        }));
      releaseEvents.push(bridge.subscribe("audioplayer.onSeek", function (id, seekId, code, position) {
          if (id === playId && code === 0 && Number.isFinite(position))
            update({ current: Math.max(0, position) });
        }));
    } catch (cause) {
      disposeEvents();
      throw error("Native audio event channel is unavailable", "BRIDGE_UNAVAILABLE");
    }
  }
  async function play(value, options) {
    var local = namespace._localMusic && namespace._localMusic.isLocal(value) ? value : null;
    var songId = local ? local.id : id(value);
    options = options || {};
    var level = options.level === undefined ? "standard" : options.level;
    var startPosition = options.startPosition === undefined ? 0 : number(options.startPosition, "startPosition", 0, Number.MAX_SAFE_INTEGER);
    // Reuse songs.getUrl's level validation, including before changing state.
    if (typeof level !== "string" || !/^(standard|exhigh|lossless|hires|jyeffect|vivid|jymaster|sky)$/.test(level))
      throw new TypeError("unsupported audio level");
    var currentGeneration = ++generation;
    cancelLoad();
    cancelControl();
    if (state.playId) await command("audioplayer.stop", [state.playId]);
    if (currentGeneration !== generation) throw error("playback was superseded", "CANCELLED");
    disposeEvents();
    update({ songId: songId, playId: null, status: "loading", current: 0,
      duration: 0, buffering: false, pendingStatus: null, audioCache: null, localSong: null, error: null });
    try {
      if (namespace._entry && namespace._entry.active) await namespace._startup.initializeStorage();
      var resolved;
      if (local) {
        await namespace._localMusic.exists(local.localPath);
        resolved = { audio: null, cache: { urlSource: "local" } };
      } else resolved = await namespace._audioSource.resolve(songId, level, function () { return currentGeneration === generation; });
      var audio = resolved.audio;
      if (currentGeneration !== generation) throw error("playback was superseded", "CANCELLED");
      var info = local ? { type: 0, path: local.localPath, songId: songId,
        bitrate: local.bitrate || 128, playbrt: local.bitrate || 0, volumeDelta: 0 } : namespace._audioSource.createPlayInfo(songId, audio);
      update({ audioCache: resolved.cache, localSong: local });
      var playId = songId + "_" + Date.now().toString(36) + "_" + (++sequence);
      watch(playId);
      update({ playId: playId });
      var loaded = new Promise(function (resolve, reject) {
        var release = bridge.subscribe("audioplayer.onLoad", function (id, result) {
          if (id !== playId) return;
          release(); if (pendingLoad && pendingLoad.playId === playId) pendingLoad = null;
          result && result.code === 0 ? resolve(result) : reject(error("Native audio load failed", "LOAD_FAILED"));
        });
        pendingLoad = { playId: playId, reject: reject, release: release };
      });
      // Do not wait for the command callback: completion is reported via onLoad.
      command("audioplayer.load", [playId, Object.assign(info, { playId: playId })])
        .catch(function (cause) {
          if (pendingLoad && pendingLoad.playId === playId) {
            var request = pendingLoad; pendingLoad = null;
            request.release(); request.reject(cause);
          }
        });
      var result;
      try { result = await wait(loaded, "audioplayer.onLoad", 30000); }
      finally {
        if (pendingLoad && pendingLoad.playId === playId) {
          pendingLoad.release(); pendingLoad = null;
        }
      }
      if (currentGeneration !== generation) throw error("playback was superseded", "CANCELLED");
      update({ duration: Number(result.duration) || 0, audioCache: Object.freeze(Object.assign({}, resolved.cache, {
        openWholeCached: typeof result.openWholeCached === "boolean" ? result.openWholeCached : null,
        preloadWholeCached: typeof result.preloadWholeCached === "boolean" ? result.preloadWholeCached : null
      })) });
      if (startPosition > 0) await seek(Math.min(startPosition, Math.max(0, state.duration - 0.25)));
      if (currentGeneration !== generation) throw error("playback was superseded", "CANCELLED");
      await control("playing");
      if (currentGeneration !== generation) throw error("playback was superseded", "CANCELLED");
      return snapshot();
    } catch (cause) {
      if (currentGeneration === generation) {
        namespace._audioSource.invalidate(songId, level);
        disposeEvents();
        if (state.playId) await command("audioplayer.stop", [state.playId]).catch(function () {});
        if (currentGeneration === generation)
          update({ playId: null, status: "error", buffering: false,
            error: cause.code || "PLAY_FAILED" });
      }
      throw cause;
    }
  }
  async function pause() {
    if (!state.playId) return snapshot();
    return control("paused");
  }
  async function resume() {
    if (!state.playId || state.status === "ended")
      throw error("no paused song is loaded", "NO_PLAYBACK");
    return control("playing");
  }
  async function stop() {
    var currentGeneration = ++generation;
    cancelLoad();
    cancelControl();
    var previous = snapshot();
    var playId = state.playId;
    disposeEvents();
    update({ songId: null, playId: null, status: "idle", current: 0,
      duration: 0, buffering: false, pendingStatus: null, audioCache: null, localSong: null, error: null });
    if (playId) {
      try { await command("audioplayer.stop", [playId]); }
      catch (cause) {
        // Retain the handle so a failed stop can be retried before navigation.
        if (currentGeneration === generation)
          update(Object.assign({}, previous, { status: "error", buffering: false, pendingStatus: null, error: cause.code || "STOP_FAILED" }));
        throw cause;
      }
    }
    return snapshot();
  }
  async function seek(seconds) {
    number(seconds, "seconds", 0, Number.MAX_SAFE_INTEGER);
    if (!state.playId) throw error("no song is loaded", "NO_PLAYBACK");
    var playId = state.playId;
    var seekId = playId + "|seek|" + (++sequence);
    await command("audioplayer.seek", [playId, seekId, seconds]);
    // Progress is confirmed by onSeek/onPlayProgress; don't guess on failure.
    return snapshot();
  }
  async function setVolume(volume) {
    number(volume, "volume", 0, 1);
    var current = ++volumeVersion;
    await command("audioplayer.setVolume", ["", "", volume]);
    if (current === volumeVersion) update({ volume: volume });
    return snapshot();
  }

  Object.defineProperty(namespace, "_playback", { value: Object.freeze({
    play: play, pause: pause, resume: resume, stop: stop, seek: seek,
    setVolume: setVolume, getState: snapshot, subscribe: subscribe
  }) });
})(globalThis);
