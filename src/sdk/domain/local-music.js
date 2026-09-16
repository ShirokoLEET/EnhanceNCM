(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM, bridge = namespace._native, sequence = 0;
  function path(value) {
    if (typeof value !== "string" || value.length > 32767 || /[\0\r\n]/.test(value)) throw new TypeError("Invalid local music path");
    value = value.trim().replace(/^"(.*)"$/, "$1");
    if (/^file:\/\//i.test(value)) {
      var url = new URL(value);
      value = decodeURIComponent(url.pathname);
      value = url.hostname && url.hostname !== "localhost" ? "\\\\" + url.hostname + value : value.replace(/^\/([a-z]:)/i, "$1");
    }
    value = value.replace(/\//g, "\\");
    if (!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+\\)/i.test(value) || /[<>|?*]/.test(value) || !/\.(mp3|flac|wav|wave|m4a|aac|ogg|opus|ape|wma|aif|aiff|dsf|dff|ncm)$/i.test(value))
      throw new TypeError("Unsupported local music path");
    return value;
  }
  function key(value) { return "local:" + encodeURIComponent(path(value).toLowerCase()); }
  function isLocal(song) {
    try { return !!song && song.id === key(song.localPath); } catch (_) { return false; }
  }
  function create(value, info) {
    value = path(value); info = info || {};
    return { id: key(value), localPath: value, name: String(info.title || value.split("\\").pop().replace(/\.[^.]+$/, "")),
      ar: [{ name: String(info.artist || "本地音乐") }], al: { name: String(info.album || "本地文件") },
      dt: Math.max(0, Number(info.duration) || 0), bitrate: Math.max(0, Number(info.bitrate) || 0) };
  }
  function bounded(job, ms) {
    var timer;
    return Promise.race([job, new Promise(function (_, reject) { timer = root.setTimeout(function () {
      var error = new Error("Local music request timed out"); error.code = "TIMEOUT"; reject(error);
    }, ms); })]).finally(function () { root.clearTimeout(timer); });
  }
  async function exists(value) {
    value = path(value);
    var result = await bounded(bridge.callArgs("os.isFileExist", [value]), 5000);
    if (Array.isArray(result)) result = result[0];
    if (!result) { var error = new Error("本地音乐文件不存在或已移动"); error.code = "LOCAL_FILE_MISSING"; throw error; }
    return value;
  }
  async function read(value) {
    value = await exists(value);
    var request = "enhancencm-local-" + Date.now() + "-" + (++sequence), release;
    var job = new Promise(function (resolve, reject) {
      release = bridge.subscribe("musiclibrary.onreadmusicinfo", function (id, filename, code, info) {
        if (id !== request || filename !== value) return;
        if (code !== 0) return reject(new Error("Local metadata unavailable"));
        try { resolve(typeof info === "string" ? JSON.parse(info) : info); } catch (error) { reject(error); }
      });
      bridge.callArgs("musiclibrary.readMusicInfo", [request, value, false]).catch(reject);
    });
    try { return create(value, await bounded(job, 5000)); }
    catch (_) { return create(value); }
    finally { if (release) release(); }
  }
  function paths(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) value = value.paths || value.path || [];
    if (typeof value === "string") {
      try { var parsed = JSON.parse(value); if (Array.isArray(parsed)) value = parsed; } catch (_) {}
    }
    if (!Array.isArray(value)) value = typeof value === "string" ? value.split(/\r?\n/).filter(Boolean) : [];
    var unique = new Map();
    value.slice(0, 1000).forEach(function (item) { try { var normalized = path(item); unique.set(key(normalized), normalized); } catch (_) {} });
    return Array.from(unique.values());
  }
  function resourceUrl(kind, value) {
    var filename = path(typeof value === "string" ? value : value.localPath);
    return "orpheus://localmusic/" + kind + "?" + encodeURI(filename).replace(/#/g, "%23");
  }
  async function readSidecar(filename) {
    var request = "enhancencm-lyric-" + (++sequence), release;
    var job = new Promise(function (resolve, reject) {
      release = bridge.subscribe("storage.onreadfromfiledone", function (id, code, text) {
        if (id !== request) return;
        if (code !== 0) reject(new Error("本地歌词读取失败")); else resolve(String(text || ""));
      });
      bridge.callArgs("storage.readfromfile", [request, filename, true, "abs"]).catch(reject);
    });
    try { return await bounded(job, 5000); } finally { if (release) release(); }
  }
  async function getLyrics(song) {
    if (!isLocal(song)) throw new TypeError("A local song is required");
    var text;
    try {
      text = await bounded(root.fetch(resourceUrl("lyric", song)).then(function (response) {
        if (!response.ok) throw new Error("Local lyric unavailable");
        return response.text();
      }), 5000);
    } catch (error) {
      // The original client uses this Native read for a same-name downloaded LRC.
      var sidecar = song.localPath.replace(/\.[^\\.]+$/, ".lrc");
      var found = await bounded(bridge.callArgs("os.isFileExist", [sidecar]), 3000);
      if (Array.isArray(found)) found = found[0];
      if (!found) return { lines: [], synced: false };
      text = await readSidecar(sidecar);
    }
    if (text.length > 2 * 1024 * 1024) throw new Error("本地歌词文件过大");
    return namespace._lyrics.parse({ lrc: { lyric: text.replace(/^\uFEFF/, "") } });
  }
  function prepareSystemArtwork(image) {
    if (typeof namespace.cacheLocalArtwork !== "function") throw new Error("请更新 EnhanceNCM DLL 以同步本地封面");
    if (!image || !image.naturalWidth || !image.naturalHeight) throw new Error("本地封面尚未加载");
    var canvas = root.document.createElement("canvas");
    var scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    var url = namespace.cacheLocalArtwork(canvas.toDataURL("image/png"));
    if (!/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}\/[a-f0-9]{64}\.png$/.test(url)) throw new Error("Invalid artwork cache URL");
    return url;
  }
  function subscribeOpen(listener) {
    var releases = [bridge.subscribe("ipc.onipcmessagerecived", function (id, payload) { if (Number(id) === 2) listener(paths(payload)); }),
      bridge.subscribe("app.onplaylocalmusic", function (payload) { listener(paths(payload)); })];
    return function () { releases.forEach(function (release) { release(); }); };
  }
  namespace._localMusic = Object.freeze({ normalizePath: path, isLocal: isLocal, create: create, read: read, exists: exists, paths: paths,
    prepareSystemArtwork: prepareSystemArtwork, getArtwork: function (song) { return isLocal(song) ? resourceUrl("pic", song) : ""; }, getLyrics: getLyrics,
    subscribeOpen: subscribeOpen, getStartupPaths: function () {
      return bounded(bridge.callArgs("app.getDefaultMusicPlayPath", []), 3000).then(paths);
    } });
})(globalThis);
