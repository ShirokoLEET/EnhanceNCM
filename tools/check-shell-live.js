// Explicit live smoke test for the user's local CloudMusic client on port 9222.
// Changes window state and briefly plays/pauses the first visible song.
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const coverOnly = process.argv.includes("--cover");
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const target = targets.find(item => item.type === "page" &&
    (item.url === "about:blank#enhancencm" || item.url === "orpheus://orpheus/pub/app.html"));
  if (!target) throw new Error("CloudMusic main page is unavailable");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function call(method, params) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(method + " timed out")); }, 12000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression) {
    for (let attempt = 0; attempt < 200; attempt++) {
      try { const value = await evaluate(expression); if (value) return value; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Client state did not settle: " + expression);
  }
  const shadow = 'document.querySelector("#enhancencm-ui-root").shadowRoot';
  try {
    const previous = coverOnly && target.url.startsWith("about:") ? await evaluate('EnhanceNCM.sdk.playback.getState()') : null;
    if (coverOnly && target.url.startsWith("about:")) {
      await evaluate(`window.__coverReloadToken=true;${shadow}.querySelector('#refresh').click()`);
      await until(`!window.__coverReloadToken && !!document.querySelector('#enhancencm-ui-root')?.shadowRoot?.querySelector('main') && getComputedStyle(${shadow}.querySelector('main'),'::-webkit-scrollbar').display === 'none'`);
    }
    if (await evaluate('EnhanceNCM.ui.getMode()') !== "enhanced") await evaluate('EnhanceNCM.ui.setMode("enhanced")');
    await until('EnhanceNCM.ui.getMode() === "enhanced" && window.EnhanceNCM?.sdk?.window && !!document.querySelector("#enhancencm-ui-root")?.shadowRoot?.querySelector("#window-maximize")');
    if (!coverOnly) {
    await evaluate(`${shadow}.querySelector('#window-maximize').click()`);
    await until('EnhanceNCM.sdk.window.getState().then(s => s.maximized)');
    await evaluate(`${shadow}.querySelector('#window-maximize').click()`);
    await until('EnhanceNCM.sdk.window.getState().then(s => s.status === "restore")');
    await evaluate(`${shadow}.querySelector('#window-minimize').click()`);
    await until('EnhanceNCM.sdk.window.getState().then(s => s.status === "minimize")');
    await evaluate('EnhanceNCM.sdk.window.restore()');
    await until('EnhanceNCM.sdk.window.getState().then(s => s.status === "restore")');
    console.log("Native maximize / restore / minimize: passed");
    }
    await evaluate(`(()=>{window.__coverCheck=null;const call=channel.call;window.__restoreCoverCheck=()=>channel.call=call;channel.call=function(name,callback,args){if(name==='player.setCover')__coverCheck=args[0];return call.apply(this,arguments);};})()`);
    if (await evaluate(`${shadow}.querySelector('#play-all').disabled`)) {
      await until(`!!${shadow}.querySelector('#home-created-grid button,#home-subscribed-grid button')`);
      await evaluate(`${shadow}.querySelector('#home-created-grid button,#home-subscribed-grid button').click()`);
    }
    await until(`!${shadow}.querySelector('#play-all').disabled`);
    if (previous && previous.songId) {
      await evaluate(`(async()=>{const p=EnhanceNCM.sdk.playback;await p.play(${JSON.stringify(previous.songId)});await p.setVolume(${Number(previous.volume)});await p.seek(${Number(previous.current)});${previous.status !== "playing" ? 'await p.pause();' : ''}})()`);
    } else await evaluate(`${shadow}.querySelector('#play-all').click()`);
    const playback = await until('(() => { const s = EnhanceNCM.sdk.playback.getState(); return ["playing", "paused", "error"].includes(s.status) && {status:s.status,error:s.error,songId:s.songId}; })()');
    console.log("Native playback:", JSON.stringify(playback));
    if (playback.status === "error") throw new Error("Native playback failed: " + JSON.stringify(playback.error));
    if (playback.status === "playing" && (!previous || !previous.songId)) {
      await evaluate(`${shadow}.querySelector('#play').click()`);
      await until('EnhanceNCM.sdk.playback.getState().status === "paused"');
    }
    if (coverOnly) console.log("Native cover URL:", await until('window.__coverCheck'));
    await evaluate('window.__restoreCoverCheck()');
    console.log("UI:", JSON.stringify(await evaluate(`({title:${shadow}.querySelector('#now-title').textContent, shell:${shadow}.querySelector('#shell-status').textContent})`)));
    console.log("Artwork cache:", JSON.stringify(await evaluate(`(()=>{const images=Array.from(${shadow}.querySelectorAll('img'));return {total:images.length,cached:images.filter(i=>i.getAttribute('src').startsWith('orpheus://cache?')).length,loaded:images.filter(i=>i.complete&&i.naturalWidth>0).length,scrollbar:getComputedStyle(${shadow}.querySelector('main'),'::-webkit-scrollbar').display};})()`)));
    await call("Page.enable", {});
    const screenshot = await call("Page.captureScreenshot", { format: "png" });
    const output = path.join(__dirname, "../out/music-ui/desktop-shell-live.png");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(screenshot.data, "base64"));
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
