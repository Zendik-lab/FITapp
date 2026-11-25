const build = /* @expo-build */ null;
const cachePrefix = 'masstracker-app-';
const cacheName = `${cachePrefix}${build.version}`;
const resources = new Map(build.resources);
const shellPath = '/';
const appRoutes = new Set([
  '/',
  '/nutrition',
  '/workouts',
  '/progress',
  '/profile',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache() {
  try {
    const cache = await caches.open(cacheName);
    // Validate the whole shell before the worker can take over from a working version.
    const response = await fetch(
      new Request(shellPath, { cache: 'reload', redirect: 'error' }),
    );
    if (!response.ok) throw new Error('MassTracker app shell is unavailable');
    const html = await response.clone().text();
    const scripts = [
      ...html.matchAll(/<script\b[^>]*\bsrc="(\/_expo\/[^"\s]+)"/g),
    ];
    if (!scripts.length || scripts.some(([, path]) => !resources.has(path))) {
      throw new Error(
        'MassTracker build and app shell have different versions',
      );
    }

    await cache.addAll(
      build.resources.map(
        ([path, integrity]) =>
          new Request(path, { cache: 'reload', redirect: 'error', integrity }),
      ),
    );
    await cache.put(shellPath, response);
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (
    event.data?.type !== 'ACTIVATE_UPDATE' ||
    !event.source?.id ||
    !event.ports[0]
  )
    return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const otherAppWindow = windows.some(
        ({ id, url }) =>
          id !== event.source.id && isAppRoute(new URL(url).pathname),
      );
      if (otherAppWindow) event.ports[0].postMessage('other-windows');
      else await self.skipWaiting();
    })(),
  );
});

function isAppRoute(path) {
  return appRoutes.has(path.replace(/\/+$/, '') || '/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && isAppRoute(url.pathname)) {
    event.respondWith(navigate(request));
  } else if (
    !url.search &&
    !request.headers.has('range') &&
    resources.has(url.pathname)
  ) {
    event.respondWith(
      fromBuild(url.pathname)
        .catch(() => undefined)
        .then((response) => response ?? fetch(request)),
    );
  }
});

async function fromBuild(path) {
  const cache = await caches.open(cacheName);
  return cache.match(path);
}

async function navigate(request) {
  const shell = await fromBuild(shellPath).catch(() => undefined);
  if (shell) return shell;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch {
    return new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MassTracker</title><main><h1>MassTracker</h1><p>Подключитесь к интернету, чтобы заново загрузить приложение.</p><a href="/">Повторить</a></main></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
