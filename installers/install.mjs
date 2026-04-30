import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const installerDir = path.dirname(fileURLToPath(import.meta.url));
const pluginFiles = ['main.js', 'manifest.json', 'styles.css'];

async function promptForVaultPath() {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question('Obsidian vault path: ');
  } finally {
    rl.close();
  }
}

async function existsAsDirectory(targetPath) {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function install() {
  const vaultPath = (process.argv[2] ?? await promptForVaultPath()).trim();
  if (!vaultPath) throw new Error('No vault path provided.');

  const obsidianDir = path.basename(vaultPath) === '.obsidian'
    ? vaultPath
    : path.join(vaultPath, '.obsidian');
  if (!(await existsAsDirectory(obsidianDir))) {
    throw new Error(`Could not find .obsidian at: ${obsidianDir}`);
  }

  const pluginDir = path.join(obsidianDir, 'plugins', 'kb-manager');
  await mkdir(pluginDir, { recursive: true });
  for (const file of pluginFiles) {
    await copyFile(path.join(installerDir, file), path.join(pluginDir, file));
  }
  console.log(`KB Manager installed to:\n${pluginDir}`);
  console.log('Reload Obsidian, then enable KB Manager in Community plugins.');
}

install().catch(error => {
  console.error(error.message);
  process.exit(1);
});
