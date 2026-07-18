import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const siteRoot = join(repositoryRoot, '_site');
const port = Number.parseInt(process.env.CODEX_DELEGATION_SITE_PORT ?? '4173', 10);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  let filePath = normalize(join(siteRoot, relativePath));

  if (!filePath.startsWith(`${siteRoot}${sep}`) && filePath !== siteRoot) {
    response.writeHead(400).end('Bad request');
    return;
  }

  try {
    const metadata = await stat(filePath);
    if (metadata.isDirectory()) filePath = join(filePath, 'index.html');
    await stat(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(join(siteRoot, '404.html')).pipe(response);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${siteRoot} at http://127.0.0.1:${port}`);
});
