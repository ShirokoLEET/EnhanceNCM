const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'all';
if (!['all', 'unit'].includes(mode)) throw Error('Usage: node tools/test.js [unit]');
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const files = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join('tests', name));
require('./build-page').build();
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
