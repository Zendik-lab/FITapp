const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/**
 * @param {string} directory
 * @param {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => boolean} [intercept]
 */
function createStaticServer(directory, intercept = () => false) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    if (await intercept(request, response)) return;
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
      const file = resolve(
        root,
        `.${pathname === '/' ? '/index.html' : pathname}`,
      );
      if (!file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      let body;
      let extension = extname(file);
      try {
        body = await readFile(file);
      } catch {
        if (extension) {
          response.writeHead(404).end();
          return;
        }
        body = await readFile(resolve(root, 'index.html'));
        extension = '.html';
      }
      response
        .writeHead(200, {
          'Content-Type': types[extension] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
        })
        .end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4174);
  createStaticServer(process.argv[2] ?? 'dist').listen(
    port,
    '127.0.0.1',
    () => {
      console.log(`MassTracker: http://127.0.0.1:${port}`);
    },
  );
}

module.exports = { createStaticServer };
