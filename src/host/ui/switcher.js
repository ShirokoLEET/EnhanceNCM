(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM;
  if (namespace.ui) return;
  var storageKey = "enhancencm.settings.v1";
  var legacyKey = "enhancencm.displayMode.v1";
  var pendingKey = "enhancencm.restorePending.v1";
  var standaloneUrl = "about:blank#enhancencm";
  var originalUrl = "orpheus://orpheus/pub/app.html";
  function isStandalone() { return !!(namespace._entry && namespace._entry.active) || !!(root.location && root.location.href === standaloneUrl); }
  function isOriginalEntry() { return !!(root.location &&
    (root.location.href === originalUrl || root.location.href.startsWith(originalUrl + "#") ||
      root.location.href.startsWith(originalUrl + "?"))); }
  function stored(key) { try { return root.localStorage.getItem(key); } catch (_) { return null; } }
  function readSettings() {
    var saved = null;
    try { saved = JSON.parse(stored(storageKey) || "null"); } catch (_) {}
    var legacy = stored(legacyKey);
    return {
      version: 1,
      mode: saved && ["original", "enhanced"].includes(saved.mode) ? saved.mode
        : ["original", "enhanced"].includes(legacy) ? legacy : "original",
      themeId: saved && typeof saved.themeId === "string" && !/[\\/\x00-\x1f]/.test(saved.themeId) && saved.themeId.length > 0 && saved.themeId.length <= 255
        ? saved.themeId : "spotify"
    };
  }
  var settings = readSettings();
  function writeSettings() {
    try {
      var saved = JSON.parse(stored(storageKey) || "null") || {};
      root.localStorage.setItem(storageKey, JSON.stringify(Object.assign(saved, settings)));
      return true;
    } catch (_) { return false; }
  }
  function pending(value) {
    try {
      if (value) root.localStorage.setItem(pendingKey, "1");
      else root.localStorage.removeItem(pendingKey);
    } catch (_) {}
  }
  var mode = isStandalone() ? "enhanced" : "original";
  var settingsOpen = false;
  var started = false;
  var surface = null;
  var trigger = null;
  var choices = [];

  function update() {
    if (!surface) return;
    var view = settingsOpen ? "settings" : "hidden";
    surface.hidden = view === "hidden";
    surface.dataset.view = view;
    trigger.setAttribute("aria-expanded", String(settingsOpen));
    trigger.setAttribute("title", settingsOpen ? "关闭 EnhanceNCM 设置" : "打开 EnhanceNCM 设置");
    choices.forEach(function (choice) {
      choice.setAttribute("aria-checked", String(choice.dataset.mode === mode && (mode === "original" || choice.dataset.themeId === settings.themeId)));
    });

  }

  function setMode(next) {
    if (next !== "original" && next !== "enhanced")
      throw new TypeError("mode must be original or enhanced");
    mode = next;
    settings.mode = next;
    settingsOpen = false;
    writeSettings();
    pending(next === "enhanced" && !isStandalone());
    update();
    if (root.location && typeof root.location.assign === "function") {
      if (next === "enhanced" && !isStandalone()) root.location.assign(standaloneUrl);
      if (next === "original" && isStandalone()) {
        if (namespace._entry && namespace._entry.active) root.location.reload();
        else root.location.assign(originalUrl);
      }
    }
  }

  function openSettings() { settingsOpen = true; update(); }
  function closeSettings() { settingsOpen = false; update(); }
  function confirmEnhanced() {
    if (!isStandalone()) return;
    mode = settings.mode = "enhanced";
    writeSettings(); pending(false);
    if (namespace._entry && namespace._entry.active) namespace._entry.confirm();
  }

  function render(options) {
    var shadow = options.root;
    shadow.host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    shadow.innerHTML = `
      <style>
        :host { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color-scheme: dark; --ink: #f2f2f2; --muted: #b7b7b7;
          --line: #353538; --panel: #202023;
          --side: #1b1b1e; --tile: #28282c;
          --selected: #353539; }
        :host([data-client-theme="light"]) { color-scheme: light;
          --ink: #242424; --muted: #626262; --line: #e5e5e5;
          --panel: #ffffff; --side: #f7f7f7;
          --tile: #fafafa; --selected: #eeeeee; }
        * { box-sizing: border-box; }
        button { font: inherit; cursor: pointer; }
        #e-button { position: fixed; width: 28px; height: 28px; z-index: 2;
          display:grid; place-items:center; padding:0; border:0; border-radius:0;
          background:none; color:var(--toolbar-ink, var(--muted)); font-size:18px;
          font-weight:500; line-height:1; box-shadow:none; pointer-events:auto;
          -webkit-app-region:no-drag; user-select:none; }
        #e-button:hover, #e-button[aria-expanded="true"] { color:var(--ink); }
        #surface { position: fixed; inset: 64px 0 82px; z-index: 1; overflow: auto;
          background: var(--panel); color: var(--ink); pointer-events: auto;
          box-shadow: 0 -8px 32px rgba(0,0,0,.12); }
        #surface[hidden] { display: none; }
        .settings { display: grid; grid-template-columns: 196px minmax(0,1fr); min-height: 100%; }
        .side { padding: 34px 20px; background: var(--side); border-right: 1px solid var(--line); }
        .brand { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; }
        .mark { display: inline-grid; place-items: center; width: 30px; height: 30px;
          border:0; background:none; color:var(--ink); font-weight:500; }
        .side-label { margin: 45px 0 9px; padding-left: 12px; color: var(--muted); font-size: 12px; }
        .side-item { padding: 10px 12px; border-radius: 9px; background: var(--selected); color: var(--ink); }
        .content { max-width: 850px; padding: 42px clamp(28px,5vw,72px) 72px; }
        .eyebrow { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .13em; }
        h1 { margin: 8px 0 8px; font-size: 29px; line-height: 1.25; }
        .muted { color: var(--muted); margin: 0 0 32px; }
        h2 { margin: 0 0 12px; font-size: 17px; }
        .options { display: grid; gap: 12px; max-width: 650px; }
        .option { display: flex; align-items: center; gap: 15px; width: 100%; padding: 17px 19px;
          text-align: left; background: var(--tile); color: var(--ink);
          border: 1px solid var(--line); border-radius: 11px; }
        .option:hover { background: var(--selected); }
        .option[aria-checked="true"] { background: var(--selected); border-color: var(--ink); }
        .radio { display: inline-grid; place-items: center; flex: 0 0 19px; width: 19px; height: 19px;
          border: 2px solid var(--muted); border-radius: 50%; }
        .option[aria-checked="true"] .radio { border-color: var(--ink); }
        .option[aria-checked="true"] .radio::after { content: ""; width: 9px; height: 9px;
          border-radius: 50%; background: var(--ink); }
        .option strong { display: block; font-size: 15px; }
        .option small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; }
        .note { max-width: 650px; margin-top: 25px; padding: 14px 17px; border-radius: 10px;
          background: var(--tile); color: var(--muted); font-size: 12px; }
        #theme-refresh { margin-top:16px; padding:8px 12px; border:1px solid var(--line);
          border-radius:8px; background:var(--tile); color:var(--ink); }
        #theme-refresh:hover { background:var(--selected); }
        .option:disabled { opacity:.5; cursor:not-allowed; }
        .close { position: absolute; top: 30px; right: 36px; width: 34px; height: 34px;
          border:0; border-radius:0; background:none;
          color: var(--ink); font-size: 21px; }
        .close:hover { background: var(--selected); }
        button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
        button:active { transform: scale(.97); }
        @media (max-width: 700px) { .settings { grid-template-columns: 1fr; }
          .side { padding: 15px 24px; } .side-label, .side-item { display: none; }
          .content { padding-top: 28px; } }
        @media(prefers-reduced-motion:reduce) { button:active { transform:none; } }
      </style>
      <button id="e-button" type="button" aria-label="EnhanceNCM 设置" aria-expanded="false">E</button>
      <main id="surface" hidden>
        <section class="settings" aria-label="EnhanceNCM 设置">
          <aside class="side"><div class="brand"><span class="mark">E</span>EnhanceNCM</div>
            <div class="side-label">设置</div><div class="side-item">显示界面</div></aside>
          <div class="content"><span class="eyebrow">PREFERENCES</span><h1>显示界面</h1>
            <p class="muted">选择正在显示的界面，随时可以通过右上角 E 返回这里。</p>
            <h2>界面模式</h2><div id="interface-options" class="options" role="radiogroup" aria-label="界面模式">
              <button class="option" type="button" role="radio" data-mode="original" aria-checked="false">
                <span class="radio"></span><span><strong>网易云原版界面</strong><small>继续使用当前的完整桌面界面。</small></span></button>
            </div>
            <button id="theme-refresh" type="button">重新扫描主题（刷新页面）</button>
            <p id="theme-status" role="status" aria-live="polite"></p>
            <div class="note">切换界面会刷新页面。歌曲、待播列表、播放进度和音量会自动保存，恢复后保持暂停。</div>
          </div><button class="close" type="button" aria-label="关闭设置">×</button>
        </section>
      </main>`;

    trigger = shadow.querySelector("#e-button");
    surface = shadow.querySelector("#surface");
    var themeStatus = shadow.querySelector("#theme-status");
    function themeAction(action) {
      themeStatus.textContent = "正在处理…";
      Promise.resolve().then(action).catch(function (error) { themeStatus.textContent = error.message; });
    }
    if (namespace.themes) {
      var themeList = shadow.querySelector("#interface-options");
      var themes = namespace.themes.list();
      if (!themes.length) themeStatus.textContent = "没有发现主题，请添加主题文件夹后重新扫描。";
      themes.forEach(function (theme) {
        var button = root.document.createElement("button");
        button.type = "button"; button.className = "option";
        button.setAttribute("role", "radio");
        button.dataset.mode = "enhanced";
        button.dataset.themeId = theme.id;
        var radio = root.document.createElement("span"); radio.className = "radio";
        radio.setAttribute("aria-hidden", "true");
        var label = root.document.createElement("span");
        var name = root.document.createElement("strong"); name.textContent = theme.name;
        label.appendChild(name);
        if (theme.error) {
          var error = root.document.createElement("small"); error.textContent = theme.error; label.appendChild(error);
        }
        button.appendChild(radio); button.appendChild(label);
        button.disabled = !!theme.error;
        themeList.appendChild(button);
      });
      shadow.querySelector("#theme-refresh").onclick = function () { themeAction(namespace.themes.refresh); };
    } else shadow.querySelector("#theme-refresh").hidden = true;
    choices = Array.from(shadow.querySelectorAll("[data-mode]"));
    function syncClientTheme() {
      var theme = stored("currentTheme");
      var light = !isStandalone() && (theme === "light" || (!theme && root.matchMedia &&
        root.matchMedia("(prefers-color-scheme: light)").matches));
      shadow.host.dataset.clientTheme = light ? "light" : "dark";
    }
    function positionButton() {
      var account = root.document.querySelector('[data-testid="tid_pc_nav_bar_account"]');
      if (account) {
        var rect = account.getBoundingClientRect();
        if (root.getComputedStyle) shadow.host.style.setProperty("--toolbar-ink", root.getComputedStyle(account).color);
        trigger.style.left = Math.max(12, Math.round(rect.left - 38)) + "px";
        trigger.style.top = Math.round(rect.top + (rect.height - 28) / 2) + "px";
        trigger.style.right = "auto";
      } else {
        trigger.style.left = "auto";
        trigger.style.right = isStandalone() ? "204px" : "180px";
        trigger.style.top = isStandalone() ? "2px" : "22px";
      }
    }
    function toggle(event) { event.stopPropagation(); settingsOpen = !settingsOpen; update(); }
    function stopDrag(event) { event.stopPropagation(); }
    trigger.addEventListener("pointerdown", stopDrag);
    trigger.addEventListener("click", toggle);
    shadow.querySelector(".close").addEventListener("click", closeSettings);
    choices.forEach(function (choice) {
      choice.addEventListener("click", async function () {
        try {
          if (choice.dataset.mode === "enhanced") {
            themeAction(function () { return namespace.themes.select(choice.dataset.themeId); });
            return;
          }
          if (isStandalone()) await namespace.app.unmount();
          setMode(choice.dataset.mode);
        } catch (error) { if (namespace.log) namespace.log(error.message); }
      });
    });
    root.addEventListener("resize", positionButton);
    root.addEventListener("storage", syncClientTheme);
    var timer = root.setInterval(function () { positionButton(); syncClientTheme(); }, 1000);
    positionButton(); syncClientTheme();
    update();
    return function () {
      root.clearInterval(timer);
      root.removeEventListener("resize", positionButton);
      root.removeEventListener("storage", syncClientTheme);
      surface = null;
      trigger = null;
      choices = [];
    };
  }

  function start() {
    if (started || !root.document || isStandalone() || namespace._trayMenuToken) return;
    started = true;
    if (!stored(storageKey)) writeSettings();
    var shouldRestore = isOriginalEntry() && settings.mode === "enhanced";
    if (shouldRestore) {
      if (stored(pendingKey) === "1") {
        // The last automatic switch did not finish mounting. Keep a usable
        // original page until the user explicitly selects the theme again.
        settings.mode = "original"; writeSettings(); pending(false);
        shouldRestore = false;
      }
    }
    namespace.app.mount(render).catch(function (error) {
      started = false;
      if (shouldRestore) { settings.mode = "original"; writeSettings(); pending(false); }
      if (namespace.log) namespace.log("UI mount failed: " + error.message);
    });
  }

  function setThemeId(id) {
    if (typeof id !== "string" || !id || id.length > 255 || /[\\/\x00-\x1f]/.test(id)) throw new TypeError("Invalid theme ID");
    var previous = settings.themeId;
    settings.themeId = id;
    if (!writeSettings()) { settings.themeId = previous; throw new Error("无法保存主题设置，请检查本地存储"); }
  }
  function stop() {
    namespace.app.unmount();
    started = false;
  }

  namespace.ui = Object.freeze({
    start: start, stop: stop, getMode: function () { return mode; },
    getSettings: function () { return Object.freeze({ version: settings.version, mode: settings.mode, themeId: settings.themeId }); },
    setThemeId: setThemeId,
    setMode: setMode, openSettings: openSettings, closeSettings: closeSettings,
    getPlaybackSettings: function () { return namespace._settings.playback(); },
    setPlaybackSettings: function (value) { return namespace._settings.updatePlayback(value); },
    confirmEnhanced: confirmEnhanced
  });
  if (root.document && typeof root.document.addEventListener === "function") {
    if (root.document.readyState === "loading")
      root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(globalThis);
