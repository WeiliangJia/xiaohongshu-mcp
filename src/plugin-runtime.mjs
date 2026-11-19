import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { endpoint, readSettings } from './settings.mjs';
import { createMcp, toolError } from './tools.mjs';

async function openClient(token) {
  const client = new Client({ name: 'xiaohongshu-mcp-codex', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  try {
    await client.connect(transport, { timeout: 2000 });
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

async function connectService() {
  const { root, token } = await readSettings();
  try {
    return await openClient(token);
  } catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED' && error.message !== 'fetch failed') throw error;
  }
  const child = spawn(process.execPath, [join(root, 'src', 'main.mjs'), 'serve', '--idle-exit'], {
    cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
  });
  let startError;
  child.once('error', error => { startError = error; });
  child.unref();
  for (let attempt = 0; attempt < 25; attempt++) {
    await delay(200);
    if (startError) throw startError;
    try { return await openClient(token); } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED' && error.message !== 'fetch failed') throw error;
    }
  }
  throw new Error('The local MCP service did not start.');
}

export async function runPlugin() {
  const mcp = createMcp(async (name, args) => {
    let client;
    try {
      client = await connectService();
      return await client.callTool({ name, arguments: args }, undefined, { timeout: 65000 });
    } catch {
      return toolError('SERVICE_UNAVAILABLE', 'Run npm run serve in the checkout to diagnose the local service.');
    } finally {
      await client?.close().catch(() => {});
    }
  });
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}
