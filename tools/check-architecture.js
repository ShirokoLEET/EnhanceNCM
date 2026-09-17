const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { sdkSources, hostSources, themeSources } = require('./build-page');
const seen = new Set();
for (const [layer, files] of [['sdk', sdkSources], ['host', hostSources], ['themes', themeSources]]) {
  for (const file of files) {
    assert.ok(file.startsWith(`src/${layer}/`), `${file} is in the wrong bundle`);
    assert.ok(!seen.has(file), `Duplicate module: ${file}`); seen.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    new vm.Script(source, { filename: file });
    if (layer === 'sdk') assert.ok(!/namespace\.(?:themes|app|ui)\b/.test(source), `SDK depends on the host: ${file}`);
    if (layer === 'themes') assert.ok(!/namespace\._(?:native|transport|libraryCache|settings|playerPersistence|coverColors|entry)\b|legacyNativeCmder|APP_CONF/.test(source), `Theme uses private services: ${file}`);
  }
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
for (const file of walk(path.join(root, 'src')).filter(file => file.endsWith('.js') && !file.includes(`${path.sep}inject${path.sep}`))) {
  assert.ok(seen.has(path.relative(root, file).split(path.sep).join('/')), `Unbundled source: ${file}`);
}
for (const file of walk(path.join(root, 'src/themes/amll')).filter(file => /\.(?:tsx|mjs)$/.test(file))) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!/EnhanceNCM\._|sdk\._|legacyNativeCmder|APP_CONF/.test(source), `AMLL uses private services: ${file}`);
  assert.ok(!/from\s+['"][^'"]*(?:sdk|host|spotify)\//.test(source), `AMLL imports another layer: ${file}`);
}
console.log(`Architecture and syntax verified: ${seen.size} modules across SDK, host and theme layers.`);
