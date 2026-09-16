(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  var started = false;
  function isStandalone() { return !!(namespace._entry && namespace._entry.active) || !!(root.location && root.location.href === "about:blank#enhancencm"); }
  function start() {
    if (started || !root.document || !isStandalone()) return;
    started = true;
    root.document.title = "EnhanceNCM";
    root.document.body.style.margin = "0";
    root.document.body.style.background = "#000";
    root.document.body.textContent = "";
    var localFiles = namespace._localFiles && namespace.sdk.localMusic ? namespace._localFiles.attach() : null;
    namespace.themes.mountSelected().then(async function () {
      if (namespace._entry && namespace._entry.active) {
        await namespace.app.whenReady();
        await namespace.sdk.window.initialize();
      }
      namespace.ui.confirmEnhanced();
      if (localFiles) localFiles.activate();
    }).catch(function (error) {
      if (localFiles) localFiles.dispose();
      started = false;
      if (namespace._entry && namespace._entry.active) {
        namespace._entry.recover(error);
        return;
      }
      var message = root.document.createElement("p");
      message.textContent = "EnhanceNCM 加载失败：" + error.message;
      var back = root.document.createElement("button");
      back.type = "button";
      back.textContent = "返回网易云原版";
      back.onclick = function () { namespace.ui.setMode("original"); };
      root.document.body.style.cssText = "margin:0;background:#171717;color:#f1f1f1;font:14px/1.6 sans-serif;padding:32px;";
      back.style.cssText = "padding:8px 14px;border:1px solid #777;border-radius:6px;background:transparent;color:inherit;cursor:pointer;";
      root.document.body.replaceChildren(message, back);
    });
  }
  namespace._startMusic = start;
  if (root.document && isStandalone() && !(namespace._entry && namespace._entry.active)) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(globalThis);
