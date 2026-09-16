// Local CEF diagnostic. Default is read-only; --probe clicks the current
// playback button once, observes acknowledgements, then restores its state.
// --probe-pointer instead holds a real CEF pointer press across progress ticks.
// --probe-pause first resumes a paused track so the probe always tests pause.
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const target = targets.find(item => item.type === "page" && item.url === "about:blank#enhancencm");
  if (!target) throw new Error("Open the enhanced music page first");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let sequence = 0;
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
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Diagnostic timed out")); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  const inspect = `(()=>{const r=document.querySelector('#enhancencm-ui-root').shadowRoot;return {
    state:EnhanceNCM.sdk.playback.getState(),button:r.querySelector('#play').getAttribute('aria-label'),
    busy:r.querySelector('#play').getAttribute('aria-busy'),notice:r.querySelector('#notice-text').textContent};})()`;
  let installed = false;
  let previous;
  try {
    previous = await evaluate(inspect);
    const pauseProbe = process.argv.includes("--probe-pause");
    const pointer = pauseProbe || process.argv.includes("--probe-pointer");
    if (!pointer && !process.argv.includes("--probe")) { console.log(JSON.stringify(previous, null, 2)); return; }
    if (!["playing", "paused"].includes(previous.state.status) || previous.state.pendingStatus)
      throw new Error("Probe requires a settled current track");
    await evaluate(`(()=>{
      const p=EnhanceNCM.sdk.playback, bridge=EnhanceNCM._native, original=channel.call;
      const start=performance.now(), rows=[], releases=[];
      const record=(kind,data)=>{if(rows.length<150)rows.push({ms:Math.round(performance.now()-start),kind,data});};
      let lastProgress=-1, lastStatus='';
      releases.push(p.subscribe(s=>{const status=[s.status,s.pendingStatus,s.buffering].join();if(Math.abs(s.current-lastProgress)>0.5||status!==lastStatus){lastProgress=s.current;lastStatus=status;record('snapshot',s)}}));
      const button=document.querySelector('#enhancencm-ui-root').shadowRoot.querySelector('#play');
      for(const event of ['pointerdown','pointerup','click']) {
        const listener=e=>record(event,{target:e.target.tagName});
        button.addEventListener(event,listener);
        releases.push(()=>button.removeEventListener(event,listener));
      }
      for(const event of ['audioplayer.onPlayState','audioplayer.onEnd','audioplayer.onBuffering','player.onaction'])
        releases.push(bridge.subscribe(event,(...args)=>record(event,args)));
      function wrapped(name,callback,args){
        if(!/^audioplayer\.(play|pause|stop)$/.test(name))return original.apply(this,arguments);
        record('command',{name,args});
        return original.call(this,name,function(...values){record('callback',{name,values});return callback.apply(this,values)},args);
      }
      channel.call=wrapped;
      window.__playbackDiagnostic={rows,restore(){if(channel.call===wrapped)channel.call=original;releases.forEach(fn=>fn());delete window.__playbackDiagnostic;}};
    })()`);
    installed = true;
    if (pauseProbe && previous.state.status === "paused") {
      await evaluate("EnhanceNCM.sdk.playback.resume()");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const probeStart = await evaluate(inspect);
    if (pointer) {
      const point = await evaluate("(()=>{const r=document.querySelector('#enhancencm-ui-root').shadowRoot.querySelector('#play svg').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
      await call("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
      try { await new Promise(resolve => setTimeout(resolve, 450)); }
      finally { await call("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point }); }
    } else await evaluate("document.querySelector('#enhancencm-ui-root').shadowRoot.querySelector('#play').click()");
    await new Promise(resolve => setTimeout(resolve, 3500));
    const after = await evaluate(inspect);
    const trace = await evaluate("window.__playbackDiagnostic.rows");
    const report = { before: previous, probeStart, after, trace };
    const directory = path.join(__dirname, "../out/playback-diagnostics");
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, `probe-${Date.now()}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log("Saved:", output);
  } finally {
    if (installed) {
      // Do not restore over a different song selected while observing.
      await evaluate(`(async()=>{const p=EnhanceNCM.sdk.playback,s=p.getState();
        window.__playbackDiagnostic?.restore();
        if(s.playId===${JSON.stringify(previous.state.playId)} && s.status!==${JSON.stringify(previous.state.status)})
          await p.${previous.state.status === "playing" ? "resume" : "pause"}();})()`).catch(console.error);
    }
    socket.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
