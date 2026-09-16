// Read-only inspection of the running desktop frontend through local CEF DevTools.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function page() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json/list", response => {
      let data = "";
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(data).find(item => item.type === "page")); }
        catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function main() {
  const target = await page();
  if (!target || !target.url.startsWith("orpheus://"))
    throw new Error("Open the original client page before inspecting scripts");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const callbacks = pending.get(message.id);
    if (callbacks) {
      pending.delete(message.id);
      message.error ? callbacks.reject(message.error) : callbacks.resolve(message.result);
    }
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  try {
    await call("Page.enable");
    const tree = await call("Page.getResourceTree");
    function resources(frame) {
      return (frame.resources || []).concat((frame.childFrames || []).flatMap(resources));
    }
    const pattern = new RegExp(process.argv[2] || "audioplayer\\.", "gi");
    const maxPerFile = Number(process.argv[3] || 16);
    for (const resource of resources(tree.frameTree).filter(item => item.type === "Script" && item.url.startsWith("orpheus://"))) {
      const result = await call("Page.getResourceContent", {
        frameId: tree.frameTree.frame.id, url: resource.url
      });
      const content = result.content || "";
      if (process.argv[2] === "--save") {
        if (!resource.url.includes(process.argv[3] || "app.chunk")) continue;
        const directory = path.join(__dirname, "../out/client-sources");
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, path.basename(new URL(resource.url).pathname));
        fs.writeFileSync(file, content);
        console.log(file);
        continue;
      }
      if (process.argv[2] === "--range" && resource.url.includes(process.argv[3])) {
        const offset = Number(process.argv[4]);
        console.log(content.slice(offset, offset + Number(process.argv[5] || 5000)));
        continue;
      }
      const matches = Array.from(content.matchAll(pattern));
      if (!matches.length) continue;
      console.log(JSON.stringify({ resource: resource.url, length: content.length, count: matches.length }));
      for (const match of matches.slice(0, maxPerFile)) {
        const offset = match.index;
        console.log(JSON.stringify({ offset, snippet: content.slice(Math.max(0, offset - 220), offset + 350) }));
      }
    }
  } finally { socket.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
