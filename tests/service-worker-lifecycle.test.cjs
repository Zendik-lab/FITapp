/** @jest-environment node */
const { test, expect, jest: jestMock } = require('@jest/globals');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const current = 'bbbbbbbbbbbbbbbbbbbb';
const previous = 'aaaaaaaaaaaaaaaaaaaa';

function environment() {
  const handlers = new Map();
  const windows = [{ id: 'current-window', url: 'https://app.test/profile' }];
  const caches = {
    has: jestMock.fn(async () => true),
    keys: jestMock.fn(async () => [
      `masstracker-app-${previous}`,
      `masstracker-app-${current}`,
    ]),
    delete: jestMock.fn(async () => true),
    open: jestMock.fn(async (key) => ({
      match: async (path) => {
        if (path.includes('/old-') && key.endsWith(current)) return undefined;
        if (path === '/')
          return new Response('<html/>', {
            headers: {
              'X-MassTracker-Predecessors': JSON.stringify([
                `masstracker-app-${previous}`,
              ]),
            },
          });
        return new Response(
          key.endsWith(previous) ? 'previous resource' : 'current resource',
        );
      },
      put: jestMock.fn(),
    })),
  };
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type, callback) => handlers.set(type, callback),
    clients: {
      matchAll: jestMock.fn(async () => [...windows]),
      get: jestMock.fn(async () => windows[0]),
    },
    skipWaiting: jestMock.fn(async () => {}),
  };
  const fetch = jestMock.fn();
  const build = {
    version: current,
    resources: [
      ['/', 'sha256-test'],
      ['/app-shell.css', 'sha256-test'],
    ],
  };
  const source = readFileSync(
    resolve('scripts/service-worker.js'),
    'utf8',
  ).replace('/* @expo-build */ null', JSON.stringify(build));
  runInNewContext(source, {
    self,
    caches,
    fetch,
    Response,
    Request,
    Headers,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  return { handlers, self, caches, windows, fetch };
}

async function message(env, type) {
  let pending;
  const port = { postMessage: jestMock.fn() };
  env.handlers.get('message')({
    data: { type, buildId: current },
    source: { id: 'current-window' },
    ports: [port],
    waitUntil: (work) => {
      pending = work;
    },
  });
  await pending;
  return port;
}

test('проверяет окна после ожидания кеша, включая появившееся во время проверки окно', async () => {
  const env = environment();
  env.caches.open.mockImplementation(async () => ({
    match: async () => {
      if (env.windows.length === 1)
        env.windows.push({
          id: 'late-window',
          url: 'https://app.test/nutrition',
        });
      return new Response('ready');
    },
  }));
  const port = await message(env, 'ACTIVATE_UPDATE');
  expect(port.postMessage).toHaveBeenCalledWith('other-windows');
  expect(env.self.skipWaiting).not.toHaveBeenCalled();
});

test('подтверждение новой сборки сохраняет предшественников при другом работающем окне', async () => {
  const env = environment();
  env.windows.push({ id: 'old-window', url: 'https://app.test/nutrition' });
  await message(env, 'GET_OFFLINE_STATUS');
  expect(env.caches.delete).not.toHaveBeenCalled();
});

test.each([
  [`https://app.test/app-shell.css?app-build=${previous}`, 'previous resource'],
  [
    'https://app.test/_expo/static/js/web/old-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js',
    'previous resource',
  ],
])(
  'ресурс старого документа остаётся в его кеше после смены worker: %s',
  async (url, expected) => {
    const env = environment();
    let response;
    env.handlers.get('fetch')({
      request: new Request(url),
      respondWith: (result) => {
        response = result;
      },
    });
    expect(await (await response).text()).toBe(expected);
    expect(env.fetch).not.toHaveBeenCalled();
  },
);
