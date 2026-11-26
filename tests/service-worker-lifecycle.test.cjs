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
    Request: class extends Request {
      constructor(input, init) {
        super(
          typeof input === 'string'
            ? new URL(input, self.location.origin)
            : input,
          init,
        );
      }
    },
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
  await message(env, 'CONFIRM_APP_READY');
  expect(env.caches.delete).not.toHaveBeenCalled();
});

test('проверка кеша до успешного чтения профиля не удаляет рабочую предыдущую сборку', async () => {
  const env = environment();
  await message(env, 'GET_OFFLINE_STATUS');
  expect(env.caches.delete).not.toHaveBeenCalled();
});

test('очистка предшественника требует подтверждения успешного запуска приложения', async () => {
  const env = environment();
  await message(env, 'CONFIRM_APP_READY');
  expect(env.caches.delete).toHaveBeenCalledWith(`masstracker-app-${previous}`);
  expect(env.caches.delete).not.toHaveBeenCalledWith(
    `masstracker-app-${current}`,
  );
});

test('ошибка ремонта кеша содержит конкретный ресурс и сохраняет рабочую версию', async () => {
  const env = environment();
  env.caches.open.mockImplementation(async () => ({
    match: async (path) =>
      path === '/app-shell.css' ? undefined : new Response('shell'),
    put: jestMock.fn(),
  }));
  env.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  const port = await message(env, 'PREPARE_OFFLINE');
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: false,
      error: expect.stringContaining('/app-shell.css'),
    }),
  );
  expect(env.caches.delete).not.toHaveBeenCalled();
});

test('отклоняет правильные байты CSS с HTML MIME, сохраняя рабочие кеши', async () => {
  const env = environment();
  env.caches.open.mockImplementation(async () => ({
    match: async (path) =>
      path === '/app-shell.css' ? undefined : new Response('shell'),
    put: jestMock.fn(),
  }));
  env.fetch.mockResolvedValue(
    new Response('body {}', { headers: { 'Content-Type': 'text/html' } }),
  );
  const port = await message(env, 'PREPARE_OFFLINE');
  expect(port.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: false,
      error: expect.stringMatching(/MIME.*app-shell.css|app-shell.css.*MIME/),
    }),
  );
  expect(env.caches.delete).not.toHaveBeenCalled();
});

test('успешная повторная установка удаляет прежнюю ошибку этой же сборки', async () => {
  const env = environment();
  const removeFailure = jestMock.fn(async () => true);
  const open = env.caches.open.getMockImplementation();
  env.caches.open.mockImplementation(async (key) =>
    key === 'masstracker-diagnostics'
      ? {
          match: async () =>
            new Response(
              JSON.stringify({ buildId: current, error: 'Previous failure' }),
            ),
          delete: removeFailure,
        }
      : open(key),
  );
  let installed;
  env.handlers.get('install')({
    waitUntil: (pending) => {
      installed = pending;
    },
  });
  await installed;
  expect(removeFailure).toHaveBeenCalledWith(
    '/__masstracker_install_failure__',
  );
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
