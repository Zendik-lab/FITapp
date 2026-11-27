import { test, expect, type Page, type Locator } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { createStaticServer } from '../../scripts/serve-web.cjs';
import { sampleDraft } from '../fixtures/profile';
import type { ProfileDraft } from '../../src/features/profile/model';

let server: Server;
let url: string;

test.use({ serviceWorkers: 'block' });

test.beforeAll(async () => {
  server = createStaticServer(resolve('dist'), (request, response) => {
    if (request.url !== '/__ui-setup') return false;
    response
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end('<!doctype html><title>UI setup</title>');
    return true;
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing UI server');
  url = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

async function seed(
  page: Page,
  step?: number,
  draft: ProfileDraft = sampleDraft,
) {
  await page.goto(`${url}/__ui-setup`);
  await page.evaluate(
    ({ draft, step }) =>
      new Promise<void>((done, reject) => {
        const request = indexedDB.open('masstracker');
        request.onupgradeneeded = () =>
          request.result.createObjectStore('app_settings', { keyPath: 'key' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('app_settings', 'readwrite');
          const store = transaction.objectStore('app_settings');
          for (const [key, value] of [
            [
              'user_state',
              JSON.stringify({
                version: 1,
                profile: step === undefined ? draft : null,
                onboarding: {
                  completed: step === undefined,
                  step: step ?? 7,
                  draft,
                },
              }),
            ],
          ])
            store.put({ key, value, updatedAt: new Date().toISOString() });
          transaction.oncomplete = () => {
            database.close();
            done();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { draft, step },
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [...document.querySelectorAll('body *')]
        .filter((node) => {
          if (!(node instanceof HTMLElement) || !node.getClientRects().length)
            return false;
          const style = getComputedStyle(node);
          if (
            style.visibility === 'hidden' ||
            node.closest('[aria-hidden="true"]')
          )
            return false;
          // Calendar weekdays intentionally scroll inside their own horizontal region.
          let ancestor = node.parentElement;
          while (ancestor && ancestor !== document.body) {
            if (/auto|scroll/.test(getComputedStyle(ancestor).overflowX))
              return false;
            ancestor = ancestor.parentElement;
          }
          const rect = node.getBoundingClientRect();
          return rect.left < -1 || rect.right > width + 1;
        })
        .map((node) => ({
          text: node.textContent?.slice(0, 90),
          width: node.getBoundingClientRect().width,
        }));
    }),
  ).toEqual([]);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([
    0, 0,
  ]);
}

async function scrollOwner(target: Locator) {
  return target.evaluate((node) => {
    let parent = node.parentElement;
    while (parent) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        parent.scrollTop = parent.scrollHeight;
        return {
          top: parent.getBoundingClientRect().top,
          bottom: parent.getBoundingClientRect().bottom,
          atEnd:
            Math.ceil(parent.scrollTop + parent.clientHeight) >=
            parent.scrollHeight,
          lastBottom:
            parent.firstElementChild?.lastElementChild?.getBoundingClientRect()
              .bottom,
        };
      }
      parent = parent.parentElement;
    }
    return null;
  });
}

test('системные области отделяют контент и продолжают фон панели до края', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Chromium CDP supplies real nonzero CSS env values; WebKit device acceptance remains manual.',
  );
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
  });
  await seed(page);
  await page.goto(url);
  const title = page.getByRole('heading', { name: 'Сегодня', exact: true });
  expect(
    await page
      .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
      .count(),
  ).toBe(0);
  await expect(title).toBeVisible();
  await page.screenshot({ path: '.expo/ui-safe-area.png' });
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(47);
  const owner = await scrollOwner(title);
  expect(owner?.top).toBe(47);
  const tab = page.getByRole('tab', { name: 'Сегодня', exact: true });
  expect(
    (await tab.boundingBox())!.y + (await tab.boundingBox())!.height,
  ).toBeLessThanOrEqual(844 - 34);
  expect(
    await page.evaluate(() => {
      const bottom = document.elementFromPoint(innerWidth / 2, innerHeight - 1);
      let node = bottom;
      while (node) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)') return color;
        node = node.parentElement;
      }
      return '';
    }),
  ).toBe('rgb(255, 255, 255)');
  for (const name of ['Питание', 'Тренировки', 'Прогресс', 'Профиль']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const heading = page.getByRole('heading', { name, exact: true });
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(47);
    expect((await scrollOwner(heading))?.top).toBe(47);
  }
  await page.getByRole('button', { name: /^Параметры тела,/ }).click();
  await expect(
    page.locator('.app-safe-area').filter({
      has: page.getByRole('heading', { name: 'Параметры тела', exact: true }),
    }),
  ).toHaveCSS('padding-bottom', '0px');
  await page
    .getByRole('button', { name: 'Назад без сохранения', exact: true })
    .click();
  await page.setViewportSize({ width: 844, height: 390 });
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 0, bottom: 21, left: 47, right: 47 },
  });
  await expect(
    page.locator('.app-safe-area').filter({
      has: page.getByRole('heading', { name: 'Профиль', exact: true }),
    }),
  ).toHaveCSS('padding-left', '47px');
  await expect(page.locator('.app-tab-bar')).toHaveCSS(
    'padding-bottom',
    '21px',
  );
  await expectNoHorizontalOverflow(page);
  await seed(page, 0);
  await page.goto(url);
  await expect(page.locator('.app-safe-area:visible')).toHaveCSS(
    'padding-bottom',
    '21px',
  );
  await expectNoHorizontalOverflow(page);
});

test('тема сообщает выбранный вариант и поддерживает клавиатуру', async ({
  page,
}) => {
  await seed(page);
  await page.goto(`${url}/profile`);
  const appearance = page.getByRole('button', { name: /^Внешний вид/ });
  await appearance.click();
  const dialog = page.getByRole('dialog', { name: 'Внешний вид', exact: true });
  await expect(dialog).toBeVisible();
  const system = dialog.getByRole('radio', { name: 'Системная', exact: true });
  await expect(system).toHaveAttribute('aria-checked', 'true');
  await system.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog).not.toBeVisible();
  await expect(appearance).toBeFocused();
  await appearance.click();
  await expect(
    dialog.getByRole('radio', { name: 'Светлая', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(appearance).toBeFocused();
});

test('загрузка и ошибка профиля доступны на низком экране', async ({
  page,
  browser,
  browserName,
}) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await seed(page);
  await page.evaluate(
    () =>
      new Promise<void>((done, reject) => {
        const request = indexedDB.open('masstracker');
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('app_settings', 'readwrite');
          transaction.objectStore('app_settings').put({
            key: 'user_state',
            value: '{broken',
            updatedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => {
            db.close();
            done();
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.goto(url);
  await expect(
    page.getByRole('heading', {
      name: 'Не удалось загрузить профиль',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Повторить', exact: true })
    .scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  const button = (await page
    .getByRole('button', { name: 'Повторить', exact: true })
    .boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(0);
  expect(button.y + button.height).toBeLessThanOrEqual(240);
  await page.screenshot({
    path: `.expo/ui-audit/${browserName}-profile-error.png`,
  });
  // Serve the mock in the document head so it precedes the app on all engines.
  const loadingContext = await browser.newContext({
    viewport: { width: 320, height: 240 },
    serviceWorkers: 'block',
  });
  try {
    for (const { heading, screenshot, script } of [
      {
        heading: 'Загрузка приложения…',
        screenshot: 'startup-loading',
        script:
          "Object.defineProperty(IDBFactory.prototype, 'open', { value: () => ({}) });",
      },
      {
        heading: 'Загрузка профиля…',
        screenshot: 'profile-loading',
        script: `const read = IDBObjectStore.prototype.get;
          Object.defineProperty(IDBObjectStore.prototype, 'get', {
            value: function (key) {
              return key === 'user_state' ? {} : read.call(this, key);
            },
          });`,
      },
    ]) {
      const loading = await loadingContext.newPage();
      await loading.route(url + '/', async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        await route.fulfill({
          status: response.status(),
          contentType: 'text/html',
          body: html.replace('<head>', `<head><script>${script}</script>`),
        });
      });
      await loading.goto(url);
      await expect(
        loading.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(loading);
      await loading.screenshot({
        path: `.expo/ui-audit/${browserName}-${screenshot}.png`,
      });
      await loading.close();
    }
  } finally {
    await loadingContext.close();
  }
});

test('ошибка нижнего поля редактора оставляет фокусируемое поле видимым', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await seed(page);
  await page.goto(`${url}/profile`);
  await page.getByRole('button', { name: /^Параметры тела/ }).click();
  const weight = page.getByLabel('Текущий вес, кг', { exact: true });
  await weight.fill('0');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(weight).toBeFocused();
  const rect = (await weight.boundingBox())!;
  const tab = (await page
    .getByRole('tab', { name: 'Профиль', exact: true })
    .boundingBox())!;
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.height).toBeLessThanOrEqual(tab.y);
});

for (const width of [320, 375, 390, 393, 414, 430, 1280]) {
  test(`все вкладки: ширина ${width}, прокрутка и сохранение состояния`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await page.goto(url);
    const firstTab = (await page
      .getByRole('tab', { name: 'Сегодня', exact: true })
      .boundingBox())!;
    if (width > 640) expect(firstTab.x).toBeCloseTo((width - 640) / 2);
    for (const title of [
      'Сегодня',
      'Питание',
      'Тренировки',
      'Прогресс',
      'Профиль',
    ]) {
      await page.getByRole('tab', { name: title, exact: true }).click();
      const heading = page.getByRole('heading', { name: title, exact: true });
      await expect(heading).toBeVisible();
      if (width === 320 || width === 390)
        await page.screenshot({
          path: `.expo/ui-audit/${browserName}-${width}-${title}.png`,
        });
      await expectNoHorizontalOverflow(page);
      const owner = await scrollOwner(heading);
      expect(owner).not.toBeNull();
      expect(owner!.atEnd).toBe(true);
      expect(owner!.lastBottom).toBeLessThanOrEqual(owner!.bottom + 1);
      const tab = await page
        .getByRole('tab', { name: title, exact: true })
        .boundingBox();
      expect(owner!.bottom).toBeLessThanOrEqual(tab!.y + 1);
      await expectNoHorizontalOverflow(page);
    }
    await page.getByRole('tab', { name: 'Прогресс', exact: true }).click();
    await page.getByRole('tab', { name: 'Год', exact: true }).click();
    await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
    await page.getByRole('tab', { name: 'Прогресс', exact: true }).click();
    await expect(
      page.getByRole('tab', { name: 'Год', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  });
}

for (const width of [320, 375, 390, 393, 414, 430]) {
  test(`анкета и шесть редакторов: ширина ${width}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 568 });
    await seed(page, 0);
    await page.goto(url);
    for (let step = 0; step < 8; step++) {
      await expect(
        page.getByText(`Шаг ${step + 1} из 8`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('form-content')).toHaveCSS('opacity', '1');
      if (width === 390)
        await page.screenshot({
          path: `.expo/ui-audit/${browserName}-onboarding-${step + 1}.png`,
        });
      await expectNoHorizontalOverflow(page);
      const primary = page.getByRole('button', {
        name:
          step === 0
            ? 'Начать'
            : step === 7
              ? 'Создать мой профиль'
              : 'Продолжить',
        exact: true,
      });
      await primary.scrollIntoViewIfNeeded();
      const rect = (await primary.boundingBox())!;
      expect(rect.y + rect.height).toBeLessThanOrEqual(569);
      await primary.click();
    }
    await expect(
      page.getByRole('heading', { name: 'Сегодня', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    for (const section of [
      'Личная информация',
      'Параметры тела',
      'Моя цель',
      'Физическая активность',
      'Тренировки',
      'Пищевые предпочтения',
    ]) {
      await page
        .getByRole('button', { name: new RegExp(`^${section},`) })
        .click();
      await expect(
        page.getByRole('heading', { name: section, exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('form-content')).toHaveCSS('opacity', '1');
      if (width === 390)
        await page.screenshot({
          path: `.expo/ui-audit/${browserName}-editor-${section}.png`,
        });
      await expectNoHorizontalOverflow(page);
      await page
        .getByRole('button', { name: 'Сохранить изменения', exact: true })
        .scrollIntoViewIfNeeded();
      await expectNoHorizontalOverflow(page);
      await page
        .getByRole('button', { name: 'Назад без сохранения', exact: true })
        .click();
    }
  });
}

test('диалоги, длинный профиль, темы и уменьшенный viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seed(page, undefined, {
    ...sampleDraft,
    name: 'А'.repeat(80),
    diet: 'Б'.repeat(200),
  });
  await page.goto(url);
  await expect(
    page.getByText(`Привет, ${'А'.repeat(80)}!`, { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Записать вес', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: /^Внешний вид/ }).click();
  dialog = page.getByRole('dialog', { name: 'Внешний вид', exact: true });
  await dialog.getByRole('radio', { name: 'Тёмная', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  for (const title of [
    'Сегодня',
    'Питание',
    'Тренировки',
    'Прогресс',
    'Профиль',
  ]) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole('button', { name: /^Пищевые предпочтения,/ }).click();
  const diet = page.getByLabel('Предпочтительный режим питания', {
    exact: true,
  });
  await diet.fill('Режим питания');
  await page.setViewportSize({ width: 320, height: 320 });
  await diet.focus();
  await page.keyboard.type(' без ограничений');
  await expect(diet).toBeFocused();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expect(diet).toHaveValue('Режим питания без ограничений');
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole('button', { name: 'Назад без сохранения', exact: true })
    .click();
  dialog = page.getByRole('dialog', {
    name: 'Отменить изменения?',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(321);
  await dialog
    .getByRole('button', { name: 'Продолжить редактирование', exact: true })
    .click();
  await expect(diet).toHaveValue('Режим питания без ограничений');
  await page
    .getByRole('button', { name: 'Назад без сохранения', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Отменить изменения', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Пройти анкетирование заново', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', {
      name: 'Пройти анкетирование заново?',
      exact: true,
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Диагностика', exact: true }).click();
  await expectNoHorizontalOverflow(page);
});
