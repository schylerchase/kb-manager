import { copyFile, mkdir, rm, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const packageDir = path.join('dist', 'kb-manager-installer');
const zipPath = path.join('dist', 'kb-manager-installer.zip');
const pluginFiles = ['main.js', 'manifest.json', 'styles.css'];
const installerFiles = [
  'install.mjs',
  'install-macos-linux.sh',
  'install-windows.ps1',
  'README.md',
];

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

for (const file of pluginFiles) {
  await copyFile(file, path.join(packageDir, file));
}

for (const file of installerFiles) {
  await copyFile(path.join('installers', file), path.join(packageDir, file));
}

await chmod(path.join(packageDir, 'install-macos-linux.sh'), 0o755);
await chmod(path.join(packageDir, 'install.mjs'), 0o755);

console.log(`Installer package written to ${packageDir}`);

await rm(zipPath, { force: true });
if (await zipPackage()) {
  console.log(`Installer zip written to ${zipPath}`);
}

async function zipPackage() {
  return new Promise(resolve => {
    const zip = spawn('zip', ['-qr', 'kb-manager-installer.zip', 'kb-manager-installer'], { cwd: 'dist' });
    zip.on('error', () => resolve(false));
    zip.on('close', code => resolve(code === 0));
  });
}
