const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const executable = path.resolve('out/theme-files-test.exe');
test('native discovery reads direct theme folders, Unicode and JS escapes, and reports invalid entries', {
  skip: !fs.existsSync(executable) && 'Compile tests/theme-files.test.cpp to out/theme-files-test.exe first'
}, () => {
  const directory = fs.mkdtempSync(path.resolve('out/theme-fixture-'));
  const source = 'const text = "quote \\" and slash \\\\";\n// 中文\t';
  for (const name of ['Spotify', '中文主题', 'Missing', 'Empty']) fs.mkdirSync(path.join(directory, name));
  fs.writeFileSync(path.join(directory, 'Spotify/theme.js'), source);
  fs.writeFileSync(path.join(directory, '中文主题/theme.js'), source);
  fs.writeFileSync(path.join(directory, 'Empty/theme.js'), '');
  fs.writeFileSync(path.join(directory, 'ignored.js'), source);
  fs.mkdirSync(path.join(directory, 'Spotify/nested'));
  const scan = () => JSON.parse(execFileSync(executable, [directory], { encoding: 'utf8' }));
  const entries = scan();
  assert.equal(entries.length, 4);
  assert.equal(entries.find(t => t.id === 'spotify').source, source);
  assert.equal(entries.find(t => t.id === '中文主题').name, '中文主题');
  assert.match(entries.find(t => t.id === 'Missing').error, /Missing/);
  assert.match(entries.find(t => t.id === 'Empty').error, /Empty/);
  fs.mkdirSync(path.join(directory, 'Added'));
  fs.writeFileSync(path.join(directory, 'Added/theme.js'), 'register()');
  assert.equal(scan().length, 5);
  assert.deepEqual(JSON.parse(execFileSync(executable, [path.join(directory, 'absent')], { encoding: 'utf8' })), []);
});
