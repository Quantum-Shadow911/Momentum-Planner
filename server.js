/* Zero-dependency static dev server. Usage: npm start (defaults to port 4173).
   Binds to 127.0.0.1 only — this serves local files and is not meant for the network. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function isInsideRoot(filePath) {
  const rel = path.relative(root, filePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
    return;
  }
  if (urlPath.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
    return;
  }
  const filePath = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!isInsideRoot(filePath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`Momentum planner running at http://${host}:${port}`);
});
