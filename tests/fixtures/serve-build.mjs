import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Serve one unchanged build at both paths, without Vite's development rewrites
// or an HTML fallback that could conceal missing assets.
const directory = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/tb-web-anim') {
      response.writeHead(301, { Location: '/tb-web-anim/' }).end();
      return;
    }
    if (pathname.startsWith('/tb-web-anim/')) pathname = pathname.slice('/tb-web-anim'.length);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(directory, `.${pathname}`);
    if (!file.startsWith(`${directory}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' }).end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(5175, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
