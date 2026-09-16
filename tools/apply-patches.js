const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, 'third_party/chromatic');
const patch = path.join(root, 'patches/chromatic/runtime-lifecycle.patch');
function check(args) {
  try { execFileSync('git', ['apply', ...args, patch], { cwd, stdio: 'pipe' }); return true; }
  catch { return false; }
}
if (check(['--reverse', '--check'])) console.log('Chromatic patch already applied.');
else if (check(['--check'])) {
  execFileSync('git', ['apply', patch], { cwd, stdio: 'inherit' });
  console.log('Chromatic runtime patch applied.');
} else throw Error('Chromatic patch does not match this checkout. Initialize the pinned submodule and inspect local changes; no files were overwritten.');
