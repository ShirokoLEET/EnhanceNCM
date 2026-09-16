const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { bundle } = require("../tools/build-page.js");

function fixture(options = {}) {
  const events = new Map();
  const calls = [];
  const controls = { intercept: () => false, loadCode: 0 };
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? (options.controlTimeout || ms) : ms),
    channel: {
      registerCall(name, callback) { events.set(name, callback); },
      call(name, callback, args) {
        calls.push({ name, args });
        if (controls.intercept(name, callback, args)) return;
        if (name === "network.aegisEncrypt") return callback({ errorCode: 0, encryptedBody: "fixture" });
        if (name === "network.fetch") return callback({ code: 0, status: 200,
          blob: JSON.stringify({ code: 200, data: [{ url: "https://preview.invalid/audio" }] }) });
        if (name === "audioplayer.load") {
          const code = controls.loadCode;
          setTimeout(() => events.get("audioplayer.onLoad")(args[0], { code, duration: 120 }), 0);
        }
        callback();
      }
    }
  };
  vm.runInNewContext(bundle(), context);
  return { player: context.EnhanceNCM.sdk.playback, controls, calls,
    emit: (name, ...args) => events.get(name)(...args) };
}
async function until(predicate) {
  for (let i = 0; i < 30 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(predicate(), "expected deferred Native operation");
}

test("late pause/resume callbacks cannot change a newer song's status", async () => {
  const { player, controls } = fixture();
  await player.play(1);
  let finishPause;
  controls.intercept = (name, callback) => {
    if (name !== "audioplayer.pause") return false;
    finishPause = callback; return true;
  };
  const oldPause = player.pause();
  await player.play(2);
  finishPause(); await oldPause;
  assert.equal(player.getState().songId, "2");
  assert.equal(player.getState().status, "playing");
  controls.intercept = () => false;
  await player.pause();
  let finishResume;
  controls.intercept = (name, callback) => {
    if (name !== "audioplayer.play") return false;
    finishResume = callback; return true;
  };
  const oldResume = player.resume();
  controls.intercept = () => false;
  await player.play(3); await player.pause();
  finishResume(); await oldResume;
  assert.equal(player.getState().songId, "3");
  assert.equal(player.getState().status, "paused");
  await player.stop();
});

test("a failed stop retains its Native handle for retry before navigation", async () => {
  const { player, controls, calls } = fixture();
  const playing = await player.play(1);
  controls.intercept = name => {
    if (name === "audioplayer.stop") throw new Error("stop rejected");
    return false;
  };
  await assert.rejects(player.stop(), /stop rejected/);
  assert.equal(player.getState().playId, playing.playId);
  assert.equal(player.getState().status, "error");
  controls.intercept = () => false;
  await player.stop();
  assert.equal(calls.filter(call => call.name === "audioplayer.stop" && call.args[0] === playing.playId).length, 2);
  assert.equal(player.getState().status, "idle");
});

test("cleanup from a failed old load cannot overwrite a newer playback session", async () => {
  const { player, controls } = fixture();
  controls.loadCode = 403;
  let finishCleanup;
  controls.intercept = (name, callback) => {
    if (name !== "audioplayer.stop" || finishCleanup) return false;
    finishCleanup = callback; return true;
  };
  const failed = assert.rejects(player.play(1), error => error.code === "LOAD_FAILED");
  await until(() => !!finishCleanup);
  controls.loadCode = 0;
  await player.play(2);
  finishCleanup(); await failed;
  assert.equal(player.getState().songId, "2");
  assert.equal(player.getState().status, "playing");
  await player.stop();
});

test("same-song controls follow the latest intent despite reversed callbacks and events", async () => {
  const { player, controls, emit } = fixture();
  const playing = await player.play(1);
  const requests = [];
  controls.intercept = (name, callback, args) => {
    if (!/audioplayer\.(play|pause)$/.test(name)) return false;
    requests.push({ callback, args }); return true;
  };
  const first = player.pause();
  assert.equal(player.getState().pendingStatus, "paused");
  const second = player.resume();
  assert.equal(player.getState().pendingStatus, "playing");
  const third = player.pause();
  emit("audioplayer.onPlayState", playing.playId, requests[2].args[1], 2);
  await third;
  requests[1].callback(); requests[0].callback();
  emit("audioplayer.onPlayState", playing.playId, requests[1].args[1], 1);
  await Promise.all([first, second]);
  assert.equal(player.getState().status, "paused");
  assert.equal(player.getState().pendingStatus, null);
  await player.stop();
});

test("native state acknowledgements complete initial play and pause without command callbacks", async () => {
  const { player, controls, emit } = fixture();
  const callbacks = [];
  controls.intercept = (name, callback, args) => {
    if (!/audioplayer\.(play|pause)$/.test(name)) return false;
    callbacks.push(callback);
    emit("audioplayer.onPlayState", args[0], args[1], name.endsWith("pause") ? 2 : 1);
    return true;
  };
  await player.play(1);
  assert.equal(player.getState().duration, 120);
  await player.pause();
  callbacks[0](); callbacks[1]();
  await Promise.resolve();
  assert.equal(player.getState().status, "paused");
  assert.equal(player.getState().pendingStatus, null);
  await player.stop();
});

test("external state and track end cannot be overwritten by a pending control callback", async () => {
  const { player, controls, emit } = fixture();
  const playing = await player.play(1);
  let request;
  controls.intercept = (name, callback, args) => {
    if (name !== "audioplayer.pause") return false;
    request = { callback, args }; return true;
  };
  const pause = player.pause();
  emit("audioplayer.onPlayState", playing.playId, "external", 1);
  request.callback();
  emit("audioplayer.onPlayState", playing.playId, request.args[1], 2);
  await pause;
  assert.equal(player.getState().status, "playing");
  const nextPause = player.pause();
  emit("audioplayer.onEnd", playing.playId, {});
  request.callback();
  emit("audioplayer.onPlayState", playing.playId, request.args[1], 2);
  await nextPause;
  assert.equal(player.getState().status, "ended");
  assert.equal(player.getState().pendingStatus, null);
  await player.stop();
});

test("failed controls clear the pending intent and allow retry", async () => {
  const { player, controls } = fixture();
  await player.play(1);
  controls.intercept = name => {
    if (name === "audioplayer.pause") throw new Error("pause rejected");
    return false;
  };
  await assert.rejects(player.pause(), /pause rejected/);
  assert.equal(player.getState().status, "playing");
  assert.equal(player.getState().pendingStatus, null);
  controls.intercept = () => false;
  await player.pause();
  assert.equal(player.getState().status, "paused");
  await player.stop();
});

test("a missing acknowledgement times out without leaving the pause button pending", async () => {
  const { player, controls } = fixture({ controlTimeout: 20 });
  await player.play(1);
  controls.intercept = name => name === "audioplayer.pause";
  await assert.rejects(player.pause(), error => error.code === "TIMEOUT");
  assert.equal(player.getState().status, "playing");
  assert.equal(player.getState().pendingStatus, null);
  controls.intercept = () => false;
  await player.pause();
  assert.equal(player.getState().status, "paused");
  await player.stop();
});
