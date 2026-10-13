const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

let cachedApiHandler = null;

async function getApiHandler(apiEntryPath) {
  if (cachedApiHandler) return cachedApiHandler;
  try {
    const fileUrl = pathToFileURL(apiEntryPath).href;
    const module = await import(fileUrl);
    cachedApiHandler = module.default;
    return cachedApiHandler;
  } catch (err) {
    console.error('[Electron Server] Failed to load API handler:', err);
    return null;
  }
}

function startServer(distDir, apiEntryPath, preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = decodeURIComponent(parsedUrl.pathname);

        // 1. API Route forwarding
        if (pathname.startsWith('/api')) {
          const handler = await getApiHandler(apiEntryPath);
          if (handler) {
            return await handler(req, res);
          } else {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'API handler unavailable' }));
          }
        }

        // 2. Static File Serving from dist/
        let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname);

        // Security check: ensure path is inside distDir
        const relative = path.relative(distDir, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          res.statusCode = 403;
          return res.end('Forbidden');
        }

        // If file exists and is a file, serve it
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          res.statusCode = 200;
          res.setHeader('Content-Type', mime);
          return fs.createReadStream(filePath).pipe(res);
        }

        // SPA Fallback: serve index.html
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return fs.createReadStream(indexPath).pipe(res);
        }

        res.statusCode = 404;
        res.end('Not Found');
      } catch (err) {
        console.error('[Electron Server Error]:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    server.on('error', (err) => {
      reject(err);
    });

    // Listen strictly on localhost / 127.0.0.1
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' ? address.port : preferredPort;
      const url = `http://127.0.0.1:${actualPort}`;
      resolve({ server, port: actualPort, url });
    });
  });
}

module.exports = { startServer };
