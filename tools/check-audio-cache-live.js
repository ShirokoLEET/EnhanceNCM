// Explicit test against the currently paused song. Reloads the same Native
// handle with production cache metadata, briefly resumes, then restores pause
// and position. Does not change song, queue, account likes, or application page.
const fs = require("node:fs");
async function main() {
  if (!process.argv.includes("--verify")) throw new Error("Use --verify to test the current paused song's Native audio cache");
  const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json()).find(t => t.url === "about:blank#enhancencm");
  if (!target) throw new Error("Enhanced page unavailable");
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let sequence = 0;
  ws.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(message.error) : request.resolve(message.result);
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  async function evaluate(expression) {
    const result = await new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error("Cache verification timed out")); }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  let initialized = false;
  try {
    const source = fs.readFileSync("src/sdk/domain/audio-source.js", "utf8");
    await evaluate(`(()=>{const base=EnhanceNCM;const previous=base.sdk.playback.getState();
      if(previous.status!=='paused'||!previous.playId)throw Error('Pause the current song before cache verification');
      const root={setTimeout,clearTimeout,EnhanceNCM:{_native:base._native,sdk:base.sdk}};
      new Function('globalThis',${JSON.stringify(source)})(root);
      window.__audioCacheCheck={source:root.EnhanceNCM._audioSource,previous};})()`);
    initialized = true;
    console.log("Before load:", JSON.stringify(await evaluate(`(async()=>{const c=__audioCacheCheck;
      c.first=await c.source.resolve(c.previous.songId,'standard');
      return {cache:c.first.cache,stats:c.source.getState()};})()`)));
    console.log("Native load:", JSON.stringify(await evaluate(`(async()=>{const c=__audioCacheCheck,p=EnhanceNCM.sdk.playback,bridge=EnhanceNCM._native;
      const info=c.source.createPlayInfo(c.previous.songId,c.first.audio);
      const loaded=await new Promise((resolve,reject)=>{
        const release=bridge.subscribe('audioplayer.onLoad',(id,result)=>{if(id!==c.previous.playId)return;clearTimeout(timer);release();resolve(result)});
        const timer=setTimeout(()=>{release();reject(Error('Native load timeout'))},8000);
        bridge.callArgs('audioplayer.load',[c.previous.playId,{...info,playId:c.previous.playId}]).catch(error=>{clearTimeout(timer);release();reject(error)});
      });
      if(loaded.code!==0)throw Error('Native load failed: '+loaded.code);
      await p.resume();await p.seek(c.previous.current);
      await new Promise(resolve=>setTimeout(resolve,900));await p.pause();
      await new Promise(resolve=>setTimeout(resolve,900));
      return {code:loaded.code,openWholeCached:loaded.openWholeCached,preloadWholeCached:loaded.preloadWholeCached,metadataSupplied:!!info.playInfoStr};})()`)));
    console.log("Repeated selection:", JSON.stringify(await evaluate(`(async()=>{const c=__audioCacheCheck;
      const second=await c.source.resolve(c.previous.songId,'standard');
      return {cache:second.cache,stats:c.source.getState()};})()`)));
  } finally {
    if (initialized) await evaluate(`(async()=>{const c=__audioCacheCheck,p=EnhanceNCM.sdk.playback;
      if(p.getState().playId===c.previous.playId){await p.pause();await p.seek(c.previous.current);}
      delete window.__audioCacheCheck;})()`).catch(console.error);
    ws.close();
  }
}
main().catch(cause => { console.error(cause); process.exitCode = 1; });
