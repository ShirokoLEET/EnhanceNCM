(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  var stateKey = "enhancencm.trayMenu.state.v1";
  var actionKey = "enhancencm.trayMenu.action.v1";
  var readyKey = "enhancencm.trayMenu.ready.v1";
  var currentFallback = null;

  function paint(host, state, onAction, popup) {
    var shadow = host.attachShadow({ mode: "open" });
    host.style.cssText = popup ? "display:block;width:100%;height:100%;" :
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    shadow.innerHTML = `<style>
      :host { font:13px/1.35 "Segoe UI",sans-serif; color:#e8e8ed; }
      * { box-sizing:border-box; }
      #panel { display:flex; flex-direction:column;
        position:${popup ? "relative" : "absolute"};
        right:${popup ? "auto" : "8px"}; bottom:${popup ? "auto" : "8px"};
        width:212px; height:132px; padding:0 12px; pointer-events:auto;
        border:1px solid #3b3b44; border-radius:9px; background:#2b2b35;
        box-shadow:0 8px 22px rgba(0,0,0,.28); }
      #song-title { height:41px; flex:none; overflow:hidden; white-space:nowrap;
        text-overflow:ellipsis; line-height:40px; text-align:center; color:#bfc0c9;
        user-select:none; -webkit-user-select:none; }
      #controls { display:flex; align-items:center; gap:4px; height:48px; flex:none;
        border-top:1px solid #41414b; border-bottom:1px solid #41414b; }
      button { border:0; color:inherit; background:transparent; font:inherit; cursor:pointer; }
      button:hover,button:focus-visible { outline:none; background:#41424d; }
      button:active { background:#50515d; }
      button:disabled { opacity:.4; cursor:default; }
      #controls button { display:grid; place-items:center; flex:1; height:34px;
        padding:0; border-radius:6px; font:20px/1 "Segoe UI Symbol","Segoe UI",sans-serif; }
      #toggle { background:#3d3e49; }
      #like[aria-pressed="true"] { color:#d54860; }
      #exit { display:flex; align-items:center; gap:12px; flex:1; width:100%;
        padding:0 5px; border-radius:5px; text-align:left; }
      #exit span { color:#aeb0bd; font:17px/1 "Segoe UI Symbol","Segoe UI",sans-serif; }
    </style>
    <section id="panel" role="menu" aria-label="播放控制">
      <div id="song-title"></div>
      <div id="controls">
        <button role="menuitem" data-action="previous" aria-label="上一首" title="上一首">⏮︎</button>
        <button id="toggle" role="menuitem" data-action="toggle"></button>
        <button role="menuitem" data-action="next" aria-label="下一首" title="下一首">⏭︎</button>
        <button id="like" role="menuitem" data-action="like" title="喜欢当前歌曲">♥︎</button>
      </div>
      <button id="exit" role="menuitem" data-action="exit"><span aria-hidden="true">⏻</span>退出</button>
    </section>`;
    shadow.getElementById("song-title").textContent = state.title || "网易云音乐";
    shadow.getElementById("song-title").title = state.title || "网易云音乐";
    shadow.getElementById("toggle").textContent = state.playing ? "⏸︎" : "▶︎";
    shadow.getElementById("toggle").setAttribute("aria-label", state.playing ? "暂停" : "播放");
    shadow.getElementById("toggle").title = state.playing ? "暂停" : "播放";
    shadow.getElementById("like").disabled = !state.canLike;
    shadow.getElementById("like").setAttribute("aria-pressed", String(!!state.liked));
    shadow.getElementById("like").setAttribute("aria-label", state.liked ? "取消喜欢当前歌曲" : "喜欢当前歌曲");
    shadow.getElementById("like").title = state.liked ? "取消喜欢当前歌曲" : "喜欢当前歌曲";
    shadow.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action]");
      if (button) onAction(button.dataset.action);
    });
    shadow.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); onAction("dismiss"); }
    });
    shadow.getElementById("toggle").focus();
  }

  function showFallback(onAction, state) {
    if (currentFallback) currentFallback();
    var host = root.document.createElement("div");
    root.document.body.appendChild(host);
    function close() {
      root.document.removeEventListener("pointerdown", outside, true);
      host.remove();
      if (currentFallback === close) currentFallback = null;
    }
    function outside(event) { if (!event.composedPath().includes(host)) close(); }
    paint(host, state, function (action) { close(); if (action !== "dismiss") onAction(action); }, false);
    root.document.addEventListener("pointerdown", outside, true);
    currentFallback = close;
    return close;
  }

  function start() {
    if (!namespace._trayMenuToken || !root.document.body) return;
    var token = namespace._trayMenuToken, state;
    try { state = JSON.parse(root.localStorage.getItem(stateKey)); } catch (_) {}
    if (!state || state.token !== token) { root.close(); return; }
    root.document.body.style.cssText = "margin:0;background:#2b2b35;overflow:hidden;";
    var host = root.document.createElement("div");
    root.document.body.appendChild(host);
    var closing = false;
    function close() {
      if (closing) return;
      closing = true;
      // window.close() is ignored for some CEF-created windows; destroy this
      // popup through the same Native command the original sub-apps use.
      namespace._native.callArgs("winhelper.destroyWindow", []).catch(function () { root.close(); });
      root.setTimeout(function () {
        namespace._native.callArgs("winhelper.showWindow", ["hide"]).catch(function () {});
      }, 150);
    }
    paint(host, state, function (action) {
      if (action !== "dismiss") try {
        root.localStorage.setItem(actionKey, JSON.stringify({ token: token, action: action, time: Date.now() }));
      } catch (_) {}
      close();
    }, true);
    root.addEventListener("storage", function (event) {
      if (event.key === stateKey && event.newValue) try {
        if (JSON.parse(event.newValue).token !== token) close();
      } catch (_) {}
    });
    var bounds = state.bounds;
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) ||
        !Number.isFinite(bounds.factor) || bounds.width <= 0 || bounds.height <= 0 || bounds.factor <= 0) {
      close(); return;
    }
    var size = { x: bounds.width, y: bounds.height };
    namespace._native.callArgs("winhelper.setWindowSizeLimit", [size, size])
      .then(function () { return namespace._native.callArgs("winhelper.setWindowPosition", [bounds]); })
      .then(function () { return new Promise(function (resolve) { root.setTimeout(resolve, 40); }); })
      .then(function () {
        if (closing) return;
        // A Native size clamp would leave a large blank rectangle. Keep it
        // hidden and let the main window's existing fallback handle that case.
        if (root.innerWidth > bounds.width / bounds.factor + 2 ||
            root.innerHeight > bounds.height / bounds.factor + 2)
          throw new Error("Tray window exceeded its requested size");
        return namespace._native.callArgs("winhelper.showWindow", ["show"]);
      }).then(function () {
        if (closing) return;
        root.addEventListener("blur", close, { once: true });
        try { root.localStorage.setItem(readyKey, token); } catch (_) {}
      }).catch(close);
  }

  namespace._trayMenuUi = Object.freeze({ showFallback: showFallback });
  namespace._startTrayMenu = start;
})(globalThis);
