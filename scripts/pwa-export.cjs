/* global __dirname */
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

function listFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // _expo contains required chunks; other underscored files are host config.
    if (
      entry.name.startsWith('.') ||
      (!prefix && entry.name.startsWith('_') && entry.name !== '_expo')
    )
      return [];
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      return listFiles(join(directory, entry.name), `${path}/`);
    return /(?:^|\/)(?:sw.js|precache-manifest.json|metadata.json)$|\.map$/.test(
      path,
    )
      ? []
      : [path];
  });
}

function resourceUrl(path) {
  return path === 'index.html'
    ? '/'
    : '/' +
        path
          .split('/')
          .map((part) => encodeURIComponent(part).replaceAll('%40', '@'))
          .join('/');
}

function validateReferences(files) {
  const origin = 'https://masstracker.invalid';
  function check(reference, parent) {
    if (/^(data:|#)/.test(reference)) return;
    const url = new URL(reference, origin + parent);
    if (url.origin !== origin)
      throw new Error(`Critical external resource: ${reference}`);
    if (!files.has(url.pathname))
      throw new Error(`Missing PWA resource: ${reference} in ${parent}`);
  }
  const html = files.get('/')?.toString();
  if (!html || !/<script\b[^>]*\bsrc=/.test(html))
    throw new Error('Missing exported HTML or entry script');
  for (const [, reference] of html.matchAll(
    /<(?:script|link|img|source)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g,
  ))
    check(reference, '/');
  for (const [url, bytes] of files) {
    if (url.endsWith('.css')) {
      for (const [, reference] of bytes
        .toString()
        .matchAll(/url\(["']?([^\s)'"\s]+)["']?\)/g))
        check(reference, url);
    }
  }
  const manifest = files.get('/manifest.webmanifest');
  if (manifest) {
    for (const icon of JSON.parse(manifest).icons ?? [])
      check(icon.src, '/manifest.webmanifest');
  }
}

function generateServiceWorker(directory) {
  const files = new Map(
    listFiles(directory)
      .sort()
      .map((path) => [resourceUrl(path), readFileSync(join(directory, path))]),
  );
  validateReferences(files);
  const worker = readFileSync(join(__dirname, 'service-worker.js'), 'utf8');
  const hash = createHash('sha256').update(worker);
  const resources = [...files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([url, bytes]) => {
      hash.update(url).update('\0').update(bytes).update('\0');
      return [
        url,
        `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      ];
    });
  const build = { version: hash.digest('hex').slice(0, 20), resources };
  writeFileSync(
    join(directory, 'sw.js'),
    worker.replace('/* @expo-build */ null', JSON.stringify(build)),
  );
  writeFileSync(
    join(directory, 'precache-manifest.json'),
    JSON.stringify(build, null, 2) + '\n',
  );
  return build;
}

module.exports = { generateServiceWorker };
