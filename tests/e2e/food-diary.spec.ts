import { test, expect, type Page, type Locator } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { createStaticServer } from '../../scripts/serve-web.cjs';
import { sampleDraft } from '../fixtures/profile';

let server: Server;
let url: string;
test.beforeAll(async () => {
  server = createStaticServer(resolve('dist'), (req, res) => {
    if (req.url !== '/__food-setup') return false;
    res
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end('<!doctype html><title>Setup</title>');
    return true;
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing food server');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});
const visible = (page: Page, locator: Locator) =>
  locator.and(page.locator(':not([inert] *)'));
const button = (page: Page, name: string) =>
  visible(page, page.getByRole('button', { name, exact: true }));
async function seed(page: Page) {
  await page.goto(url + '/__food-setup');
  await page.evaluate(
    (draft) =>
      new Promise<void>((done, reject) => {
        const req = indexedDB.open('masstracker', 2);
        req.onupgradeneeded = () =>
          req.result.createObjectStore('app_settings', { keyPath: 'key' });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('app_settings', 'readwrite');
          tx.objectStore('app_settings').put({
            key: 'user_state',
            value: JSON.stringify({
              version: 1,
              profile: draft,
              onboarding: { completed: true, step: 7, draft },
            }),
            updatedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            done();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    sampleDraft,
  );
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Сегодня', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await expect(button(page, 'Поиск продуктов')).toBeEnabled();
}
async function typeStable(page: Page, label: string, value: string) {
  const field = visible(page, page.getByLabel(label, { exact: true }));
  await field.fill('');
  await field.focus();
  await field.evaluate((el) => {
    el.setAttribute('data-stable-input', 'yes');
  });
  for (const char of value) {
    await page.keyboard.insertText(char);
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('data-stable-input', 'yes');
  }
  await expect(field).toHaveValue(value);
}
async function create(page: Page, barcode?: string) {
  await button(page, 'Поиск продуктов').click();
  await button(page, 'Создать продукт').click();
  await visible(
    page,
    page.getByLabel('Название продукта', { exact: true }),
  ).fill('Тестовая крупа');
  if (barcode)
    await visible(
      page,
      page.getByLabel('Штрихкод (необязательно)', { exact: true }),
    ).fill(barcode);
  for (const [label, value] of [
    ['Калории на 100 г', '350'],
    ['Белки на 100 г', '12'],
    ['Жиры на 100 г', '2'],
    ['Углеводы на 100 г', '70'],
  ])
    await typeStable(page, label, value);
  await button(page, 'Сохранить продукт').click();
  await expect(
    visible(
      page,
      page.getByRole('heading', { name: 'Порция продукта', exact: true }),
    ),
  ).toBeVisible();
}
async function state(page: Page) {
  await expect(
    visible(
      page,
      page.getByRole('heading', {
        name: /^(Порция продукта|Запись питания|Редактировать продукт)$/,
      }),
    ),
  ).toHaveCount(0);
  return page.evaluate(
    () =>
      new Promise<{
        entries: {
          date: string;
          meal: string;
          grams: number;
          product: { name: string; per100: { calories: number } };
        }[];
        products: { id: string }[];
        favorites: unknown[];
        recent: unknown[];
      }>((done, reject) => {
        const req = indexedDB.open('masstracker');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('app_settings');
          const read = tx.objectStore('app_settings').get('food_diary_state');
          read.onsuccess = () => {
            db.close();
            done(JSON.parse(read.result.value));
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}
test('создание, дробный ввод, избранное, общий итог, перенос, копирование и удаление', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await create(page);
  await typeStable(page, 'Количество, г', '150,5');
  await button(page, 'В избранное').click();
  await button(page, 'Добавить в дневник').click();
  expect((await state(page)).entries[0].grams).toBe(150.5);
  expect((await state(page)).favorites).toHaveLength(1);
  await button(page, 'Изменить запись: Тестовая крупа').click();
  await visible(
    page,
    page.getByRole('radio', { name: 'Ужин', exact: true }),
  ).click();
  await typeStable(page, 'Количество, г', '150');
  await button(page, 'Сохранить запись').click();
  expect((await state(page)).entries[0].meal).toBe('dinner');
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await expect(
    visible(page, page.getByText('525', { exact: true })),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Изменить запись: Тестовая крупа').click();
  await button(page, 'Скопировать запись').click();
  expect((await state(page)).entries).toHaveLength(2);
  await button(page, 'Скопировать ужин на дату').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Следующий месяц', exact: true })
    .click();
  const day = page
    .getByRole('dialog')
    .getByRole('button', { name: /^1 / })
    .first();
  await day.click();
  await expect(
    visible(page, page.getByText(/Приём пищи скопирован/)),
  ).toBeVisible();
  expect((await state(page)).entries).toHaveLength(4);
  await button(page, 'Следующий день').click();
  await expect(
    visible(
      page,
      page.getByText('Пока нет записей. Добавьте первый продукт.', {
        exact: true,
      }),
    ),
  ).toHaveCount(4);
  await button(page, 'Вернуться к сегодня').click();
  await button(page, 'Изменить запись: Тестовая крупа').first().click();
  await button(page, 'Удалить запись').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить удаление', exact: true })
    .click();
  expect((await state(page)).entries).toHaveLength(3);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('diary-320.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('офлайн CRUD, сохранение после двух перезапусков, история не меняется при правке продукта', async ({
  page,
  context,
}) => {
  await seed(page);
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expect(
    visible(page, page.getByText('Доступно без интернета', { exact: true })),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await context.setOffline(true);
  await create(page, '036000291452');
  await typeStable(page, 'Количество, г', '150');
  await button(page, 'Добавить в дневник').click();
  expect((await state(page)).entries).toHaveLength(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Сканировать штрихкод').click();
  await visible(page, page.getByLabel('Штрихкод', { exact: true })).fill(
    '0036000291452',
  );
  await button(page, 'Найти по штрихкоду').click();
  await expect(
    visible(
      page,
      page.getByRole('heading', { name: 'Порция продукта', exact: true }),
    ),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await button(page, 'Назад').click();
  await button(page, 'Поиск продуктов').click();
  await visible(
    page,
    page.getByRole('radio', { name: 'Мои продукты', exact: true }),
  ).click();
  await button(page, 'Выбрать: Тестовая крупа').click();
  await button(page, 'Редактировать продукт').click();
  await visible(
    page,
    page.getByLabel('Калории на 100 г', { exact: true }),
  ).fill('400');
  await button(page, 'Сохранить продукт').click();
  await button(page, 'Удалить свой продукт').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить удаление', exact: true })
    .click();
  expect((await state(page)).products).toHaveLength(0);
  await page.reload();
  expect((await state(page)).entries[0].product.per100.calories).toBe(350);
  expect((await state(page)).products).toHaveLength(0);
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Изменить запись: Тестовая крупа').click();
  await typeStable(page, 'Количество, г', '200');
  await button(page, 'Сохранить запись').click();
  expect((await state(page)).entries[0].grams).toBe(200);
  await button(page, 'Изменить запись: Тестовая крупа').click();
  await button(page, 'Удалить запись').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить удаление', exact: true })
    .click();
  expect((await state(page)).entries).toHaveLength(0);
});
test.describe('онлайн API без перехвата Service Worker', () => {
  test.use({ serviceWorkers: 'block' });
  test('OFF: локальный поиск без запросов, онлайн кеш, неполные данные, ручной штрихкод и ошибка камеры', async ({
    page,
    context,
  }) => {
    await seed(page);
    const calls: string[] = [];
    await page.route('https://world.openfoodfacts.org/**', async (route) => {
      calls.push(route.request().url());
      await route.fulfill({
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        json: {
          products: [
            {
              code: '4006381333931',
              product_name: 'Онлайн тест',
              brands: 'Бренд',
              nutriments: {
                'energy-kcal_100g': 100,
                proteins_100g: 5,
                fat_100g: 2,
                carbohydrates_100g: 15,
              },
            },
            { code: '96385074', product_name: 'Неполный' },
          ],
          status: 0,
        },
      });
    });
    await button(page, 'Поиск продуктов').click();
    await typeStable(page, 'Название или штрихкод', 'РИС');
    await expect(button(page, 'Выбрать: Рис сухой белый')).toBeVisible();
    expect(calls).toHaveLength(0);
    await visible(
      page,
      page.getByLabel('Название или штрихкод', { exact: true }),
    ).fill('Онлайн');
    await button(page, 'Найти в Open Food Facts').click();
    await expect(button(page, 'Выбрать: Онлайн тест')).toBeVisible();
    await expect(
      visible(page, page.getByText(/Пропущено карточек/)),
    ).toBeVisible();
    expect(calls).toHaveLength(1);
    await button(page, 'Назад').click();
    await button(page, 'Сканировать штрихкод').click();
    await button(page, 'Открыть камеру').click();
    await expect(
      visible(page, page.getByText(/камер.*вручную|Доступ к камере отклонён/i)),
    ).toBeVisible();
    await typeStable(page, 'Штрихкод', '123');
    await button(page, 'Найти по штрихкоду').click();
    await expect(
      visible(page, page.getByText(/Некорректный штрихкод/)),
    ).toBeVisible();
    await visible(page, page.getByLabel('Штрихкод', { exact: true })).fill(
      '4006381333931',
    );
    await button(page, 'Найти по штрихкоду').click();
    await expect(
      visible(page, page.getByText('Онлайн тест', { exact: true })),
    ).toBeVisible();
    expect(calls).toHaveLength(1);
    await button(page, 'Назад').click();
    await button(page, 'Сканировать штрихкод').click();
    await context.setOffline(true);
    await visible(page, page.getByLabel('Штрихкод', { exact: true })).fill(
      '96385074',
    );
    await button(page, 'Найти по штрихкоду').click();
    await expect(button(page, 'Создать с этим штрихкодом')).toBeVisible();
    await button(page, 'Создать с этим штрихкодом').click();
    await expect(
      visible(
        page,
        page.getByLabel('Штрихкод (необязательно)', { exact: true }),
      ),
    ).toHaveValue('96385074');
  });
});

for (const leave of ['close', 'hidden'] as const) {
  test(`камера освобождается, если разрешение приходит после ${leave}`, async ({
    page,
  }) => {
    await seed(page);
    await page.evaluate(() => {
      const devices = navigator.mediaDevices ?? {};
      if (!navigator.mediaDevices)
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: devices,
        });
      Object.defineProperty(devices, 'getUserMedia', {
        configurable: true,
        value: () =>
          new Promise<MediaStream>((resolve) => {
            document.body.dataset.cameraRequested = 'yes';
            document.addEventListener(
              'test-camera-release',
              () =>
                resolve({
                  getTracks: () => [
                    {
                      stop() {
                        document.body.dataset.cameraStopped = 'yes';
                      },
                    },
                  ],
                } as unknown as MediaStream),
              { once: true },
            );
          }),
      });
    });
    await button(page, 'Сканировать штрихкод').click();
    await button(page, 'Открыть камеру').click();
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.cameraRequested))
      .toBe('yes');
    if (leave === 'close') await button(page, 'Назад').click();
    else
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    await page.evaluate(() =>
      document.dispatchEvent(new Event('test-camera-release')),
    );
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.cameraStopped))
      .toBe('yes');
  });
}
