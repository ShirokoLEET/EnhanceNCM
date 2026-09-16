(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM || (root.EnhanceNCM = {});
  var originalUrl = "orpheus://orpheus/pub/app.html";
  var href = root.location && root.location.href;
  if (!href || !(href === originalUrl || href.startsWith(originalUrl + "#") ||
      href.startsWith(originalUrl + "?"))) return;
  var trayToken = new URL(href).searchParams.get("enhancencm-tray");
  if (trayToken) {
    if (!root.document || root.document.readyState !== "loading" || root.document.documentElement) return;
    namespace._trayMenuToken = trayToken;
    root.stop();
    root.setTimeout(function () {
      root.document.open();
      root.document.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>EnhanceNCM 托盘</title></head><body></body></html>');
      root.document.close();
      namespace._startTrayMenu();
    }, 0);
    return;
  }
  // Runs at CEF context creation, before the original HTML parser and bundles.
  // Keep the native main-frame URL, replacing only its frontend document.
  if (!root.document || root.document.readyState !== "loading" || root.document.documentElement ||
      typeof root.document.open !== "function" || typeof root.stop !== "function") return;
  var key = "enhancencm.settings.v1", pendingKey = "enhancencm.restorePending.v1";
  var watchdog;
  function recover(error) {
    root.clearTimeout(watchdog);
    if (namespace.log) namespace.log("Direct entry recovery: " + error.message);
    try {
      settings.mode = "original";
      root.localStorage.setItem(key, JSON.stringify(settings));
      root.localStorage.removeItem(pendingKey);
    } catch (_) {}
    root.location.reload();
  }
  try {
    var settings;
    try { settings = JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) {}
    if (!settings || !["original", "enhanced"].includes(settings.mode))
      settings = { version: 1, mode: root.localStorage.getItem("enhancencm.displayMode.v1") || "original", themeId: "spotify" };
    if (settings.mode !== "enhanced") return;
    if (root.localStorage.getItem(pendingKey) === "1") {
      settings.mode = "original";
      root.localStorage.setItem(key, JSON.stringify(settings));
      root.localStorage.removeItem(pendingKey);
      return;
    }
    var storage = namespace._startup.read();
    // Upgrade once through the original entry if its configured paths have
    // never been observed. Subsequent starts use the captured configuration.
    if (!storage) return;
    // Do not interrupt the original parser unless crash recovery can be saved.
    root.localStorage.setItem(pendingKey, "1");
    namespace._entry = Object.freeze({ active: true, storage: Object.freeze(storage), recover: recover,
      confirm: function () { root.clearTimeout(watchdog); } });
    root.stop();
    watchdog = root.setTimeout(function () { recover(new Error("Startup timed out")); }, 15000);
    // The native context-created callback must return before replacing its
    // provisional document. Otherwise CEF resets the body after we mount it.
    root.setTimeout(function () {
      try {
        root.document.open();
        root.document.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>EnhanceNCM</title></head><body style="margin:0;background:#000"></body></html>');
        root.document.close();
        namespace._startMusic();
        if (namespace.log) namespace.log("Direct entry: original frontend replaced before parsing");
      } catch (error) { recover(error); }
    }, 0);
  } catch (error) {
    if (namespace._entry) recover(error);
    else if (namespace.log) namespace.log("Direct entry skipped: " + error.message);
  } finally {
    if (!namespace._entry) namespace._startup.observeOriginal();
  }
})(globalThis);
