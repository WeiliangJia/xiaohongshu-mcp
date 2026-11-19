import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcp } from './tools.mjs';

export function httpServer(token, callTool) {
  const expected = Buffer.from(`Bearer ${token}`);
  return createServer(async (request, response) => {
    const authority = `127.0.0.1:${request.socket.localPort}`;
    if (request.headers.host !== authority ||
        (request.headers.origin && request.headers.origin !== `http://${authority}`)) {
      response.writeHead(403).end();
      return;
    }
    if (request.url !== '/mcp') {
      response.writeHead(404).end();
      return;
    }
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    const mcp = createMcp(callTool);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.once('close', () => void mcp.close().catch(() => {}));
    try {
      await mcp.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500).end();
      else if (!response.writableEnded) response.destroy();
    }
  });
}
