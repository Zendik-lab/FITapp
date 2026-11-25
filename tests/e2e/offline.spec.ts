import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createStaticServer } from '../../scripts/serve-web.cjs';
import { generateServiceWorker } from '../../scripts/pwa-export.cjs';

type Site = {
  url: string;
  root: string;
  failWorker: boolean;
  workerFailures: number;
  corruptResource: string;
  deploy: (label: string) => string;
};

// The server can fail a real SW request; browser routing cannot intercept SW fetches.
const test = base.extend<{ site: Site }>({
  site: async ({ baseURL }, provide) => {
    void baseURL;
    const root = mkdtempSync(join(resolve('.expo'), 'offline-test-'));
    const output = join(root, 'site');
    cpSync('dist', output, { recursive: true });
    const site: Site = {
      url: '',
      root,
      failWorker: false,
      workerFailures: 0,
      corruptResource: '',
      deploy(label) {
        const file = join(output, 'index.html');
        writeFileSync(
          file,
          readFileSync(file, 'utf8').replace(
            /<title>.*?<\/title>/,
            `<title>MassTracker ${label}</title>`,
          ),
        );
        return generateServiceWorker(output).version;
      },
    };
    const server = createStaticServer(output, (req, res) => {
      if (site.failWorker && req.url === '/sw.js') {
        site.workerFailures += 1;
        res.writeHead(503).end('Temporary failure');
        return true;
      }
      if (site.corruptResource && req.url === site.corruptResource) {
        res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end('<html>SPA fallback instead of asset</html>');
        return true;
      }
      return false;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test server');
    site.url = `http://127.0.0.1:${address.port}`;
    try {
      await provide(site);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!root.startsWith(resolve('.expo') + sep))
        throw new Error('Unsafe test cleanup path');
      rmSync(root, { recursive: true, force: true });
    }
  },
});

async function ready(page: Page) {
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
}

async function setting(page: Page, key: string, value?: string) {
  return page.evaluate(
    ({ key, value }) =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('masstracker', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            'app_settings',
            value === undefined ? 'readonly' : 'readwrite',
          );
          const store = transaction.objectStore('app_settings');
          const operation =
            value === undefined
              ? store.get(key)
              : store.put({
                  key,
                  value,
                  updatedAt: '2026-11-26T00:00:00.000Z',
                });
          let result: string | null = null;
          operation.onsuccess = () => {
            result =
              value ??
              (operation.result as { value?: string } | undefined)?.value ??
              null;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { key, value },
  );
}

async function selectTheme(page: Page, label: string) {
  await page.getByRole('button', { name: /^Внешний вид,/ }).click();
  await page.getByRole('radio', { name: label, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Внешний вид, ${label}`, exact: true }),
  ).toBeVisible();
}

test('все пять вкладок, reload, повторное открытие и настройки работают без сети', async ({
  page,
  context,
  site,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const external: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith(site.url)) external.push(request.url());
  });
  await page.goto(`${site.url}/profile`);
  await ready(page);
  const status = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const cache = (await caches.keys()).find((key) =>
      key.startsWith('masstracker-app-'),
    );
    return {
      scope: registration?.scope,
      state: registration?.active?.state,
      count: cache ? (await (await caches.open(cache)).keys()).length : 0,
    };
  });
  expect(status.scope).toBe(`${site.url}/`);
  expect(status.state).toBe('activated');
  const manifest = (await (
    await page.request.get(`${site.url}/precache-manifest.json`)
  ).json()) as { resources: [string, string][] };
  expect(status.count).toBe(manifest.resources.length);
  await setting(page, 'offline_check', 'retained');
  await selectTheme(page, 'Тёмная');
  await context.setOffline(true);
  for (const label of [
    'Сегодня',
    'Питание',
    'Тренировки',
    'Прогресс',
    'Профиль',
  ]) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(
      page.getByRole('tab', { name: label, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Офлайн', { exact: true }).first(),
    ).toBeVisible();
  }
  for (const path of [
    '/',
    '/nutrition',
    '/workouts',
    '/progress',
    '/profile?offline=1',
    '/profile/',
  ]) {
    await page.goto(site.url + path);
    await expect(
      page.getByRole('tab', { name: 'Сегодня', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Офлайн', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  }
  await selectTheme(page, 'Светлая');
  await page.reload();
  await ready(page);
  expect(await setting(page, 'theme_mode')).toBe('light');
  expect(await setting(page, 'offline_check')).toBe('retained');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${site.url}/profile`);
  await ready(reopened);
  await expect(
    reopened.getByRole('button', { name: 'Внешний вид, Светлая', exact: true }),
  ).toBeVisible();
  expect(await setting(reopened, 'offline_check')).toBe('retained');
  await context.setOffline(false);
  await expect(reopened.getByText('Офлайн', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('обновление ждёт второе окно и сохраняет IndexedDB и чужие кеши', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await selectTheme(page, 'Тёмная');
  await setting(page, 'offline_check', 'retained');
  await page.evaluate(async () => {
    await caches.open('unrelated-cache');
  });
  const other = await context.newPage();
  await other.goto(`${site.url}/profile`);
  await ready(other);
  const version = site.deploy('updated');
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(
    page.getByText('Закройте другие окна MassTracker и повторите обновление.', {
      exact: true,
    }),
  ).toBeVisible();
  await other.close();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker updated');
  await ready(page);
  expect(await setting(page, 'theme_mode')).toBe('dark');
  expect(await setting(page, 'offline_check')).toBe('retained');
  expect(await page.evaluate(async () => caches.keys())).toEqual(
    expect.arrayContaining([`masstracker-app-${version}`, 'unrelated-cache']),
  );
  expect(
    (await page.evaluate(async () => caches.keys())).filter((key) =>
      key.startsWith('masstracker-app-'),
    ),
  ).toHaveLength(1);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await setting(page, 'offline_check')).toBe('retained');
});

test('повреждённый ресурс отклоняет обновление и оставляет прежнюю версию', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await setting(page, 'offline_check', 'retained');
  const previous = await page.evaluate(async () => caches.keys());
  site.deploy('broken');
  site.corruptResource = '/app-shell.css';
  const installed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('Missing registration');
    const result = new Promise<string>((resolve) =>
      registration.addEventListener(
        'updatefound',
        () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' || worker.state === 'redundant')
              resolve(worker.state);
          });
        },
        { once: true },
      ),
    );
    await registration.update();
    return result;
  });
  expect(installed).toBe('redundant');
  expect(await page.evaluate(async () => caches.keys())).toEqual(previous);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await page.title()).toBe('MassTracker');
  expect(await setting(page, 'offline_check')).toBe('retained');
});

test('холодный запуск после полного перезапуска браузера сохраняет приложение и данные', async ({
  browser,
  browserName,
  site,
}) => {
  const profile = join(site.root, 'browser-profile');
  const options = {
    headless: true,
    channel:
      browserName === 'chromium'
        ? process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
        : undefined,
  };
  let persistent = await browser
    .browserType()
    .launchPersistentContext(profile, options);
  try {
    let page = persistent.pages()[0] ?? (await persistent.newPage());
    await page.goto(`${site.url}/profile`);
    await ready(page);
    await selectTheme(page, 'Тёмная');
    await setting(page, 'offline_check', 'retained');
    await persistent.close();
    persistent = await browser
      .browserType()
      .launchPersistentContext(profile, { ...options, offline: true });
    page = persistent.pages()[0] ?? (await persistent.newPage());
    await page.goto(`${site.url}/profile`);
    await ready(page);
    await expect(page.getByText('Офлайн', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Внешний вид, Тёмная', exact: true }),
    ).toBeVisible();
    expect(await setting(page, 'offline_check')).toBe('retained');
  } finally {
    await persistent.close();
  }
});

test('не объявляет готовность после потери ресурса кеша', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) =>
      key.startsWith('masstracker-app-'),
    );
    if (!name) throw new Error('Missing app cache');
    await (await caches.open(name)).delete('/app-shell.css');
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Внешний вид', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () =>
      Boolean(await caches.match('/app-shell.css')),
    ),
  ).toBe(true);
});

test('не подтверждает незавершённый precache и повторяет установку после сбоя ресурса', async ({
  page,
  context,
  site,
}) => {
  site.corruptResource = '/app-shell.css';
  await page.goto(`${site.url}/profile`);
  await expect(
    page.getByRole('button', { name: 'Подготовить офлайн-режим', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(false);
  await context.setOffline(true);
  site.corruptResource = '';
  await context.setOffline(false);
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
});

test('при потере HTML возвращает понятный offline fallback без вечной загрузки', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('masstracker-app-'))
        await (await caches.open(name)).delete('/');
    }
  });
  await context.setOffline(true);
  const response = await page.goto(`${site.url}/profile`);
  expect(response?.status()).toBe(503);
  await expect(
    page.getByText(
      'Подключитесь к интернету, чтобы заново загрузить приложение.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Повторить', exact: true }),
  ).toBeVisible();
});

test('повторяет неудачную первую регистрацию после возвращения сети', async ({
  page,
  context,
  site,
}) => {
  site.failWorker = true;
  await page.goto(`${site.url}/profile`);
  await expect(page.getByText('Внешний вид', { exact: true })).toBeVisible();
  await expect.poll(() => site.workerFailures).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Подготовить офлайн-режим', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  site.failWorker = false;
  await context.setOffline(false);
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
});
