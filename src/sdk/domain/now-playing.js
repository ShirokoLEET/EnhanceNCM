(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM;
  if (namespace._nowPlaying) return;

  var emptyPlayer = {
    hasSong: false, isPaused: true, volumePercent: 0,
    seekbarCurrentPosition: 0, seekbarCurrentPositionHuman: "0:00",
    statePercent: 0, likeStatus: "INDIFFERENT", repeatType: "NONE"
  };
  var emptyTrack = {
    author: "", title: "", album: "", cover: "", duration: 0,
    durationHuman: "0:00", url: "", id: "", isVideo: false,
    isAdvertisement: false, inLibrary: false
  };
  var emptyProgress = { progress: 0 };
  var emptyLyric = {
    source: "", title: "", author: "", duration: 0,
    hasLyric: false, hasTranslatedLyric: false, hasKaraokeLyric: false,
    lrc: "", translatedLyric: "", karaokeLyric: ""
  };
  var settings = { webApi: false, fileOutput: false };
  var latestSnapshot = null;
  var latestLyric = emptyLyric;
  var lyricSongId = null;
  var lyricRequested = false;
  var lyricVersion = 0;

  function copySettings(value) {
    value = value || {};
    return { webApi: value.webApi === true, fileOutput: value.fileOutput === true };
  }
  function activePlayback(snapshot) {
    var playback = snapshot && snapshot.playback;
    return !!(snapshot && snapshot.song && playback &&
      ["loading", "playing", "paused", "ended"].includes(playback.status));
  }
  function durationSeconds(song, playback) {
    var duration = Number(playback && playback.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = Number(song && (song.dt !== undefined ? song.dt : song.duration));
      if (duration > 10000) duration /= 1000;
    }
    return Math.max(0, Math.round(Number.isFinite(duration) ? duration : 0));
  }
  function artists(song) {
    if (namespace._presentation) return namespace._presentation.artists(song);
    var values = song && (song.ar || song.artists) || [];
    return values.map(function (artist) { return artist && artist.name || ""; })
      .filter(Boolean).join(" / ") || "未知艺人";
  }
  function album(song) {
    if (namespace._presentation) return namespace._presentation.album(song);
    return song && (song.al || song.album) || {};
  }
  function cover(song) {
    try {
      if (namespace._localMusic && namespace._localMusic.isLocal(song))
        return namespace._localMusic.getArtwork(song) || "";
    } catch (_) {}
    var value = album(song);
    return value && (value.picUrl || value.pic || value.cover) || song && song.cover || "";
  }
  function formatTime(seconds) {
    if (namespace._presentation) return namespace._presentation.time(seconds);
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function trackFor(snapshot, active) {
    if (!active) return Object.assign({}, emptyTrack);
    var song = snapshot.song, playback = snapshot.playback || {};
    var duration = durationSeconds(song, playback);
    return {
      author: artists(song),
      title: String(song.name || song.title || ""),
      album: String(album(song).name || ""),
      cover: cover(song),
      duration: duration,
      durationHuman: formatTime(duration),
      url: typeof song.url === "string" ? song.url : "",
      id: String(song.id),
      isVideo: !!(song.mv || song.mvid),
      isAdvertisement: !!song.advertisement,
      inLibrary: !!song.inLibrary
    };
  }
  function playerFor(snapshot, active, track) {
    var playback = snapshot && snapshot.playback || {};
    var current = Math.max(0, Number(playback.current) || 0);
    var duration = Math.max(0, Number(track.duration) || Number(playback.duration) || 0);
    var percent = duration ? Math.max(0, Math.min(1, current / duration)) : 0;
    var volume = Math.max(0, Math.min(1, Number(playback.volume) || 0));
    return {
      hasSong: !!active,
      isPaused: !active || playback.status !== "playing",
      volumePercent: Math.round(volume * 10000) / 100,
      seekbarCurrentPosition: Math.floor(current),
      seekbarCurrentPositionHuman: formatTime(current),
      statePercent: Math.round(percent * 10000) / 10000,
      likeStatus: snapshot && snapshot.song && snapshot.song.liked === true ? "LIKED" : "INDIFFERENT",
      repeatType: snapshot && snapshot.repeatOne ? "ONE" : "NONE"
    };
  }
  function progressFor(snapshot, active) {
    var current = active && snapshot && snapshot.playback ? Number(snapshot.playback.current) : 0;
    return { progress: Math.max(0, Math.round((Number.isFinite(current) ? current : 0) * 1000)) };
  }
  function lyricFor(track, source, values) {
    values = values || {};
    var lrc = String(values.lrc || ""), translated = String(values.translatedLyric || ""), karaoke = String(values.karaokeLyric || "");
    return {
      source: source || "",
      title: track.title,
      author: track.author,
      duration: track.duration,
      hasLyric: !!lrc,
      hasTranslatedLyric: !!translated,
      hasKaraokeLyric: !!karaoke,
      lrc: lrc, translatedLyric: translated, karaokeLyric: karaoke
    };
  }
  function linesToLrc(value) {
    if (!value || !Array.isArray(value.lines)) return "";
    return value.lines.map(function (line) {
      var text = String(line && line.text || "");
      if (line && Number.isFinite(line.time)) {
        var minutes = Math.floor(line.time / 60);
        var seconds = Math.max(0, line.time - minutes * 60);
        return "[" + String(minutes).padStart(2, "0") + ":" + seconds.toFixed(2).padStart(5, "0") + "]" + text;
      }
      return text;
    }).filter(Boolean).join("\n");
  }
  function requestLyrics(song, track, version) {
    var job;
    try {
      if (namespace._localMusic && namespace._localMusic.isLocal(song)) {
        job = namespace._localMusic.getLyrics(song).then(function (value) {
          return lyricFor(track, "local", { lrc: linesToLrc(value) });
        });
      } else if (namespace._transport && namespace._transport.request) {
        job = namespace._transport.request("/api/song/lyric/v1", {
          id: String(song.id), lv: -1, tv: -1, rv: -1, yv: -1
        }).then(function (response) {
          return lyricFor(track, "netease", {
            lrc: response && response.lrc && response.lrc.lyric,
            translatedLyric: response && response.tlyric && response.tlyric.lyric,
            karaokeLyric: response && response.yrc && response.yrc.lyric
          });
        });
      }
    } catch (_) { job = null; }
    if (!job) return;
    Promise.resolve(job).then(function (value) {
      if (version !== lyricVersion || !latestSnapshot || !activePlayback(latestSnapshot) ||
          String(latestSnapshot.song.id) !== String(song.id)) return;
      latestLyric = value;
      publish(latestSnapshot);
    }).catch(function (error) {
      if (version !== lyricVersion || !latestSnapshot || !activePlayback(latestSnapshot) ||
          String(latestSnapshot.song.id) !== String(song.id)) return;
      latestLyric = lyricFor(track, namespace._localMusic && namespace._localMusic.isLocal(song) ? "local" : "netease");
      if (namespace.log) namespace.log("Now-playing lyric: " + error.message);
      publish(latestSnapshot);
    });
  }
  function publish(snapshot) {
    latestSnapshot = snapshot || null;
    var active = activePlayback(latestSnapshot);
    var track = trackFor(latestSnapshot, active);
    var player = playerFor(latestSnapshot, active, track);
    var progress = progressFor(latestSnapshot, active);
    var id = active ? String(latestSnapshot.song.id) : null;
    if (id !== lyricSongId) {
      lyricSongId = id;
      lyricRequested = false;
      ++lyricVersion;
      latestLyric = active ? lyricFor(track, namespace._localMusic && namespace._localMusic.isLocal(latestSnapshot.song) ? "local" : "netease") : emptyLyric;
    }
    if (active && settings.webApi && id && !lyricRequested) {
      lyricRequested = true;
      requestLyrics(latestSnapshot.song, track, lyricVersion);
    }
    if (!settings.webApi && !settings.fileOutput) return;
    if (typeof namespace.publishNowPlaying !== "function") return;
    try {
      namespace.publishNowPlaying(
        JSON.stringify({ player: player, track: track }),
        JSON.stringify(player), JSON.stringify(track), JSON.stringify(progress),
        JSON.stringify(latestLyric), JSON.stringify(player)
      );
    } catch (error) {
      if (namespace.log) namespace.log("Now-playing native bridge: " + error.message);
    }
  }
  function clear() {
    latestSnapshot = null;
    latestLyric = emptyLyric;
    lyricSongId = null;
    lyricRequested = false;
    ++lyricVersion;
    if (typeof namespace.publishNowPlaying !== "function") return;
    try {
      namespace.publishNowPlaying(JSON.stringify({ player: emptyPlayer, track: emptyTrack }),
        JSON.stringify(emptyPlayer), JSON.stringify(emptyTrack), JSON.stringify(emptyProgress),
        JSON.stringify(emptyLyric), JSON.stringify(emptyPlayer));
    } catch (error) {
      if (namespace.log) namespace.log("Now-playing native bridge: " + error.message);
    }
  }
  function configure(value) {
    settings = copySettings(value);
    if (typeof namespace.configureNowPlayingService === "function") {
      try { namespace.configureNowPlayingService(settings.webApi, settings.fileOutput); }
      catch (error) { if (namespace.log) namespace.log("Now-playing service: " + error.message); }
    }
    if (latestSnapshot) publish(latestSnapshot);
    return Object.assign({}, settings);
  }
  var api = Object.freeze({
    configure: configure,
    publish: publish,
    clear: clear,
    getSettings: function () { return Object.assign({}, settings); },
    getState: function () { return { settings: Object.assign({}, settings), snapshot: latestSnapshot, lyric: latestLyric }; }
  });
  Object.defineProperty(namespace, "_nowPlaying", { value: api });
  try { configure(namespace._settings && namespace._settings.nowPlaying ? namespace._settings.nowPlaying() : {}); }
  catch (_) {}
})(globalThis);
