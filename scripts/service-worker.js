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
    await fillCache();
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

// Bounded concurrency limits memory use on iPhone. Integrity also rejects a
// Cloudflare SPA fallback masquerading as a missing JS/image with HTTP 200.
async function fillCache() {
  const cache = await caches.open(cacheName);
  const missing = [];
  for (const resource of build.resources) {
    if (!(await cache.match(resource[0]))) missing.push(resource);
  }
  for (let index = 0; index < missing.length; index += 6) {
    const results = await Promise.allSettled(
      missing.slice(index, index + 6).map(async ([path, integrity]) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetch(
            new Request(path, {
              cache: 'reload',
              redirect: 'error',
              integrity,
              signal: controller.signal,
            }),
          );
          if (!response.ok)
            throw new Error(`PWA resource unavailable: ${path}`);
          await cache.put(path, response);
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

async function offlineStatus() {
  const cache = await caches.open(cacheName);
  const ready = (
    await Promise.all(
      [...resources.keys()].map(async (path) =>
        Boolean(await cache.match(path)),
      ),
    )
  ).every(Boolean);
  return {
    type: 'OFFLINE_STATUS',
    ready,
    version: build.version,
    resources: resources.size,
  };
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              /^masstracker-app-[a-f0-9]{20}$/.test(key) && key !== cacheName,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (
    event.ports[0] &&
    ['GET_OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(event.data?.type)
  ) {
    event.waitUntil(
      (async () => {
        try {
          if (event.data.type === 'PREPARE_OFFLINE') await fillCache();
          event.ports[0].postMessage(await offlineStatus());
        } catch {
          // Repair must never delete a working cache or touch IndexedDB.
          event.ports[0].postMessage({
            type: 'OFFLINE_STATUS',
            ready: false,
            version: build.version,
          });
        }
      })(),
    );
    return;
  }
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
