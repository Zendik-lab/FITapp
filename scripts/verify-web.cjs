const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { readFile } = require('node:fs/promises');
const { resolve, sep, extname } = require('node:path');
const { verifyCatalogAssets } = require('./catalog-assets.cjs');

const routes = ['/nutrition', '/workouts', '/progress', '/profile'];
const mimeTypes = {
  '.html': /text\/html/i,
  '.js': /(?:application|text)\/(?:x-)?javascript/i,
  '.css': /text\/css/i,
  '.json': /application\/json/i,
  '.webmanifest': /application\/manifest\+json/i,
};

// Verify the exact directory being published, or actual HTTP responses after
// publication. Never regenerate metadata here: that would bless mixed bytes.
async function verifyWebBuild(target = 'dist') {
  const remote = /^https?:\/\//.test(target);
  const root = remote ? new URL(target).origin : resolve(target);
  async function load(path) {
    if (!remote) {
      const file = resolve(
        root,
        '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)),
      );
      if (!file.startsWith(root + sep))
        throw new Error(`Invalid build resource: ${path}`);
      try {
        return await readFile(file);
      } catch (cause) {
        throw new Error(`Missing build file: ${path}`, { cause });
      }
    }
    const response = await fetch(root + path, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    const type = response.headers.get('content-type') ?? '';
    const expected =
      mimeTypes[extname(path)] ??
      (path === '/' || routes.includes(path.replace(/\/$/, ''))
        ? /text\/html/i
        : undefined);
    if (expected ? !expected.test(type) : /text\/html/i.test(type))
      throw new Error(`Invalid MIME ${type}: ${path}`);
    if (
      ['/sw.js', '/version.json', '/precache-manifest.json'].includes(path) &&
      !/no-store/i.test(response.headers.get('cache-control') ?? '')
    )
      throw new Error(`Missing no-store cache policy: ${path}`);
    return Buffer.from(await response.arrayBuffer());
  }
  async function json(path) {
    try {
      return JSON.parse((await load(path)).toString());
    } catch (cause) {
      throw new Error(`Invalid build metadata: ${path}: ${cause.message}`, {
        cause,
      });
    }
  }
  const info = await json('/version.json');
  const manifest = await json('/precache-manifest.json');
  if (
    !/^[a-f0-9]{20}$/.test(info.buildId) ||
    typeof info.appVersion !== 'string' ||
    !info.appVersion ||
    info.buildId !== manifest.version ||
    info.appVersion !== manifest.appVersion
  )
    throw new Error(
      'Build metadata does not identify the same production build',
    );
  const worker = (await load('/sw.js')).toString();
  const expectedWorker = (
    await readFile(require.resolve('./service-worker.js'), 'utf8')
  ).replace('/* @expo-build */ null', JSON.stringify(manifest));
  if (worker !== expectedWorker)
    throw new Error(
      'sw.js does not match this checkout and precache-manifest.json',
    );
  if (!Array.isArray(manifest.resources) || !manifest.resources.length)
    throw new Error('Empty precache resources');
  const paths = new Set();
  for (const resource of manifest.resources) {
    if (
      !Array.isArray(resource) ||
      resource.length !== 2 ||
      typeof resource[0] !== 'string' ||
      !/^\/(?!\/)/.test(resource[0]) ||
      /[?#]|(?:^|\/)\.\.(?:\/|$)/.test(resource[0]) ||
      !/^sha256-[A-Za-z0-9+/]{43}=$/.test(resource[1]) ||
      paths.has(resource[0])
    )
      throw new Error('Invalid or duplicate precache resource');
    const [path, expected] = resource;
    paths.add(path);
    const bytes = await load(path);
    if (
      `sha256-${createHash('sha256').update(bytes).digest('base64')}` !==
      expected
    )
      throw new Error(`Build integrity mismatch: ${path}`);
  }
  for (const required of ['/', '/manifest.webmanifest'])
    if (!paths.has(required))
      throw new Error(`Missing build file: ${required}`);
  await verifyCatalogAssets(paths, load);
  const html = (await load('/')).toString();
  if (
    !html.includes(`<meta name="app-build" content="${info.buildId}">`) ||
    !html.includes(`<meta name="app-version" content="${info.appVersion}">`)
  )
    throw new Error('HTML does not match production build metadata');
  const webmanifest = await json('/manifest.webmanifest');
  if (
    webmanifest.id !== '/' ||
    webmanifest.scope !== '/' ||
    webmanifest.start_url !== '/' ||
    webmanifest.display !== 'standalone'
  )
    throw new Error('Unexpected Web App Manifest identity, scope or display');
  if (remote) {
    for (const route of routes.flatMap((path) => [path, path + '/']))
      if (!(await load(route)).equals(await load('/')))
        throw new Error(
          `Route does not return the current app shell: ${route}`,
        );
    for (const path of [
      '/__masstracker_missing__.js',
      '/__masstracker_missing__.json',
      '/__masstracker_missing_route__',
    ]) {
      const response = await fetch(root + path, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      await response.arrayBuffer();
      if (response.status !== 404)
        throw new Error(`Missing resource must return HTTP 404: ${path}`);
    }
  } else {
    await load('/404.html');
    await load('/_headers');
    const rewrites = (await load('/_redirects')).toString().split(/\r?\n/);
    for (const route of routes.flatMap((path) => [path, path + '/']))
      if (
        !rewrites.some(
          (line) =>
            line.trim().split(/\s+/).join(' ') === `${route} /index.html 200`,
        )
      )
        throw new Error(`Missing Cloudflare Pages rewrite: ${route}`);
  }
  return {
    buildId: info.buildId,
    appVersion: info.appVersion,
    resources: paths.size,
  };
}

if (require.main === module) {
  verifyWebBuild(process.argv[2]).then(
    (info) =>
      console.log(
        `Verified PWA ${info.appVersion} (${info.buildId}): ${info.resources} resources.`,
      ),
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}

module.exports = { verifyWebBuild };
