const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { build, buildRoot } = require('./build-page.js');

function packageRelease(dllPath) {
  if (!dllPath) throw new Error('Usage: node tools/package-release.js <Release x64 msimg32.dll>');
  const dll = fs.readFileSync(dllPath);
  const pe = dll.readUInt32LE(0x3c);
  if (dll.readUInt32LE(pe) !== 0x4550 || dll.readUInt16LE(pe + 4) !== 0x8664)
    throw new Error('Release DLL must be a Windows x64 PE image');
  build();
  const project = path.join(__dirname, '..');
  const files = ['msimg32.dll', 'EnhanceNCM/EnhanceNCM.js', 'EnhanceNCM/EnhanceNCM-sdk.js', 'EnhanceNCM/EnhanceNCM-page.js',
    'EnhanceNCM/Themes/Spotify/theme.js', 'EnhanceNCM/Themes/AMLL/theme.js', 'EnhanceNCM/Themes/AMLL/LICENSE', 'EnhanceNCM/Themes/AMLL/NOTICE.md', '安装说明.txt'];
  fs.copyFileSync(dllPath, path.join(buildRoot, 'msimg32.dll'));
  fs.mkdirSync(path.join(buildRoot, 'EnhanceNCM'), { recursive: true });
  fs.copyFileSync(path.join(project, 'src/inject/EnhanceNCM.js'), path.join(buildRoot, 'EnhanceNCM/EnhanceNCM.js'));
  fs.copyFileSync(path.join(project, 'docs/INSTALL.md'), path.join(buildRoot, '安装说明.txt'));
  const manifest = {
    architecture: 'x64', clientVersionTested: '3.1.39.205426',
    prerequisites: ['Current Microsoft Visual C++ x64 runtime (MSVCP140, VCRUNTIME140, VCRUNTIME140_1)'],
    files: files.map(file => ({ path: file, sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(buildRoot, file))).digest('hex') }))
  };
  fs.writeFileSync(path.join(buildRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Release package: ' + buildRoot + ' (' + files.length + ' files + manifest.json)');
  return manifest;
}
if (require.main === module) packageRelease(process.argv[2]);
module.exports = { packageRelease };
