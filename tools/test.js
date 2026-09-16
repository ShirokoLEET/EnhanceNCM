const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'all';
if (!['all', 'unit', 'ui'].includes(mode)) throw Error('Usage: node tools/test.js [unit|ui]');
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const files = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).filter(name => {
  const browser = /require\(process\.env\.ENHANCENCM_PLAYWRIGHT/.test(fs.readFileSync(path.join(root, 'tests', name), 'utf8'));
  return mode === 'all' || (mode === 'ui') === browser;
}).sort().map(name => path.join('tests', name));
require('./build-page').build();
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
