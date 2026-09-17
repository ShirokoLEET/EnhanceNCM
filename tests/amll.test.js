const test = require('node:test');
const assert = require('node:assert/strict');

test('AMLL maps SDK seconds to lyric milliseconds without inventing word timing', async () => {
  const { lyricLines } = await import('../src/themes/amll/adapter.mjs');
  const lines = lyricLines({ synced: true, lines: [
    { time: 1.5, text: '第一行', translation: 'First line' }, { time: 3, text: '第二行' },
  ] }, 10000);
  assert.equal(lines[0].startTime, 1500);
  assert.equal(lines[0].endTime, 3000);
  assert.equal(lines[0].words.length, 1);
  assert.equal(lines[0].translatedLyric, 'First line');
  assert.equal(lines[1].endTime, 10000);
  assert.deepEqual(lyricLines({ synced: false, lines: [{ time: null, text: 'plain' }] }), []);
});

test('AMLL discards late lyrics after song changes and unsubscribe', async () => {
  const { connectPlayer } = await import('../src/themes/amll/adapter.mjs');
  let listener, released = false;
  const pending = new Map(), received = [];
  const state = id => ({ song: { id, dt: 10000 }, playback: {} });
  const disconnect = connectPlayer({
    sdk: { songs: { getLyrics(id) { assert.equal(typeof id, 'number'); return new Promise(resolve => pending.set(id, resolve)); } } },
    player: { subscribe(fn) { listener = fn; return () => { released = true; }; }, getState() { return state(1); } },
    onState() {}, onError(error) { throw error; }, onLyrics(lines) { if (lines.length) received.push(lines[0].words[0].word); },
  });
  listener(state(2));
  await Promise.resolve();
  pending.get(2)({ synced: true, lines: [{ time: 0, text: 'current' }] });
  pending.get(1)({ synced: true, lines: [{ time: 0, text: 'stale' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(received, ['current']);
  listener(state(3)); await Promise.resolve(); disconnect();
  pending.get(3)({ synced: true, lines: [{ time: 0, text: 'disposed' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(received, ['current']); assert.equal(released, true);
});
