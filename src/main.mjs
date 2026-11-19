import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { endpoint, port, readSettings, setup } from './settings.mjs';

async function main() {
  switch (process.argv[2]) {
    case 'setup': {
      const checkout = await realpath(fileURLToPath(new URL('..', import.meta.url)));
      await setup(checkout);
      console.log('已登记本机安装。接下来运行 npm run login。');
      break;
    }
    case 'login': {
      const { login } = await import('./reader.mjs');
      await login();
      break;
    }
    case 'serve': {
      const { token } = await readSettings();
      const [{ httpServer }, { localCaller }, reader] = await Promise.all([
        import('./http.mjs'), import('./tools.mjs'), import('./reader.mjs'),
      ]);
      const server = httpServer(token, localCaller(reader));
      if (process.argv[3] === '--idle-exit') {
        let timer;
        const resetIdleTimer = () => {
          clearTimeout(timer);
          timer = setTimeout(() => server.close(), 300000);
          timer.unref();
        };
        server.on('listening', resetIdleTimer);
        server.on('request', (_request, response) => {
          resetIdleTimer();
          response.once('close', resetIdleTimer);
        });
      }
      server.on('error', error => {
        console.error(error.code === 'EADDRINUSE' ? 'Port 17333 is already in use.' : error.message);
        process.exitCode = 1;
      });
      server.listen(port, '127.0.0.1', () => console.log(`xiaohongshu-mcp: ${endpoint}`));
      break;
    }
    case 'token':
      console.log((await readSettings()).token);
      break;
    default:
      throw new Error('Usage: node src/main.mjs setup|login|serve|token');
  }
}

await main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
