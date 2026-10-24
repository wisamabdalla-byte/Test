const http = require('http');
const fs = require('fs');
const path = require('path');
const { Store, HttpError } = require('./src/store');
const { buildRoutes } = require('./src/routes');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) reject(new HttpError(413, 'Body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

function createApp(store = new Store()) {
  const sseClients = new Set();
  store.on('event', (evt) => {
    const line = `data: ${JSON.stringify(evt)}\n\n`;
    for (const res of sseClients) res.write(line);
  });

  const routes = buildRoutes(store);

  return http.createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://x');
    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }
    if (!pathname.startsWith('/api/')) return serveStatic(req, res);
    for (const [method, pattern, handler] of routes) {
      const m = pathname.match(pattern);
      if (!m || req.method !== method) continue;
      try {
        const body = method === 'POST' ? await readJson(req) : {};
        return send(res, 200, handler(m.slice(1), body, searchParams));
      } catch (err) {
        if (err instanceof HttpError) return send(res, err.status, { error: err.message });
        console.error(err);
        return send(res, 500, { error: 'Internal server error' });
      }
    }
    send(res, 404, { error: 'Not found' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Mishwar running at http://localhost:${port}`));
}

module.exports = { createApp };
