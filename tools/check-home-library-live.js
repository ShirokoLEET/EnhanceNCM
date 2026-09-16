// Non-mutating account/library smoke test against the running enhanced client.
// Reloads the page and changes views, but does not initiate playback.
async function main() {
  const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json())
    .find(item => item.type === "page" && (item.url === "about:blank#enhancencm" || item.url.startsWith("orpheus://orpheus/pub/app.html")));
  if (!target) throw new Error("Enhanced CloudMusic page is unavailable");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const response = JSON.parse(event.data), request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id); clearTimeout(request.timer);
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result);
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + " timed out")); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function until(expression) {
    for (let attempt = 0; attempt < 200; ++attempt) {
      const value = await evaluate(expression).catch(() => null);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Client did not settle: " + expression);
  }
  const root = 'document.querySelector("#enhancencm-ui-root")?.shadowRoot';
  try {
    if (await evaluate('EnhanceNCM.ui.getMode()') !== "enhanced") throw new Error("Switch to EnhanceNCM before running this check");
    await call("Page.enable");
    await call("Page.reload", { ignoreCache: true });
    await until(`!!${root}?.querySelector('#home-subscribed-grid')`);
    const home = await until(`(()=>{const s=${root};if(!s||s.querySelector('#refresh-library').disabled||!s.querySelector('#home-recommendation-status').hidden)return null;
      const c=s.querySelector('#home-created-status').textContent, f=s.querySelector('#home-subscribed-status').textContent;
      if (/正在读取|正在更新/.test(c+' '+f))return null;
      return {recommended:s.querySelectorAll('#albums button').length,created:s.querySelectorAll('#home-created-grid button').length,
        subscribed:s.querySelectorAll('#home-subscribed-grid button').length,sidebarCreated:s.querySelectorAll('#sidebar-created .playlist-link').length,
        groups:Array.from(s.querySelectorAll('#sidebar-created .playlist-group-label'),x=>x.textContent),
        connectionLine:!!s.querySelector('#connection'),barHeight:getComputedStyle(s.querySelector('.window-bar')).height,
        controlWidth:getComputedStyle(s.querySelector('#window-minimize')).width,noticeVisible:!s.querySelector('#notice').hidden,
        createdStatus:c,subscribedStatus:f};})()`);
    if (home.subscribed) {
      await evaluate(`${root}.querySelector('#home-subscribed-grid button').click()`);
      const selected = await until(`(()=>{const s=${root}, row=s?.querySelector('#tracks tr');return row&&{title:s.querySelector('#list-heading').textContent,rows:s.querySelectorAll('#tracks tr').length,scrollbar:getComputedStyle(s.querySelector('main'),'::-webkit-scrollbar').width,noticeVisible:!s.querySelector('#notice').hidden};})()`);
      console.log(JSON.stringify({ home, selected }));
    } else console.log(JSON.stringify({ home }));
    await evaluate(`${root}.querySelector('[data-view="discover"]').click()`);
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
