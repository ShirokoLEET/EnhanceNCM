// Explicit metadata/cache verification on the local enhanced CEF page.
// Uses isolated SDK objects: no navigation, playback or like mutations. Writes
// the production Native playlist cache; recommendation calls fetch one batch.
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  if (!process.argv.includes("--verify")) throw new Error("Use --verify to request account metadata and populate the Native cache");
  const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json())
    .find(item => item.url === "about:blank#enhancencm");
  if (!target) throw new Error("The enhanced page must be open");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map(); let sequence = 0;
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(message.error) : request.resolve(message.result);
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  async function evaluate(expression) {
    const result = await new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Live SDK request timed out")); }, 65000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  const sources = ["transport/native.js", "domain/audio-source.js", "domain/library-cache.js", "domain/music.js"]
    .map(file => fs.readFileSync(path.join(__dirname, "../src/sdk", file), "utf8"));
  try {
    await evaluate(`(()=>{
      const sources=${JSON.stringify(sources)}, base=EnhanceNCM;
      const mux={};
      // Reuse the installed SQL event mux when it supports Native caching.
      function create(){const calls=[];const root={channel,location,setTimeout,clearTimeout,
        EnhanceNCM:{_playback:base._playback,_shell:base._shell,
          _transport:{request(path,data){calls.push(path);return base._transport.request(path,data)}}}};
        if(base.sdk.cache)root.EnhanceNCM._native=base._native;
        else if(mux.native)root.EnhanceNCM._native=mux.native;
        sources.forEach(source=>new Function('globalThis',source)(root));
        mux.native=root.EnhanceNCM._native;
        return {sdk:root.EnhanceNCM.sdk,calls};}
      window.__libraryCheck={create,current:create()};
    })()`);
    const first = await evaluate(`(async()=>{const p=__libraryCheck.current;await p.sdk.account.getCurrent();
      const liked=await p.sdk.playlists.getLiked();__libraryCheck.playlistId=liked?.id||'3778678';
      const tracks=await p.sdk.playlists.getTracks(__libraryCheck.playlistId,{limit:500});
      return {loaded:tracks.length,cache:p.sdk.cache.getState(),requests:p.calls.length};})()`);
    console.log("First load:", JSON.stringify(first));
    const second = await evaluate(`(async()=>{const p=__libraryCheck.create();await p.sdk.account.getCurrent();
      const tracks=await p.sdk.playlists.getTracks(__libraryCheck.playlistId,{limit:500});
      return {loaded:tracks.length,cache:p.sdk.cache.getState(),contentRequests:p.calls.filter(path=>path!=='/api/w/nuser/account/get')};})()`);
    console.log("Fresh SDK instance:", JSON.stringify(second));
    for (const method of ["getDailySongs", "getPrivateRadar", "getPrivateRoaming", "getHeartMode"]) {
      const result = await evaluate(`(async()=>{try{const value=await __libraryCheck.current.sdk.recommendations.${method}();
        return {ok:true,count:Array.isArray(value)?value.length:null,playlist:!Array.isArray(value)&&!!value,
          validSongs:!Array.isArray(value)||value.every(song=>!!song.id)}}catch(cause){return {ok:false,code:cause.code||cause.message}}})()`);
      console.log(method + ":", JSON.stringify(result));
    }
  } finally { await evaluate("delete window.__libraryCheck").catch(() => {}); socket.close(); }
}
main().catch(cause => { console.error(cause); process.exitCode = 1; });
