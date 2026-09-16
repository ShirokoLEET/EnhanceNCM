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
  namespace._settings = Object.freeze({ playback: playback, updatePlayback: updatePlayback });
})(globalThis);
