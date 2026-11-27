/* global __dirname */
const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
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
    if (prefix.startsWith('catalog/') && path !== 'catalog/manifest.json')
      return [];
    if (entry.isDirectory())
      return listFiles(join(directory, entry.name), `${path}/`);
    return /(?:^|\/)(?:sw.js|version.json|precache-manifest.json|metadata.json|404.html)$|\.map$/.test(
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

function generateServiceWorker(directory, { buildId } = {}) {
  const appVersion = require('../package.json').version;
  const files = new Map(
    listFiles(directory)
      .sort()
      .map((path) => [resourceUrl(path), readFileSync(join(directory, path))]),
  );
  // Remove our own metadata before hashing so regeneration is deterministic.
  const html = files
    .get('/')
    ?.toString()
    .replace(/<meta name="app-(?:build|version)" content="[^"]*">/g, '')
    .replace(/\?app-build=[a-f0-9]{20}/g, '');
  if (html) files.set('/', Buffer.from(html));
  validateReferences(files);
  const worker = readFileSync(join(__dirname, 'service-worker.js'), 'utf8');
  const hash = createHash('sha256').update(worker);
  for (const [url, bytes] of files)
    hash.update(url).update('\0').update(bytes).update('\0');
  const version = buildId ?? hash.digest('hex').slice(0, 20);
  if (!/^[a-f0-9]{20}$/.test(version)) throw new Error('Invalid build ID');
  const metadata = `<meta name="app-build" content="${version}"><meta name="app-version" content="${appVersion}">`;
  const withMetadata = /<head\b[^>]*>/.test(html)
    ? html.replace(/<head\b[^>]*>/, (head) => head + metadata)
    : metadata + html;
  // Stable URLs such as app-shell.css must select the document's resource
  // cache even if another window activates a newer worker mid-navigation.
  const stampedHtml = withMetadata.replace(
    /<(?:script|link|img|source)\b[^>]*>/g,
    (tag) =>
      tag.replace(
        /((?:src|href)=["'])(\/[^"'?#]+)(["'])/g,
        (reference, prefix, path, suffix) =>
          /[a-f0-9]{32}\.[a-z0-9]+$/i.test(path)
            ? reference
            : `${prefix}${path}?app-build=${version}${suffix}`,
      ),
  );
  writeFileSync(join(directory, 'index.html'), stampedHtml);
  files.set('/', Buffer.from(stampedHtml));
  const resources = [...files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([url, bytes]) => {
      return [
        url,
        `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      ];
    });
  const build = { version, appVersion, resources };
  writeFileSync(
    join(directory, 'version.json'),
    JSON.stringify({ buildId: version, appVersion }) + '\n',
  );
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
