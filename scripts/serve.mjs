/* scripts/serve.mjs — zero-dependency static dev server.
   Usage: node scripts/serve.mjs app 5173
   Binds 127.0.0.1, disables caching, correct MIME types for the app shell. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || 'app');
const port = Number(process.argv[3] || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
    if (rel === '/' || rel === '\\') rel = '/index.html';
    let file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      // SPA-ish fallback for extensionless routes; never for files
      if (!path.extname(file)) file = path.join(root, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('server error');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('Night Sky dev server: http://127.0.0.1:' + port + '/  (root: ' + root + ')');
});
