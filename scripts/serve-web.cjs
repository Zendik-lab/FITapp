const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { readFileSync, existsSync } = require('node:fs');
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
 * @param {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => boolean | Promise<boolean>} [intercept]
 */
function createStaticServer(directory, intercept = () => false) {
  const root = resolve(directory);
  const custom404 = existsSync(resolve(root, '404.html'));
  const redirects = resolve(root, '_redirects');
  const rewrites = new Map(
    (existsSync(redirects) ? readFileSync(redirects, 'utf8') : '')
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter(
        ([source, target, status]) =>
          source.startsWith('/') && target?.startsWith('/') && status === '200',
      )
      .map(([source, target]) => [source, target]),
  );
  // Mirror Pages' ordered _headers rules, including detach before override.
  // This lets browser tests verify actual response headers of the export.
  const rules = [];
  for (const line of readFileSync(resolve(root, '_headers'), 'utf8').split(
    /\r?\n/,
  )) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line
        .trim()
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      rules.push({ pattern: new RegExp(`^${pattern}$`), headers: [] });
    } else if (rules.length) rules[rules.length - 1].headers.push(line.trim());
  }
  return createServer(async (request, response) => {
    if (await intercept(request, response)) return;
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
      const file = resolve(
        root,
        `.${rewrites.get(pathname) ?? (pathname === '/' ? '/index.html' : pathname)}`,
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
        if (custom404 || extension) {
          response
            .writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
            .end(
              custom404
                ? await readFile(resolve(root, '404.html'))
                : 'Not found',
            );
          return;
        }
        body = await readFile(resolve(root, 'index.html'));
        extension = '.html';
      }
      response
        .writeHead(200, {
          'content-type': types[extension] ?? 'application/octet-stream',
          ...responseHeaders(pathname, rules),
        })
        .end(body);
    } catch {
      response.writeHead(500).end();
    }
  });
}

function responseHeaders(pathname, rules) {
  const headers = {};
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const line of rule.headers) {
      if (line.startsWith('! ')) delete headers[line.slice(2).toLowerCase()];
      else {
        const colon = line.indexOf(':');
        if (colon < 1) continue;
        const name = line.slice(0, colon).toLowerCase();
        const value = line.slice(colon + 1).trim();
        headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
      }
    }
  }
  return headers;
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
