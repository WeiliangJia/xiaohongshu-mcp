import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

function platformDataHome() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
}

export const dataDir = join(platformDataHome(), 'xiaohongshu-mcp');
export const profileDir = join(dataDir, 'browser');
export const settingsFile = join(dataDir, 'install.json');
export const port = 17333;
export const endpoint = `http://127.0.0.1:${port}/mcp`;

export async function readSettings() {
  const data = JSON.parse(await readFile(settingsFile, 'utf8'));
  if (typeof data.root !== 'string' || !isAbsolute(data.root) ||
      typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) {
    throw new Error('Invalid local installation settings. Run npm run setup in the checkout.');
  }
  return data;
}

export async function setup(root) {
  const previous = await readSettings().catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporaryFile = `${settingsFile}.${randomBytes(6).toString('hex')}.tmp`;
  const settings = { root, token: previous?.token ?? randomBytes(32).toString('hex') };
  await writeFile(temporaryFile, JSON.stringify(settings), { mode: 0o600, flag: 'wx' });
  await rename(temporaryFile, settingsFile);
}
