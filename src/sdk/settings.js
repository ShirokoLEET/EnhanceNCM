(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM || (root.EnhanceNCM = {});
  var key = "enhancencm.settings.v1";
  function stored() { try { var value = JSON.parse(root.localStorage.getItem(key)); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
  function volume(value, fallback) { return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback; }
  function playback() {
    var value = stored().playback || {};
    return { rememberVolume: true, restoreQueue: true,
      restorePosition: true, autoPlay: false,
      volume: volume(value.volume, 1), previousVolume: volume(value.previousVolume, 0.7) || 0.7 };
  }
  function updatePlayback(change) {
    var saved = stored(), next = Object.assign(playback(), change);
    ["rememberVolume", "restoreQueue", "restorePosition"].forEach(function (key) {
      if (typeof next[key] !== "boolean") throw new TypeError(key + " must be boolean");
    });
    if (volume(next.volume, null) === null || volume(next.previousVolume, null) === null || !next.previousVolume)
      throw new RangeError("volume must be between 0 and 1; previousVolume must be positive");
    next.rememberVolume = next.restoreQueue = next.restorePosition = true;
    next.autoPlay = false;
    saved.playback = next;
    root.localStorage.setItem(key, JSON.stringify(saved));
    return playback();
  }
  function normalizeNowPlaying(value) {
    value = value || {};
    return { webApi: value.webApi === true, fileOutput: value.fileOutput === true };
  }
  function nativeNowPlaying() {
    if (typeof namespace.readNowPlayingSettings !== "function") return null;
    try {
      var raw = namespace.readNowPlayingSettings();
      if (typeof raw !== "string" || !raw.trim()) return null;
      var value = JSON.parse(raw);
      value = value && value.nowPlaying || value;
      return value && typeof value === "object" && !Array.isArray(value) ? normalizeNowPlaying(value) : null;
    } catch (_) { return null; }
  }
  function removeLegacyNowPlaying() {
    try {
      var saved = stored();
      if (!Object.prototype.hasOwnProperty.call(saved, "nowPlaying")) return;
      delete saved.nowPlaying;
      root.localStorage.setItem(key, JSON.stringify(saved));
    } catch (_) {}
  }
  function nowPlaying() {
    var native = nativeNowPlaying();
    if (native) return native;
    // Read the old value only once so an upgrade can move it to the native
    // JSON file. New writes never put now-playing settings in LocalStorage.
    var saved = stored(), legacy = saved.nowPlaying;
    var value = normalizeNowPlaying(legacy);
    if (legacy && typeof namespace.configureNowPlayingService === "function") {
      try {
        namespace.configureNowPlayingService(value.webApi, value.fileOutput);
        removeLegacyNowPlaying();
      } catch (_) {}
    }
    return value;
  }
  function updateNowPlaying(change) {
    if (!change || typeof change !== "object" || Array.isArray(change))
      throw new TypeError("now-playing settings must be an object");
    var next = Object.assign(nowPlaying(), change);
    ["webApi", "fileOutput"].forEach(function (key) {
      if (typeof next[key] !== "boolean") throw new TypeError(key + " must be boolean");
    });
    var persisted = false;
    if (namespace._nowPlaying && namespace._nowPlaying.configure) {
      namespace._nowPlaying.configure(next);
      persisted = true;
    } else if (typeof namespace.configureNowPlayingService === "function") {
      namespace.configureNowPlayingService(next.webApi, next.fileOutput);
      persisted = true;
    }
    if (persisted) removeLegacyNowPlaying();
    return nowPlaying();
  }
  namespace._settings = Object.freeze({ playback: playback, updatePlayback: updatePlayback,
    nowPlaying: nowPlaying, updateNowPlaying: updateNowPlaying });
})(globalThis);
