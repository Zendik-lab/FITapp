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
  '/index.html',
]);
const diagnosticCache = 'masstracker-diagnostics';
const failurePath = '/__masstracker_install_failure__';

function errorText(error) {
  return `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
}

function validateMime(path, response) {
  const expected =
    path === '/'
      ? /text\/html/i
      : path.endsWith('.js')
        ? /(?:application|text)\/(?:x-)?javascript/i
        : path.endsWith('.css')
          ? /text\/css/i
          : path.endsWith('.webmanifest')
            ? /application\/(?:manifest\+)?json/i
            : path.endsWith('.json')
              ? /application\/json/i
              : /\.(png|svg|jpg|jpeg|webp|ico)$/.test(path)
                ? /image\//i
                : undefined;
  const type = response.headers.get('content-type') ?? '';
  if (expected && !expected.test(type))
    throw new Error(`Неверный MIME ${type || '(отсутствует)'}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

async function precache() {
  try {
    // Capture predecessors before this install. A successor may already be
    // installing when this worker later leaves the waiting state.
    const previous = (await caches.keys()).filter(
      (key) => /^masstracker-app-[a-f0-9]{20}$/.test(key) && key !== cacheName,
    );
    await fillCache();
    await setShellHeader(
      'X-MassTracker-Predecessors',
      JSON.stringify(previous),
    );
    // A successful retry invalidates only this build's earlier failure.
    // Diagnostic bookkeeping must not turn a complete install into a failure.
    try {
      if (await caches.has(diagnosticCache)) {
        const diagnostics = await caches.open(diagnosticCache);
        const failure = await diagnostics.match(failurePath);
        if (failure && (await failure.json()).buildId === build.version)
          await diagnostics.delete(failurePath);
      }
    } catch (error) {
      console.warn(
        '[MassTracker] Не удалось очистить старую ошибку установки',
        error,
      );
    }
  } catch (error) {
    // Failed workers cannot answer messages. Preserve the actual installation
    // failure separately from resource caches, never in the user's database.
    await Promise.allSettled([
      caches.delete(cacheName),
      (async () => {
        const diagnostics = await caches.open(diagnosticCache);
        await diagnostics.put(
          failurePath,
          new Response(
            JSON.stringify({
              buildId: build.version,
              error: errorText(error),
              occurredAt: new Date().toISOString(),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      })(),
    ]);
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
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          validateMime(path, response);
          await cache.put(path, response);
        } catch (error) {
          throw new Error(
            `Не удалось кешировать ${path}: ${errorText(error)}. Проверьте доступность ресурса и целостность публикации.`,
          );
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
  const present = await Promise.all(
    [...resources.keys()].map(async (path) => Boolean(await cache.match(path))),
  );
  return {
    type: 'OFFLINE_STATUS',
    ready: present.every(Boolean),
    version: build.version,
    resources: resources.size,
    cached: present.filter(Boolean).length,
  };
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await fillCache();
      await self.clients.claim();
    })(),
  );
});

async function removeOldResourceCaches() {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  if (windows.filter(({ url }) => isAppRoute(new URL(url).pathname)).length > 1)
    return;
  const shell = await fromBuild(shellPath);
  const previous = JSON.parse(
    shell?.headers.get('X-MassTracker-Predecessors') ?? '[]',
  );
  await Promise.all(
    previous
      .filter(
        (key) =>
          typeof key === 'string' &&
          /^masstracker-app-[a-f0-9]{20}$/.test(key) &&
          key !== cacheName,
      )
      .map((key) => caches.delete(key)),
  );
  if (previous.length) await setShellHeader('X-MassTracker-Predecessors', '[]');
}

async function setShellHeader(name, value) {
  const cache = await caches.open(cacheName);
  const shell = await cache.match(shellPath);
  if (!shell) return;
  const headers = new Headers(shell.headers);
  headers.set(name, value);
  await cache.put(
    shellPath,
    new Response(await shell.arrayBuffer(), {
      status: shell.status,
      statusText: shell.statusText,
      headers,
    }),
  );
}

self.addEventListener('message', (event) => {
  if (
    event.data?.type === 'CONFIRM_APP_READY' &&
    event.data.buildId === build.version &&
    event.source?.id
  ) {
    event.waitUntil(
      (async () => {
        if (
          (await offlineStatus()).ready &&
          (await self.clients.get(event.source.id))
        ) {
          await removeOldResourceCaches();
        }
      })(),
    );
    return;
  }
  if (
    event.ports[0] &&
    ['GET_OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(event.data?.type)
  ) {
    event.waitUntil(
      (async () => {
        try {
          if (event.data.type === 'PREPARE_OFFLINE') await fillCache();
          const status = await offlineStatus();
          event.ports[0].postMessage(status);
          // Cache readiness is not proof that the application restored its data.
          // Only CONFIRM_APP_READY may retire predecessors after profile load.
        } catch (error) {
          // Repair must never delete a working cache or touch IndexedDB.
          event.ports[0].postMessage({
            type: 'OFFLINE_STATUS',
            ready: false,
            version: build.version,
            error: errorText(error),
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
      if (!(await offlineStatus()).ready) {
        event.ports[0].postMessage('not-ready');
        return;
      }
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

  if (url.pathname === '/version.json') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate' && isAppRoute(url.pathname)) {
    event.respondWith(navigate());
  } else if (
    (!url.search || /^\?app-build=[a-f0-9]{20}$/.test(url.search)) &&
    !request.headers.has('range') &&
    (resources.has(url.pathname) ||
      /[a-f0-9]{32}\.[a-z0-9]+$/i.test(url.pathname))
  ) {
    event.respondWith(
      resourceForDocument(url).then(async (response) => {
        if (response) return response;
        if (
          !resources.has(url.pathname) ||
          (url.searchParams.has('app-build') &&
            url.searchParams.get('app-build') !== build.version)
        )
          throw new Error(
            `Resource belongs to a different PWA build: ${url.pathname}`,
          );
        const verified = await fetch(
          new Request(url.pathname, {
            cache: 'no-store',
            redirect: 'error',
            integrity: resources.get(url.pathname),
          }),
        );
        if (!verified.ok)
          throw new Error(`PWA resource unavailable: ${url.pathname}`);
        const cache = await caches.open(cacheName);
        await cache.put(url.pathname, verified.clone());
        return verified;
      }),
    );
  }
});

async function resourceForDocument(url) {
  const version = url.searchParams.get('app-build');
  if (version && version !== build.version) {
    if (!(await caches.has(`${cachePrefix}${version}`))) return undefined;
    return (await caches.open(`${cachePrefix}${version}`)).match(url.pathname);
  }
  const current = await fromBuild(url.pathname);
  if (current || resources.has(url.pathname)) return current;
  // Content-hashed resources are immutable. Keep old running windows usable
  // during the narrow race between the activation check and clients.claim().
  for (const key of await caches.keys()) {
    if (!/^masstracker-app-[a-f0-9]{20}$/.test(key) || key === cacheName)
      continue;
    const response = await (await caches.open(key)).match(url.pathname);
    if (response) return response;
  }
}

async function fromBuild(path) {
  const cache = await caches.open(cacheName);
  return cache.match(path);
}

async function navigate() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    // Network first, but never hand an old worker a newer shell. SRI pins the
    // network HTML to this build, just like JS, CSS and the offline fallback.
    const response = await fetch(
      new Request(shellPath, {
        cache: 'no-store',
        redirect: 'error',
        integrity: resources.get(shellPath),
        signal: controller.signal,
      }),
    );
    if (!response.ok) throw new Error(`HTML unavailable: ${response.status}`);
    if (!(await fromBuild(shellPath))) {
      const cache = await caches.open(cacheName);
      await cache.put(shellPath, response.clone());
    }
    return response;
  } catch {
    const shell = await fromBuild(shellPath).catch(() => undefined);
    if (shell) return shell;
    return new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MassTracker</title><main><h1>MassTracker</h1><p>Подключитесь к интернету, чтобы заново загрузить приложение.</p><a href="/">Повторить</a></main></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
