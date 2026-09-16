// Local CloudMusic startup check. --roundtrip switches interfaces and reloads;
// it stops playback first. Default only inspects the current direct entry.
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const original = "orpheus://orpheus/pub/app.html";
  const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json())
    .find(item => item.type === "page" && (item.url.startsWith(original) || item.url === "about:blank#enhancencm"));
  if (!target) throw new Error("CloudMusic main page is unavailable");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + " timed out")); }, 12000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const value = await evaluate(expression).catch(() => null);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Entry did not settle: " + expression);
  }
  const shadow = 'document.querySelector("#enhancencm-ui-root")?.shadowRoot';
  const directReady = `!!window.EnhanceNCM?._entry?.active && innerWidth > 0 && innerHeight > 0 && !!${shadow}?.querySelector('#window-maximize') && !localStorage.getItem('enhancencm.restorePending.v1')`;
  try {
    await call("Page.enable");
    await until(directReady);
    if (process.argv.includes("--roundtrip")) {
      await evaluate('EnhanceNCM.sdk.playback.stop()');
      await evaluate('EnhanceNCM.ui.setMode("original")');
      await until(`!window.EnhanceNCM?._entry?.active && !!${shadow}?.querySelector('#e-button') && !!document.querySelector('[data-testid="tid_pc_nav_bar_account"]')`);
      if (await evaluate('EnhanceNCM.ui.getSettings().mode') !== "original") throw new Error("Original preference was not saved");
      await call("Page.reload");
      await until(`!window.EnhanceNCM?._entry?.active && !!${shadow}?.querySelector('#e-button')`);
      await evaluate('EnhanceNCM.ui.setMode("enhanced")');
      await until(`location.href === 'about:blank#enhancencm' && !!${shadow}?.querySelector('#window-maximize') && !localStorage.getItem('enhancencm.restorePending.v1')`);
      await call("Page.navigate", { url: original });
      await until(directReady);
      await call("Page.reload");
      await until(directReady);
      console.log("Original / enhanced roundtrip, saved preference, direct reload: passed");
    }
    const snapshot = await evaluate(`({url:location.href,direct:!!EnhanceNCM._entry?.active,mode:EnhanceNCM.ui.getMode(),viewport:[innerWidth,innerHeight],
      originalScripts:Array.from(document.scripts).map(s=>s.src),originalResources:performance.getEntriesByType('resource').filter(r=>/\\.chunk\\.|vendors~app|hybrid\\/app/.test(r.name)).map(r=>r.name),
      pending:localStorage.getItem('enhancencm.restorePending.v1'),cachedPlaylistButtons:${shadow}.querySelectorAll('#sidebar-created .playlist-link').length})`);
    if (snapshot.originalScripts.length || snapshot.originalResources.length || snapshot.pending)
      throw new Error("Direct entry loaded original scripts or did not finish: " + JSON.stringify(snapshot));
    console.log(JSON.stringify(snapshot));
    const screenshot = await call("Page.captureScreenshot", { format: "png" });
    const output = path.join(__dirname, "../out/music-ui/direct-entry-live.png");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(screenshot.data, "base64"));
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
