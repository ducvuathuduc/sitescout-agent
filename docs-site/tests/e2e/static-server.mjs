/**
 * Minimal static server for the exported docs site (`out/`).
 *
 * Used by Playwright's `webServer`. It mirrors Cloudflare Pages URL handling so
 * the tests exercise the same resolution rules as production:
 *
 *   /docs/mcp        -> out/docs/mcp/index.html
 *   /docs/mcp/       -> out/docs/mcp/index.html
 *   /docs/mcp.html   -> out/docs/mcp.html (if it exists)
 *   /llms.txt        -> out/llms.txt
 *   missing          -> out/404.html with status 404
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '..', '..', 'out');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME_TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
  }),
);

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Resolve a request path to a file inside OUT_DIR, or null. */
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const clean = decoded.replace(/\\/g, '/');
  const relative = clean.replace(/^\/+/, '');
  const candidates = [];

  if (relative === '') {
    candidates.push('index.html');
  } else if (clean.endsWith('/')) {
    candidates.push(path.posix.join(relative, 'index.html'), relative);
  } else {
    candidates.push(relative, `${relative}.html`, path.posix.join(relative, 'index.html'));
  }

  for (const candidate of candidates) {
    const full = path.resolve(OUT_DIR, candidate);
    if (full !== OUT_DIR && !full.startsWith(OUT_DIR + path.sep)) continue;
    if (isFile(full)) return full;
  }
  return null;
}

function send(res, status, file, method) {
  const body = fs.readFileSync(file);
  res.writeHead(status, {
    'content-type': MIME_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
    'content-length': body.byteLength,
    'cache-control': 'no-store',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

if (!fs.existsSync(OUT_DIR)) {
  console.error(`[static-server] ${OUT_DIR} does not exist — run "npm run build" first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  const file = resolveFile(req.url ?? '/');
  if (file) {
    send(res, 200, file, method);
    return;
  }

  const notFound = path.join(OUT_DIR, '404.html');
  if (isFile(notFound)) {
    send(res, 404, notFound, method);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
});

server.on('error', (error) => {
  console.error('[static-server]', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[static-server] http://${HOST}:${PORT} -> ${OUT_DIR}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
