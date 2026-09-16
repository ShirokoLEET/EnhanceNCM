(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM, bridge = namespace._native;
  if (namespace._audioSource) return;
  var memory = new Map(), owner = null;
  var stats = { urlRequests: 0, urlReuses: 0, cacheChecks: 0, completeHits: 0, cacheErrors: 0 };
  function trial(audio) {
    var privilege = audio && audio.freeTrialPrivilege;
    return !!(audio && (audio.freeTrialInfo || (privilege && privilege.resConsumable && privilege.userConsumable)));
  }
  function full(audio) {
    return !!(audio && audio.code === 200 && !trial(audio) && typeof audio.url === "string" &&
      /^https?:\/\//.test(audio.url) && typeof audio.md5 === "string" && audio.md5 &&
      Number(audio.size) > 0 && Number(audio.br) > 0);
  }
  function metadata(audio) {
    if (!full(audio)) return "";
    // Same non-trial fields serialized by the original createSourcePlayInfo.
    var data = { resourceType: "track" };
    ["md5", "size", "url", "level", "fee", "flag", "freeTrialPrivilege", "freeTrialInfo", "format", "code",
      "time", "gain", "type", "podcastCtrp", "rightSource", "br"].forEach(function (key) {
      if (audio[key] !== undefined) data[key] = audio[key];
    });
    return JSON.stringify(data);
  }
  function playInfo(songId, audio) {
    if (!audio || typeof audio.url !== "string" || !/^https?:\/\//.test(audio.url))
      { var cause = new Error("this song has no playable audio URL"); cause.name = "EnhanceNCMError"; cause.code = "PLAY_UNAVAILABLE"; throw cause; }
    // Fields and units are from the loaded desktop frontend's online
    // createSourcePlayInfo -> audioplayer.load path (3.1.39.205426).
    return { type: 4, songId: songId, musicurl: audio.url,
      md5: audio.md5 || "", fileSize: audio.size || 0,
      bitrate: Number(audio.br || 128000) / 1000,
      br: String(audio.br || 128000),
      songDuration: String(audio.time || 0),
      format: audio.format || "", audioFormat: audio.type || "",
      level: audio.level || "standard", freeTrialInfo: audio.freeTrialInfo || null,
      freeTrialPrivilege: audio.freeTrialPrivilege || null,
      volumeDelta: audio.gain || 0, expireTime: audio.expi || 0,
      audioType: "track", extHeader: JSON.stringify({ "X-SONG-INFO": String(audio.size || 0) + ";" + String(audio.time || 0) }),
      playInfoStr: metadata(audio) };
  }
  function current(check) {
    if (check && !check()) { var cause = new Error("playback was superseded"); cause.code = "CANCELLED"; throw cause; }
  }
  async function resolve(songId, level, check) {
    var accountKey = null;
    try {
      var account = await namespace.sdk.account.getCurrent();
      accountKey = JSON.stringify([account.userId, account.profile && account.profile.vipType,
        account.profile && account.profile.vipRights, account.account]);
    } catch (_) { /* Fresh URL authorization still supports anonymous free songs. */ }
    current(check);
    if (accountKey !== owner) { memory.clear(); owner = accountKey; }
    var key = songId + ":" + level, entry = memory.get(key);
    var reuse = !!(accountKey && entry && entry.owner === accountKey && entry.created <= Date.now() && entry.expires > Date.now());
    var audio;
    if (reuse) { audio = entry.audio; stats.urlReuses++; }
    else {
      memory.delete(key); stats.urlRequests++;
      audio = await namespace.sdk.songs.getUrl(songId, level);
      current(check);
      // Authorization remains page-local and short lived. Native metadata from
      // an older page/account never authorizes playback on its own.
      if (accountKey && owner === accountKey && full(audio) && Number(audio.expi) > 0) {
        memory.set(key, { owner: accountKey, audio: JSON.parse(JSON.stringify(audio)), created: Date.now(),
          expires: Date.now() + Math.min(Number(audio.expi) * 1000, 300000) });
        if (memory.size > 32) memory.delete(memory.keys().next().value);
      }
    }
    var status = { urlSource: reuse ? "memory" : "network", cachePercent: null, cacheComplete: false,
      hasNativePlayInfo: false, openWholeCached: null, preloadWholeCached: null };
    if (full(audio)) {
      var timer;
      try {
        stats.cacheChecks++;
        var cached = await Promise.race([
          bridge.callArgs("storage.queryNewCacheTrack", [{ songId: String(songId), bitrate: Number(audio.br) / 1000, md5: audio.md5 }]),
          new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error("Native cache query timed out")); }, 1500); })
        ]);
        current(check);
        if (cached && String(cached.songId) === String(songId) && cached.md5 === audio.md5 && Number(cached.bitrate) === Number(audio.br) / 1000) {
          status.cachePercent = Number.isFinite(Number(cached.cached)) ? Number(cached.cached) : null;
          status.cacheComplete = cached.cached === 100;
          if (cached.playInfoStr) {
            try {
              var info = JSON.parse(cached.playInfoStr);
              status.hasNativePlayInfo = full(info) && info.md5 === audio.md5 && info.br === audio.br && info.resourceType === "track";
            } catch (_) {}
          }
          if (status.cacheComplete) stats.completeHits++;
        }
      } catch (cause) {
        if (cause.code === "CANCELLED") throw cause;
        stats.cacheErrors++;
      } finally { clearTimeout(timer); }
    }
    current(check);
    return { audio: audio, cache: Object.freeze(status) };
  }
  Object.defineProperty(namespace, "_audioSource", { value: Object.freeze({ resolve: resolve, metadata: metadata, createPlayInfo: playInfo,
    invalidate: function (id, level) { memory.delete(id + ":" + level); },
    clearMemory: function () { memory.clear(); owner = null; },
    getState: function () { return Object.freeze(Object.assign({}, stats)); }
  }) });
})(globalThis);
