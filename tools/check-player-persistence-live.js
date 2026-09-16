// Explicit local-client test. --save-and-exit changes playback/volume, saves
// a checkpoint and closes CloudMusic; --verify checks a subsequent cold start.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
async function main() {
  const verify = process.argv.includes("--verify");
  if (!verify && !process.argv.includes("--save-and-exit")) throw Error("Use --save-and-exit or --verify");
  const target = (await (await fetch("http://127.0.0.1:9222/json/list")).json())
    .find(item => item.type === "page" && (item.url.startsWith("orpheus://orpheus/pub/app.html") || item.url === "about:blank#enhancencm"));
  if (!target) throw Error("CloudMusic main page is unavailable");
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let serial = 0;
  socket.onmessage = event => {
    const response = JSON.parse(event.data), request = pending.get(response.id); if (!request) return;
    pending.delete(response.id); clearTimeout(request.timer);
    response.error ? request.reject(Error(response.error.message)) : request.resolve(response.result);
  };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error(method + " timed out")); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression) {
    for (let n = 0; n < 200; n++) {
      const value = await evaluate(expression).catch(() => null); if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error("Player did not settle: " + expression);
  }
  const player = "EnhanceNCM.sdk.player.getActiveSession()";
  const shadow = 'document.querySelector("#enhancencm-ui-root")?.shadowRoot';
  const file = path.join(__dirname, "../out/player-persistence-live.json");
  const snapshot = `(()=>{const s=${player}.getState();return {songId:s.song?.id,queue:s.queue.map(t=>String(t.id)),position:s.playback.current,volume:s.playback.volume,status:s.playback.status,playId:s.playback.playId,shuffle:s.shuffle,repeatOne:s.repeatOne};})()`;
  try {
    await until(`!!window.EnhanceNCM?.sdk?.player?.getActiveSession?.() && !!${shadow}?.querySelector('#play')`);
    if (!verify) {
      await until(`!${shadow}.querySelector('#refresh-library').disabled`);
      const initialVolume = await evaluate(`${player}.getState().playback.volume`);
      await evaluate(`${player}.setVolume(0.23)`);
      if (!await evaluate(`${player}.getState().queue.length`)) {
        await until(`!!${shadow}.querySelector('#home-created-grid button,#home-subscribed-grid button')`);
        await evaluate(`${shadow}.querySelector('#home-created-grid button,#home-subscribed-grid button').click()`);
        await until(`!${shadow}.querySelector('#play-all').disabled`);
        await evaluate(`${shadow}.querySelector('#play-all').click()`);
      }
      await until(`${player}.getState().queue.length > 0 && !${player}.getState().loading`);
      await evaluate(`(()=>{const p=${player},q=p.getState().queue;return p.play(q[Math.min(2,q.length-1)]);})()`);
      await until(`${player}.getState().playback.status === 'playing'`);
      await evaluate(`${player}.seek(43)`);
      await until(`${player}.getState().playback.current >= 42.5`);
      await evaluate(`${player}.pause()`);
      await evaluate(`${player}.setShuffle(true);${player}.setRepeatOne(true)`);
      const expected = await evaluate(snapshot);
      expected.initialVolume = initialVolume;
      fs.writeFileSync(file, JSON.stringify(expected));
      // Exercise the production exit path: checkpoint -> native stop -> exit.
      await evaluate(`setTimeout(()=>${shadow}.querySelector('#window-close').click(),100)`);
      console.log(JSON.stringify({ savedSongId: expected.songId, queueCount: expected.queue.length, position: expected.position, volume: expected.volume, exiting: true }));
    } else {
      const expected = JSON.parse(fs.readFileSync(file, "utf8"));
      expected.songId = String(expected.songId);
      await until(`${player}.getState().song?.id === ${JSON.stringify(expected.songId)} && ${player}.getState().playback.restored === true`);
      const actual = await evaluate(snapshot);
      assert.equal(actual.status, "paused"); assert.equal(actual.playId, null);
      assert.deepEqual(actual.queue, expected.queue);
      assert.equal(actual.songId, expected.songId);
      assert.ok(Math.abs(actual.position - expected.position) < 0.1);
      assert.equal(actual.volume, expected.volume);
      assert.equal(actual.shuffle, true); assert.equal(actual.repeatOne, true);
      assert.equal(await evaluate('EnhanceNCM.sdk.playback.getState().playId'), null, "cold restore must not open an audio stream");
      await evaluate(`${shadow}.querySelector('#play').click()`);
      await until(`${player}.getState().playback.status === 'playing' && ${player}.getState().playback.current >= ${expected.position - 0.5}`);
      await evaluate(`${player}.pause()`);
      await evaluate(`${player}.setVolume(${expected.initialVolume});${player}.setShuffle(false);${player}.setRepeatOne(false)`);
      console.log(JSON.stringify({ coldRestore: "passed", queueCount: actual.queue.length, position: actual.position,
        volume: actual.volume, silentUntilClick: true, resumedAtSavedPosition: true }));
    }
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
