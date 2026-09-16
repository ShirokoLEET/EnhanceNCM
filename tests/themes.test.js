const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const manager = fs.readFileSync('src/host/themes.js', 'utf8');
function fixture(catalog, selected = 'spotify', mode = 'enhanced') {
  const calls = [];
  const context = { document: {}, location: { reload() { calls.push('reload'); } },
    EnhanceNCM: { _themeCatalog: catalog, sdk: { marker: true },
      app: { async mount(render) { calls.push('mount'); await render({ sdk: this.sdk }); },
        async unmount() { calls.push('unmount'); } },
      ui: { getSettings: () => ({ themeId: selected }), getMode: () => mode,
        setThemeId(id) { selected = id; calls.push(id); }, setMode(value) { calls.push(value); } } } };
  vm.runInNewContext(manager, context);
  return { context, calls, themes: context.EnhanceNCM.themes };
}
const valid = 'globalThis.EnhanceNCM.themes.register({name:"Spotify",mount() { globalThis.rendered = true; }});';
test('catalog supports folder names, hides source and loads only the selected theme', async () => {
  const f = fixture([{ id: '中文主题', name: '中文主题', source: 'throw Error("must not execute")' },
    { id: 'spotify', name: 'Spotify', source: valid }, { id: 'empty', name: 'empty', error: 'Missing theme.js' }]);
  assert.equal(f.themes.list()[0].id, 'spotify');
  assert.equal(f.themes.list()[0].source, undefined);
  assert.equal(f.context.EnhanceNCM._themeCatalog, undefined);
  await f.themes.mountSelected();
  assert.equal(f.context.rendered, true);
  assert.equal(f.themes.getActive(), 'spotify');
  assert.equal(f.context.document.title, 'Spotify · EnhanceNCM');
});
test('missing, invalid and unregistered themes report errors without mounting', async () => {
  for (const source of ['throw Error("broken")', 'syntax !', '', 'globalThis.EnhanceNCM.themes.register({})']) {
    const f = fixture([{ id: 'spotify', name: 'Spotify', source }]);
    await assert.rejects(f.themes.mountSelected());
    assert.deepEqual(f.calls, []);
  }
  await assert.rejects(fixture([]).themes.mountSelected(), /找不到主题/);
  const f = fixture([{ id: 'spotify', name: 'Spotify', error: 'Missing theme.js' }]);
  await assert.rejects(f.themes.select('spotify'), /Missing theme.js/);
  assert.deepEqual(f.calls, []);
});
test('selection waits for disposal, retains folder ID, and original mode enters enhanced', async () => {
  const catalog = [{ id: '中文主题', name: '中文主题', source: valid }];
  const f = fixture(catalog);
  let release;
  f.context.EnhanceNCM.app.unmount = () => new Promise(resolve => { release = resolve; });
  const selected = f.themes.select('中文主题');
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.themes.select('中文主题'), /正在切换/);
  release(); await selected;
  assert.deepEqual(f.calls, ['中文主题', 'reload']);
  const original = fixture(catalog, 'spotify', 'original');
  await original.themes.select('中文主题');
  assert.deepEqual(original.calls, ['中文主题', 'enhanced']);
});
test('failed cleanup preserves selection and prevents reload; refresh rescans via new context', async () => {
  const f = fixture([{ id: 'spotify', name: 'Spotify', source: valid }]);
  f.context.EnhanceNCM.app.unmount = async () => { throw Error('stop failed'); };
  await assert.rejects(f.themes.select('spotify'), /stop failed/);
  assert.deepEqual(f.calls, []);
  f.context.EnhanceNCM.app.unmount = async () => { f.calls.push('cleanup'); };
  await f.themes.refresh();
  assert.deepEqual(f.calls, ['cleanup', 'reload']);
});
test('SDK bundle has no Spotify renderer, host boots without embedding theme code', () => {
  const build = require('../tools/build-page.js');
  assert.equal(build.sdkBundle().includes('_renderMusic'), false);
  assert.equal(build.hostBundle().includes('_renderMusic'), false);
  assert.ok(build.themeBundle().includes('themes.register'));
});
