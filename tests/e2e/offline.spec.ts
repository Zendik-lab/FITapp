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
import { sampleDraft } from '../fixtures/profile';
import { createHash } from 'node:crypto';

type Site = {
  url: string;
  root: string;
  failWorker: boolean;
  workerFailures: number;
  corruptResource: string;
  htmlRequests: number;
  failVersion: boolean;
  versionRequests: number;
  deployOnWorker: string;
  holdResource: string;
  heldRequests: number;
  releaseResource: () => void;
  deploy: (label: string) => string;
  deployExport: (directory: string) => string;
};

// The server can fail a real SW request; browser routing cannot intercept SW fetches.
const test = base.extend<{ site: Site }>({
  site: async ({ baseURL }, provide) => {
    void baseURL;
    const root = mkdtempSync(join(resolve('.expo'), 'offline-test-'));
    const output = join(root, 'site');
    cpSync(process.env.PWA_INITIAL_BUILD_DIR ?? 'dist', output, {
      recursive: true,
    });
    const site: Site = {
      url: '',
      root,
      failWorker: false,
      workerFailures: 0,
      corruptResource: '',
      htmlRequests: 0,
      failVersion: false,
      versionRequests: 0,
      deployOnWorker: '',
      holdResource: '',
      heldRequests: 0,
      releaseResource: () => {},
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
      deployExport(directory) {
        if (
          !output.startsWith(root + sep) ||
          !root.startsWith(resolve('.expo') + sep)
        )
          throw new Error('Unsafe export swap');
        rmSync(output, { recursive: true, force: true });
        cpSync(directory, output, { recursive: true });
        return (
          JSON.parse(readFileSync(join(output, 'version.json'), 'utf8')) as {
            buildId: string;
          }
        ).buildId;
      },
    };
    const server = createStaticServer(output, (req, res) => {
      if (req.url === site.holdResource) {
        site.heldRequests += 1;
        return new Promise<boolean>((resolve) => {
          site.releaseResource = () => {
            site.holdResource = '';
            resolve(false);
          };
        });
      }
      if (req.url === '/sw.js' && site.deployOnWorker) {
        const label = site.deployOnWorker;
        site.deployOnWorker = '';
        site.deploy(label);
      }
      if (req.url === '/' || req.url === '/profile') site.htmlRequests += 1;
      if (req.url === '/version.json') {
        site.versionRequests += 1;
        if (site.failVersion) {
          res.writeHead(503).end('Unavailable');
          return true;
        }
      }
      if (req.url === '/__test-profile-setup') {
        res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end('<!doctype html><title>Test setup</title>');
        return true;
      }
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
      site.releaseResource();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!root.startsWith(resolve('.expo') + sep))
        throw new Error('Unsafe test cleanup path');
      rmSync(root, { recursive: true, force: true });
    }
  },
});

test('первая подготовка завершает загрузку и подтверждает актуальную версию', async ({
  page,
  site,
}) => {
  site.holdResource = '/app-shell.css';
  await page.goto(`${site.url}/profile`);
  await expect(
    page.getByText('Загружаем обновление…', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => site.heldRequests).toBeGreaterThan(0);
  site.releaseResource();
  await ready(page);
  await expect(
    page.getByText('Установлена актуальная версия.', { exact: true }),
  ).toBeVisible();
});

test('проверяет HTML по сети, предлагает новую сборку и позволяет отложить обновление', async ({
  page,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  const requests = site.htmlRequests;
  await page.reload();
  await ready(page);
  expect(site.htmlRequests).toBeGreaterThan(requests);
  const version = site.deploy('manual-update');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await expect(
    page.getByText('Доступна новая версия', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Обновить', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('update-notice.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Позже', exact: true }).click();
  await expect(
    page.getByText('Доступна новая версия', { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await ready(page);
  // The previous shell stays internally coherent until consent.
  await expect(page).toHaveTitle('MassTracker');
  await expect(
    page.getByText('Доступна новая версия', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker manual-update');
  await ready(page);
  await expect(
    page.getByText(`Сборка ${version}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Обновление успешно установлено.', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath('updated-profile-desktop.png'),
    fullPage: true,
  });
});

test('после офлайн-правок и восстановления сети обновляет профиль и цели без потери данных и повторных reload', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await page.evaluate(() => localStorage.setItem('user-retained', 'yes'));
  await context.setOffline(true);
  await page.getByRole('button', { name: /^Личная информация,/ }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Офлайн Алекс');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await page.getByRole('button', { name: /^Моя цель,/ }).click();
  await page.getByLabel('Целевой вес, кг', { exact: true }).fill('79');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  const saved = await setting(page, 'user_state');
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole('button', {
      name: 'Личная информация, Офлайн Алекс',
      exact: true,
    }),
  ).toBeVisible();
  site.deploy('reconnected');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker reconnected');
  await ready(page);
  expect(await setting(page, 'user_state')).toBe(saved);
  expect(await page.evaluate(() => localStorage.getItem('user-retained'))).toBe(
    'yes',
  );
  let navigations = 0;
  page.on('framenavigated', () => {
    navigations += 1;
  });
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await expect(
    page.getByText('Установлена актуальная версия.', { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(
    page.getByText('Установлена актуальная версия.', { exact: true }),
  ).toBeVisible();
  expect(navigations).toBe(0);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: /^Моя цель,/ }).click();
  await expect(page.getByLabel('Целевой вес, кг', { exact: true })).toHaveValue(
    '79',
  );
});

test('возврат из фона обнаруживает новую сборку и блокирует обновление до выхода из формы', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await page.getByRole('button', { name: /^Личная информация,/ }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Новый Алекс');
  site.deploy('resumed');
  // OS suspension itself is device-only; dispatch its documented resume event.
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(
    page.getByRole('button', { name: 'Обновить', exact: true }),
  ).toBeDisabled();
  await expect(page).toHaveTitle('MassTracker');
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue(
    'Новый Алекс',
  );
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Обновить', exact: true }),
  ).toBeEnabled();
  // Fully installed updates also apply while offline.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker resumed');
  await ready(page);
  await expect(
    page.getByRole('button', {
      name: 'Личная информация, Новый Алекс',
      exact: true,
    }),
  ).toBeVisible();
});

test('при недоступности сервера сохраняет рабочую версию и повторяет проверку', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  site.failVersion = true;
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await expect(
    page.getByText(/\/version.json: HTTP 503, Content-Type/),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  site.failVersion = false;
  site.failWorker = true;
  site.deploy('retry');
  await context.setOffline(false);
  await expect.poll(() => site.workerFailures).toBeGreaterThan(0);
  await expect(page).toHaveTitle('MassTracker');
  site.failWorker = false;
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker retry');
  await ready(page);
});

test('защита повторной перезагрузки оставляет текущую сборку доступной', async ({
  page,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  const version = site.deploy('guarded');
  await page.evaluate(
    (version) =>
      sessionStorage.setItem('masstracker:last-update-reload', version),
    version,
  );
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(
    page.getByText(
      'Повторная перезагрузка этой сборки остановлена. Закройте и снова откройте приложение.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page).toHaveTitle('MassTracker');
  await selectTheme(page, 'Тёмная');
  expect(await setting(page, 'theme_mode')).toBe('dark');
});

test('экспорт и HTTP-заголовки согласованы с хешами всех ресурсов', async ({
  page,
  site,
}) => {
  const metadata = await page.request.get(`${site.url}/version.json`);
  expect(metadata.headers()['cache-control']).toBe(
    'no-store, no-cache, must-revalidate, no-transform',
  );
  expect(metadata.headers()['content-type']).toContain('application/json');
  const info = (await metadata.json()) as {
    buildId: string;
    appVersion: string;
  };
  const manifestResponse = await page.request.get(
    `${site.url}/precache-manifest.json`,
  );
  expect(manifestResponse.headers()['cache-control']).toContain('no-store');
  const manifest = (await manifestResponse.json()) as {
    version: string;
    resources: [string, string][];
  };
  expect(info.buildId).toBe(manifest.version);
  const worker = await page.request.get(`${site.url}/sw.js`);
  expect(worker.headers()['cache-control']).toBe(
    'no-store, no-cache, must-revalidate, no-transform',
  );
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  expect(await worker.text()).toContain(`"version":"${info.buildId}"`);
  for (const [path, integrity] of manifest.resources) {
    const response = await page.request.get(site.url + path);
    expect(response.ok(), path).toBe(true);
    expect(
      `sha256-${createHash('sha256')
        .update(await response.body())
        .digest('base64')}`,
      path,
    ).toBe(integrity);
    if (path.startsWith('/_expo/static/')) {
      expect(path).toMatch(/[a-f0-9]{32}\.(?:js|css)$/);
      expect(response.headers()['cache-control']).toBe(
        'public, max-age=31536000, immutable, no-transform',
      );
    } else
      expect(response.headers()['cache-control']).toBe(
        'no-cache, no-transform',
      );
  }
  expect(manifest.resources.map(([path]) => path)).not.toContain(
    '/version.json',
  );
});

test('деплой между HTML и первой установкой worker предлагает безопасный переход на уже активную сборку', async ({
  page,
  site,
}) => {
  site.deployOnWorker = 'first-install-race';
  await page.goto(`${site.url}/profile`);
  await expect(
    page.getByRole('button', { name: 'Обновить', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveTitle('MassTracker');
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker first-install-race');
  await ready(page);
});

test('после офлайн-перезапуска предлагает уже загруженный waiting worker', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  site.deploy('offline-waiting');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Обновить', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker offline-waiting');
  await ready(page);
});

test('активация ожидающей B не удаляет кеш одновременно устанавливаемой C', async ({
  page,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  site.deploy('build-b');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Обновить', exact: true }),
  ).toBeVisible();
  const successor = site.deploy('build-c');
  site.holdResource = '/app-shell.css';
  await page.evaluate(async () => {
    void (await navigator.serviceWorker.getRegistration())?.update();
  });
  await expect.poll(() => site.heldRequests).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker build-b');
  await ready(page);
  expect(await page.evaluate(() => caches.keys())).toContain(
    `masstracker-app-${successor}`,
  );
  site.releaseResource();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker build-c');
  await ready(page);
});

test('переходит между двумя production-экспортами с сохранением данных и offline', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  const before = await page
    .locator('meta[name="app-build"]')
    .getAttribute('content');
  const profile = await setting(page, 'user_state');
  await setting(page, 'production-update-check', 'retained');
  const next = process.env.PWA_UPDATE_BUILD_DIR
    ? site.deployExport(process.env.PWA_UPDATE_BUILD_DIR)
    : site.deploy('second-export');
  expect(next).not.toBe(before);
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await ready(page);
  await expect(page.locator('meta[name="app-build"]')).toHaveAttribute(
    'content',
    next,
  );
  expect(await setting(page, 'user_state')).toBe(profile);
  expect(await setting(page, 'production-update-check')).toBe('retained');
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await expect(page.locator('meta[name="app-build"]')).toHaveAttribute(
    'content',
    next,
  );
});

async function seedCompletedProfile(page: Page, site: Site) {
  // Start with a returning user; these tests exercise the existing PWA workflow.
  // A blank same-origin response avoids registering a Service Worker during setup.
  await page.goto(`${site.url}/__test-profile-setup`);
  await page.evaluate(
    (draft) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('masstracker', 2);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('app_settings', { keyPath: 'key' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('app_settings', 'readwrite');
          const store = transaction.objectStore('app_settings');
          store.put({
            key: 'user_state',
            value: JSON.stringify({
              version: 1,
              profile: draft,
              onboarding: { completed: true, step: 7, draft },
            }),
            updatedAt: new Date().toISOString(),
          });
          store.put({
            key: 'user_state_schema',
            value: '1',
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    sampleDraft,
  );
}

test.beforeEach(async ({ page, site }) => {
  await seedCompletedProfile(page, site);
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
        const request = indexedDB.open('masstracker');
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
  const reopenedResponse = await reopened.goto(`${site.url}/profile`);
  if (reopenedResponse?.status() !== 200) {
    const cacheDiagnostics = await reopened.evaluate(async () => {
      const snapshots = [];
      for (const name of await caches.keys()) {
        try {
          const cache = await caches.open(name);
          const shell = await cache.match('/');
          snapshots.push({
            name,
            entries: (await cache.keys()).length,
            shellBytes: shell ? (await shell.text()).length : null,
          });
        } catch (error) {
          snapshots.push({ name, error: String(error) });
        }
      }
      return snapshots;
    });
    expect(reopenedResponse?.status(), JSON.stringify(cacheDiagnostics)).toBe(
      200,
    );
  }
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
  await expect
    .poll(async () =>
      (await page.evaluate(async () => caches.keys())).filter((key) =>
        key.startsWith('masstracker-app-'),
      ),
    )
    .toHaveLength(1);
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
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((key) => key.startsWith('masstracker-app-')),
    ),
  ).toEqual(previous.filter((key) => key.startsWith('masstracker-app-')));
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
    await seedCompletedProfile(page, site);
    await page.goto(`${site.url}/profile`);
    await ready(page);
    await selectTheme(page, 'Тёмная');
    await setting(page, 'offline_check', 'retained');
    const button = (name: string) =>
      page
        .getByRole('button', { name, exact: true })
        .and(page.locator(':not([inert] *)'));
    await page.getByRole('tab', { name: 'Питание', exact: true }).click();
    await button('Рецепты').click();
    await button('Создать рецепт').click();
    await page
      .getByLabel('Название блюда', { exact: true })
      .fill('Банановый перекус');
    await button('Добавить ингредиент').click();
    await page
      .getByLabel('Название или штрихкод продукта', { exact: true })
      .fill('банан');
    await button('Выбрать: Банан').click();
    await button('Сохранить рецепт').click();
    await button('Добавить в дневник').click();
    await expect(
      page.getByText(
        'Для записи в граммах укажите фактический вес готового блюда в рецепте.',
      ),
    ).toBeVisible();
    await button('Добавить в дневник').click();
    await expect(
      page.getByText('Блюдо добавлено в дневник.', { exact: true }),
    ).toBeVisible();
    const diary = await setting(page, 'food_diary_state');
    expect(diary).toContain('Банановый перекус');
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    const updated = process.env.PWA_UPDATE_BUILD_DIR
      ? site.deployExport(process.env.PWA_UPDATE_BUILD_DIR)
      : site.deploy('recipes-update');
    await button('Проверить обновления').click();
    await button('Обновить').click();
    await ready(page);
    await expect(page.locator('meta[name="app-build"]')).toHaveAttribute(
      'content',
      updated,
    );
    expect(await setting(page, 'food_diary_state')).toBe(diary);
    await page.getByRole('tab', { name: 'Питание', exact: true }).click();
    await button('Рецепты').click();
    await expect(button('Открыть: Банановый перекус')).toBeVisible();
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    const afterBrowsing = site.deploy('after-recipe-list');
    await button('Проверить обновления').click();
    await expect(button('Обновить')).toBeEnabled();
    await button('Обновить').click();
    await ready(page);
    await expect(page.locator('meta[name="app-build"]')).toHaveAttribute(
      'content',
      afterBrowsing,
    );
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
    expect(await setting(page, 'food_diary_state')).toBe(diary);
    await page.getByRole('tab', { name: 'Питание', exact: true }).click();
    await expect(button('Изменить запись: Банановый перекус')).toBeVisible();
    await button('Рецепты').click();
    await expect(button('Открыть: Банановый перекус')).toBeVisible();
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

test('раскрываемая диагностика читает подтверждённую запись после перезапуска и доступна с клавиатуры', async ({
  page,
  context,
  site,
}, testInfo) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await selectTheme(page, 'Тёмная');
  await page.reload();
  await ready(page);
  const disclosure = page.getByRole('button', {
    name: 'Диагностика',
    exact: true,
  });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByText('Окружение: Production', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Локальное хранилище: IndexedDB/)).toBeVisible();
  await expect(
    page.getByText(/Service Worker: activated; контроль: да/),
  ).toBeVisible();
  await expect(page.getByText(/Кеш: готов; \d+\/\d+ ресурсов/)).toBeVisible();
  await expect(page.getByText(/Последняя успешная запись: \d/)).toBeVisible();
  await expect(
    page.getByText(/Последняя проверка обновлений: \d/),
  ).toBeVisible();
  await expect(
    page.getByText('Ошибка PWA: нет', { exact: true }),
  ).toBeVisible();
  const lastCheck = await page
    .getByText(/Последняя проверка обновлений: \d/)
    .innerText();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByText('Ошибка PWA: нет', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('diagnostics-dark-320.png'),
    fullPage: true,
  });
  await disclosure.click();
  await expect(page.getByText(/Локальное хранилище: IndexedDB/)).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Диагностика', exact: true }).click();
  await expect(page.getByText(lastCheck, { exact: true })).toBeVisible();
  await expect(page.getByText(/Последняя успешная запись: \d/)).toBeVisible();
});

test('ручная подготовка ремонтирует кеш без обращения к серверу версий', async ({
  page,
  context,
  site,
}) => {
  await page.goto(`${site.url}/profile`);
  await ready(page);
  site.corruptResource = '/app-shell.css';
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) =>
      key.startsWith('masstracker-app-'),
    );
    if (!name) throw new Error('Missing cache');
    await (await caches.open(name)).delete('/app-shell.css');
  });
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Подготовить офлайн-режим', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText(/Не удалось кешировать \/app-shell.css:/).first(),
  ).toBeVisible();
  site.corruptResource = '';
  const checks = site.versionRequests;
  await page
    .getByRole('button', { name: 'Подготовить офлайн-режим', exact: true })
    .click();
  await ready(page);
  expect(site.versionRequests).toBe(checks);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
});

test('без sessionStorage обновляется с сохранением анкеты и настроек', async ({
  page,
  context,
  site,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Storage denied', 'SecurityError');
      },
    });
  });
  await page.goto(`${site.url}/profile`);
  await ready(page);
  await selectTheme(page, 'Тёмная');
  const saved = await setting(page, 'user_state');
  site.deploy('storage-denied');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page).toHaveTitle('MassTracker storage-denied');
  await ready(page);
  expect(await setting(page, 'user_state')).toBe(saved);
  expect(await setting(page, 'theme_mode')).toBe('dark');
});
