(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM, active = null, startupConsumed = false;
  function attach() {
    if (active) return active;
    var sdk = namespace.sdk, disposed = false, ready = false, pending = [], version = 0;
    var recentKey = "", recentAt = 0, statusNode = null;
    function report(message) {
      if (disposed) return;
      if (!statusNode) {
        statusNode = root.document.createElement("div"); statusNode.setAttribute("role", "alert");
        statusNode.style.cssText = "position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#292929;color:#fff;padding:12px 18px;border-radius:8px;max-width:80vw;font:14px sans-serif;cursor:pointer";
        statusNode.onclick = function () { statusNode.remove(); statusNode = null; };
        root.document.body.appendChild(statusNode);
      }
      statusNode.textContent = message;
    }
    async function open(paths) {
      paths = sdk.localMusic.paths(paths);
      if (!paths.length || disposed) return;
      if (!ready) { pending = pending.concat(paths); return; }
      var signature = paths.join("\n"), now = Date.now();
      if (signature === recentKey && now - recentAt < 700) return;
      recentKey = signature; recentAt = now;
      var player = sdk.player.getActiveSession();
      if (!player) { report("当前主题没有可用播放器，无法打开本地音乐。"); return; }
      var current = ++version, revision = player.getRevision(), songs = [], failed = 0;
      for (var i = 0; i < paths.length; i++) {
        try { songs.push(await sdk.localMusic.read(paths[i])); } catch (_) { failed++; }
        if (disposed || current !== version || player !== sdk.player.getActiveSession() || revision !== player.getRevision()) return;
      }
      if (!songs.length) { report("无法读取本地音乐，请检查文件是否存在及格式是否受支持。"); return; }
      try {
        await player.play(songs[0], { queue: player.getState().queue.concat(songs), source: "local" });
        if (disposed || current !== version) return;
        root.dispatchEvent(new root.CustomEvent("enhancencm:localmusic"));
        if (failed) report("已打开 " + songs.length + " 首本地音乐，" + failed + " 个文件读取失败。");
        else if (statusNode) { statusNode.remove(); statusNode = null; }
      } catch (error) { if (!disposed && current === version && error.code !== "CANCELLED") report("本地音乐播放失败，请检查文件格式或是否已移动。"); }
    }
    var release = sdk.localMusic.subscribeOpen(open);
    function drag(event) {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).some(function (type) { return type === "Files" || type === "text/uri-list"; })) {
        event.preventDefault(); event.dataTransfer.dropEffect = "copy";
      }
    }
    function drop(event) {
      var data = event.dataTransfer;
      if (!data) return;
      var files = Array.from(data.files || []), paths = files.map(function (file) { return file.path; }).filter(Boolean);
      var uris = data.getData("text/uri-list");
      if (uris) paths = paths.concat(uris.split(/\r?\n/).filter(function (value) { return /^file:\/\//i.test(value); }));
      if (!files.length && !paths.length) return;
      event.preventDefault(); event.stopPropagation();
      paths = sdk.localMusic.paths(paths);
      if (!paths.length) { report("未获得可播放的本地文件路径，请使用“打开方式 → 网易云音乐”。"); return; }
      open(paths);
    }
    root.document.addEventListener("dragover", drag, true);
    root.document.addEventListener("drop", drop, true);
    function dispose() {
      if (disposed) return;
      disposed = true; ++version; release(); pending = [];
      root.document.removeEventListener("dragover", drag, true); root.document.removeEventListener("drop", drop, true);
      root.removeEventListener("pagehide", dispose);
      if (statusNode) statusNode.remove(); active = null;
    }
    root.addEventListener("pagehide", dispose);
    active = { dispose: dispose, activate: async function () {
      ready = true;
      if (pending.length) { var files = pending; pending = []; startupConsumed = true; await open(files); return; }
      if (startupConsumed) return;
      startupConsumed = true;
      try {
        var startVersion = version, files = await sdk.localMusic.getStartupPaths();
        if (!disposed && version === startVersion) await open(files);
      } catch (_) { /* No startup file must not prevent theme startup. */ }
    } };
    return active;
  }
  namespace._localFiles = Object.freeze({ attach: attach, dispose: function () { if (active) active.dispose(); } });
})(globalThis);
