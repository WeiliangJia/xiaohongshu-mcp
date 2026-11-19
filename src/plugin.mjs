import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readSettings } from './settings.mjs';

try {
  const { root } = await readSettings();
  const { runPlugin } = await import(pathToFileURL(join(root, 'src', 'plugin-runtime.mjs')).href);
  await runPlugin();
} catch (error) {
  console.error(`xiaohongshu-mcp: Run npm ci and npm run setup in the checkout, then restart Codex. ${error.code ?? ''}`);
  process.exitCode = 1;
}
