(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  if (namespace.themes) return;
  var catalog = (namespace._themeCatalog || []).slice().sort(function (a, b) {
    return a.id === "spotify" ? -1 : b.id === "spotify" ? 1 : a.name.localeCompare(b.name);
  });
  delete namespace._themeCatalog;
  var loading = null, registered = null, active = null, busy = false;
  function list() {
    return Object.freeze(catalog.map(function (item) {
      return Object.freeze({ id: item.id, name: item.name, error: item.error || null });
    }));
  }
  function register(theme) {
    if (!loading) throw new Error("Themes must register while theme.js is loading");
    if (registered) throw new Error("A theme may register only once");
    if (!theme || typeof theme.mount !== "function") throw new TypeError("theme.mount must be a function");
    registered = Object.freeze({ mount: theme.mount, name: theme.name || loading.name });
  }
  function resolve(id) {
    var item = catalog.find(function (entry) { return entry.id === id; });
    if (!item) throw new Error("找不到主题：" + id + "，请重新扫描或选择其他主题");
    if (item.error) throw new Error(item.name + "：" + item.error);
    return item;
  }
  async function mountSelected() {
    if (busy || active) throw new Error("A theme is already mounting or mounted");
    busy = true;
    try {
      var item = resolve(namespace.ui.getSettings().themeId);
      loading = item; registered = null;
      try {
        new Function("globalThis", item.source)(root);
        if (!registered) throw new Error("theme.js 未调用 EnhanceNCM.themes.register");
      } finally { loading = null; }
      var theme = registered;
      await namespace.app.mount(function (options) {
        return theme.mount(Object.assign({}, options, { theme: Object.freeze({ id: item.id, name: item.name }) }));
      });
      active = item.id;
      root.document.title = String(theme.name) + " · EnhanceNCM";
    } finally { busy = false; registered = null; }
  }
  // Recreate the page so third-party globals, timers and native listeners cannot
  // leak into the next theme. The renderer gets a chance to persist and stop.
  async function select(id) {
    resolve(id);
    if (busy) throw new Error("主题正在切换，请稍候");
    busy = true;
    try {
      if (namespace.ui.getMode() === "enhanced") await namespace.app.unmount();
      namespace.ui.setThemeId(id);
      if (namespace.ui.getMode() === "enhanced") root.location.reload();
      else namespace.ui.setMode("enhanced");
    } finally { busy = false; }
  }
  async function refresh() {
    if (busy) throw new Error("主题正在切换，请稍候");
    busy = true;
    try {
      if (namespace.ui.getMode() === "enhanced") await namespace.app.unmount();
      root.location.reload();
    } finally { busy = false; }
  }
  namespace.themes = Object.freeze({ list: list, register: register, select: select,
    refresh: refresh, mountSelected: mountSelected, getActive: function () { return active; } });
})(globalThis);
