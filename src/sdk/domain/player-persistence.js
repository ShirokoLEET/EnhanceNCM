(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  function cleanSong(value) {
    if (namespace._localMusic && namespace._localMusic.isLocal(value)) {
      var local = namespace._localMusic.create(value.localPath, { title: value.name, duration: value.dt,
        bitrate: value.bitrate, artist: (value.ar && value.ar[0] || {}).name, album: (value.al || {}).name });
      return local;
    }
    if (!value || !/^[1-9]\d*$/.test(String(value.id))) return null;
    var album = value.al || value.album || {}, artists = value.ar || value.artists || [];
    if (!Array.isArray(artists)) artists = [];
    var duration = Number(value.dt || value.duration);
    return { id: String(value.id), name: String(value.name || "歌曲 " + value.id).slice(0, 1000),
      dt: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      ar: artists.filter(Boolean).slice(0, 40).map(function (artist) { return { id: String(artist.id || ""), name: String(artist.name || "").slice(0, 500) }; }),
      al: { id: String(album.id || ""), name: String(album.name || "").slice(0, 1000),
        picUrl: /^https?:\/\//.test(album.picUrl || "") ? String(album.picUrl).slice(0, 2048) : "" } };
  }
  function normalize(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.queue) || value.queue.length > 10000) return null;
    var queue = [], ids = new Set();
    value.queue.forEach(function (item) { var song = cleanSong(item); if (song && !ids.has(song.id)) { ids.add(song.id); queue.push(song); } });
    var songId = ids.has(String(value.songId)) ? String(value.songId) : null;
    var song = queue.find(function (item) { return item.id === songId; });
    var position = Number.isFinite(value.position) ? Math.max(0, value.position) : 0;
    if (song && song.dt > 0) position = Math.min(position, Math.max(0, song.dt / 1000 - 0.25));
    return { version: 1, queue: queue, songId: songId, position: position,
      source: typeof value.source === "string" ? value.source.slice(0, 100) : null,
      shuffle: value.shuffle === true, repeatOne: value.repeatOne === true };
  }
  function attach(player, options) {
    options = options || {};
    var store = options.store || namespace._libraryCache.sessions;
    var settings = options.settings || namespace._settings;
    var owner = null, confirmed = false, restoring = false, restoreJob = null, epoch = 0;
    var flushJob = null, failedSaves = 0, changeVersion = 0, restoreFailed = false, errorActive = false;
    var timer = null, dirty = false, exiting = false, disposed = false, lastSaved = null;
    var previousQueue = null, previousSong = null, previousSource = null, previousMode = "", previousSecond = -1;
    var volumeReady = false, volumeJob = null, volumeEpoch = 0, volumeDirty = false;
    var initial = settings.playback(), lastVolume = initial.volume, previousVolume = initial.previousVolume;
    try { settings.updatePlayback({}); } catch (error) { if (options.onError) options.onError(error); }
    function report(error) { if (!disposed && !errorActive && options.onError) options.onError(error); errorActive = true; }
    function recovered() { if (!disposed && options.onRecovered) options.onRecovered(); errorActive = false; }
    function cancelTimer() { if (timer !== null) root.clearTimeout(timer); timer = null; }
    function flush() {
      cancelTimer();
      if (flushJob) return flushJob;
      if (!owner || restoring || !dirty) return Promise.resolve();
      var record = normalize(player.exportState());
      if (!record) return Promise.reject(new Error("Playback queue cannot be saved"));
      if (!record.queue.length && !record.songId) return Promise.resolve();
      var text = JSON.stringify(record);
      if (text === lastSaved) { dirty = false; return Promise.resolve(); }
      var expected = epoch, savedChange = changeVersion, savedOwner = owner;
      flushJob = Promise.resolve().then(function () { return store.save(savedOwner, record); }).then(function () {
        if (expected === epoch) { lastSaved = text; dirty = changeVersion !== savedChange; failedSaves = 0; recovered(); }
      }).catch(function (error) { if (expected === epoch) failedSaves++; throw error; }).finally(function () {
        flushJob = null;
        if (dirty && !disposed && !exiting && !restoring) schedule(false);
      });
      return flushJob;
    }

    function schedule(immediate) {
      if (disposed || exiting || !owner || restoring) return;
      if (timer !== null && !immediate) return;
      cancelTimer();
      timer = root.setTimeout(function () { timer = null; flush().catch(report); }, failedSaves ? Math.min(30000, 5000 * Math.pow(2, Math.min(failedSaves, 3))) : immediate ? 250 : 5000);
    }
    function rememberVolume(volume) {
      if (!Number.isFinite(volume)) return;
      if (volume > 0) previousVolume = volume;
      if (initial.rememberVolume && (volume !== lastVolume || volumeDirty)) {
        try { settings.updatePlayback({ volume: volume, previousVolume: previousVolume }); volumeDirty = false; }
        catch (error) { volumeDirty = true; report(error); }
      }
      lastVolume = volume;
    }
    var release = player.subscribe(function (state) {
      if (volumeReady) rememberVolume(state.playback.volume);
      var mode = String(state.shuffle) + ":" + String(state.repeatOne);
      var structural = previousQueue !== state.queue || previousSong !== state.song || previousSource !== state.source || previousMode !== mode;
      var second = Math.floor(player.exportState().position);
      if (structural || second !== previousSecond) { ++changeVersion; dirty = true; schedule(structural); }
      previousQueue = state.queue; previousSong = state.song; previousSource = state.source; previousMode = mode; previousSecond = second;
    });
    function restoreVolume() {
      if (volumeJob) return volumeJob;
      if (volumeReady) return Promise.resolve();
      var current = volumeEpoch;
      var job = (initial.rememberVolume ? player.setVolume(initial.volume) : Promise.resolve()).then(function () {
        if (current === volumeEpoch) { volumeReady = true; rememberVolume(player.getState().playback.volume); }
      }).finally(function () { if (volumeJob === job) volumeJob = null; });
      volumeJob = job; return job;
    }
    function setVolume(value) {
      ++volumeEpoch; volumeReady = true;
      var job = player.setVolume(value).then(function () { rememberVolume(player.getState().playback.volume); })
        .finally(function () { if (volumeJob === job) volumeJob = null; });
      volumeJob = job; return job;
    }
    function restore(nextOwner, isConfirmed) {
      if (disposed || exiting || !/^(guest|[1-9]\d*)$/.test(String(nextOwner))) return Promise.resolve();
      nextOwner = String(nextOwner);
      if (confirmed && !isConfirmed) return Promise.resolve();
      if (nextOwner === owner && !restoreFailed) { confirmed = confirmed || !!isConfirmed; return restoreJob || Promise.resolve(); }
      var previousOwner = nextOwner === owner ? null : owner;
      restoreFailed = false;
      owner = nextOwner; confirmed = !!isConfirmed; restoring = true; lastSaved = null; cancelTimer();
      var expected = ++epoch, revision = player.getRevision(), canRestore = !!previousOwner || !player.getState().song;
      restoreJob = (async function () {
        if (previousOwner) {
          await player.stop();
          if (expected !== epoch || disposed || exiting) return;
          player.restoreState(null); revision = player.getRevision();
        }
        var saved = initial.restoreQueue ? normalize(await store.read(nextOwner)) : null;
        if (expected !== epoch || disposed || exiting) return;
        if (saved && canRestore && player.getRevision() === revision && !player.getState().playback.playId) {
          if (!initial.restorePosition) saved.position = 0;
          player.restoreState(saved);
          lastSaved = JSON.stringify(saved);
        }
        recovered();
      })().catch(function (error) { if (expected === epoch) restoreFailed = true; throw error; }).finally(function () {
        if (expected === epoch) { restoring = false; restoreJob = null; if (dirty) schedule(false); }
      });
      return restoreJob;
    }
    async function prepareExit() {
      exiting = true; cancelTimer();
      if (volumeJob) await volumeJob;
      if (restoreJob) await restoreJob;
      dirty = true;
      await flush();
      if (dirty) await flush();
    }
    function dispose() { cancelTimer(); disposed = true; ++epoch; release(); }
    return Object.freeze({ restore: restore, restoreVolume: restoreVolume, setVolume: setVolume,
      flush: flush, retry: function () { return restoreFailed ? restore(owner, confirmed) : flush(); }, prepareExit: prepareExit, cancelExit: function () { exiting = false; schedule(false); }, dispose: dispose });
  }
  namespace._playerPersistence = Object.freeze({ attach: attach, normalize: normalize });
})(globalThis);
