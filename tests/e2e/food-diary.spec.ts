import { test, expect, type Page, type Locator } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { createStaticServer } from '../../scripts/serve-web.cjs';
import { sampleDraft } from '../fixtures/profile';
import { unitoolsRecipes } from '../../src/features/recipes/library-unitools';
import { wikibooksRecipes } from '../../src/features/recipes/library-wikibooks';

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

test('возврат из порции сохраняет поиск и позицию списка', async ({ page }) => {
  await seed(page);
  await button(page, 'Поиск продуктов').click();
  await typeStable(page, 'Название или штрихкод', 'овся');
  const result = visible(
    page,
    page.getByRole('button', { name: /^Выбрать: / }),
  ).first();
  await result.scrollIntoViewIfNeeded();
  const scrollPosition = () =>
    result.evaluate((element) => {
      let parent = element.parentElement;
      while (
        parent &&
        !/auto|scroll/.test(getComputedStyle(parent).overflowY)
      ) {
        parent = parent.parentElement;
      }
      return parent?.scrollTop ?? 0;
    });
  const offset = await scrollPosition();
  expect(offset).toBeGreaterThan(0);
  await result.click();
  await expect(
    page.getByRole('heading', { name: 'Порция продукта' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Назад').click();
  const search = visible(
    page,
    page.getByLabel('Название или штрихкод', { exact: true }),
  );
  await expect(search).toHaveValue('овся');
  await expect.poll(scrollPosition).toBeCloseTo(offset, 0);
});
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
          amount: number;
          grams: number;
          product: { id: string; name: string; per100: { calories: number } };
        }[];
        products: { id: string }[];
        recipes?: { id: string; name: string }[];
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
  await button(page, 'Отменить удаление').click();
  await expect(
    visible(page, page.getByText('Запись восстановлена.', { exact: true })),
  ).toBeVisible();
  expect((await state(page)).entries).toHaveLength(4);
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

test('инструменты питания и оформление сохраняются после холодного офлайн-запуска', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expect(
    visible(page, page.getByText('Доступно без интернета', { exact: true })),
  ).toBeVisible();
  await button(page, 'Персонализация').click();
  await visible(
    page,
    page.getByRole('radio', { name: 'Синий', exact: true }),
  ).click();
  await button(page, 'Выше: Быстрые действия').click();
  await typeStable(page, 'Своё приветствие', 'Привет из офлайна');
  await button(page, 'Сохранить оформление').click();
  await expect(
    visible(page, page.getByText('Оформление сохранено.', { exact: true })),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Инструменты питания').click();
  await button(page, 'Умный холодильник').click();
  await button(page, 'Добавить из каталога').click();
  await typeStable(page, 'Название или штрихкод продукта', 'банан');
  await button(page, 'Выбрать: Банан').click();
  await expect(button(page, 'Сохранить количество')).toBeEnabled();
  await button(page, 'Сохранить количество').click();
  await expect(button(page, 'Изменить запас: Банан')).toBeVisible();
  await button(page, 'Назад').click();
  await button(page, 'Покупки').click();
  await button(page, 'Добавить вручную').click();
  await typeStable(page, 'Название покупки', 'Рис для покупок');
  await button(page, 'Сохранить количество').click();
  await expect(
    button(page, 'Изменить количество: Рис для покупок'),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await button(page, 'Бюджет питания').click();
  await typeStable(page, 'Дневной бюджет, ₸', '2500');
  await button(page, 'Сохранить бюджет').click();
  await expect(
    visible(page, page.getByText('Бюджет сохранён.', { exact: true })),
  ).toBeVisible();
  await context.setOffline(true);
  await page.goto(url);
  await expect(
    visible(page, page.getByText('Привет из офлайна', { exact: true })),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Инструменты питания').click();
  await button(page, 'Покупки').click();
  await expect(
    button(page, 'Изменить количество: Рис для покупок'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('локальные рекомендации, сравнение и отчёты доступны из основных вкладок', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await button(page, 'Подобрать блюдо').click();
  const options = button(page, 'Добавить вариант в дневник');
  await expect(options.first()).toBeEnabled();
  await options.first().click();
  await expect(
    visible(
      page,
      page.getByText('Вариант добавлен в дневник.', { exact: true }),
    ),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await page.getByRole('tab', { name: 'Прогресс', exact: true }).click();
  await button(page, 'Недельный отчёт').click();
  await expect(
    visible(page, page.getByText('1 из 7 дней с записями', { exact: true })),
  ).toBeVisible();
  await button(page, 'Завершить просмотр отчёта').click();
  await expect(
    visible(
      page,
      page.getByText('Недельный отчёт просмотрен.', { exact: true }),
    ),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await button(page, 'Mass Coach').click();
  await expect(
    visible(
      page,
      page.getByRole('heading', { name: 'Mass Coach', exact: true }),
    ),
  ).toBeVisible();
  await button(page, 'Назад').click();
  await button(page, 'FIT Wrapped').click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => data.files?.[0]?.type === 'image/png',
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        document.documentElement.dataset.wrappedShare = file
          ? `${file.name}:${file.type}:${file.size}`
          : data.text;
      },
    });
  });
  await button(page, 'Следующая карточка').click();
  await expect(
    visible(
      page,
      page.getByRole('heading', { name: 'Среднее КБЖУ', exact: true }),
    ),
  ).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await button(page, 'Следующая карточка').click();
  }
  await button(page, 'Поделиться итогом').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-wrapped-share');
  await button(page, 'Подтвердить отправку').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-wrapped-share',
    /^fit-wrapped\.png:image\/png:[1-9]\d+$/,
  );
  await button(page, 'Назад').click();
  await button(page, 'Достижения').click();
  await expect(
    visible(page, page.getByText('Первый недельный отчёт', { exact: true })),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Инструменты питания').click();
  await button(page, 'Сравнение продуктов').click();
  for (const [query, name] of [
    ['банан', 'Банан'],
    ['яблоко', 'Яблоко'],
  ]) {
    await button(page, 'Выбрать продукт для сравнения').click();
    await typeStable(page, 'Название или штрихкод продукта', query);
    await button(page, `Выбрать: ${name}`).click();
  }
  await expect(
    visible(
      page,
      page.getByRole('heading', { name: 'Сопоставление КБЖУ', exact: true }),
    ),
  ).toBeVisible();
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
  await button(page, 'Поиск продуктов').click();
  await typeStable(page, 'Название или штрихкод', 'банан');
  await expect(button(page, 'Найти в Open Food Facts')).toBeDisabled();
  await button(page, 'Выбрать: Банан').click();
  await button(page, 'Назад').click();
  await expect(
    visible(page, page.getByLabel('Название или штрихкод', { exact: true })),
  ).toHaveValue('банан');
  await button(page, 'Назад').click();
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
              code: '036000291452',
              product_name: 'Онлайн тест',
              brands: 'Бренд',
              nutriments: {
                'energy-kcal_100g': 100,
                proteins_100g: 5,
                fat_100g: 2,
                carbohydrates_100g: 15,
              },
            },
            {
              code: '0036000291452',
              product_name: 'Онлайн дубликат',
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
    await expect(button(page, 'Выбрать: Онлайн дубликат')).toHaveCount(0);
    await expect(
      visible(page, page.getByText(/Без полных КБЖУ на 100 г/)),
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
      '036000291452',
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

test('рецепт коктейля: свой продукт, клавиатура, масштаб, избранное и неизменная запись', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  const heading = (name: string) =>
    visible(page, page.getByRole('heading', { name, exact: true }));
  const field = (label: string) =>
    visible(page, page.getByLabel(label, { exact: true }));
  const radio = (name: string) =>
    visible(page, page.getByRole('radio', { name, exact: true }));
  const name = 'Коктейль для набора массы';
  await button(page, 'Рецепты').click();
  await button(page, 'Мои рецепты').click();
  await expect(
    page.getByText('Рецептов пока нет', { exact: true }),
  ).toBeVisible();
  await button(page, 'Создать рецепт').click();
  await button(page, 'Сохранить рецепт').click();
  await expect(field('Название блюда')).toBeFocused();
  await field('Название блюда').fill(name);
  await typeStable(page, 'Количество порций', '2');
  await typeStable(page, 'Вес готового блюда, г (необязательно)', '1000');
  await button(page, 'Категория: Основные блюда').click();
  await radio('Протеиновые коктейли').click();
  await button(page, 'Добавить ингредиент').click();
  await button(page, 'Создать продукт').click();
  for (const [label, value] of [
    ['Название продукта', 'Молоко для теста'],
    ['Калории на 100 г', '50'],
    ['Белки на 100 г', '3'],
    ['Жиры на 100 г', '2'],
    ['Углеводы на 100 г', '5'],
    ['Плотность, г/мл (необязательно)', '1,03'],
  ])
    await field(label).fill(value);
  await button(page, 'Сохранить продукт').click();
  await expect(heading('Новый рецепт')).toBeVisible();
  await button(page, 'Единица: г').click();
  await radio('мл').click();
  await typeStable(page, 'Количество: Молоко для теста, мл', '700');
  for (const [query, product, quantity] of [
    ['банан', 'Банан', '120'],
    ['овсяные хлопья', 'Овсяные хлопья сухие', '80'],
    ['гейнер', 'Гейнер (пример этикетки)', '100'],
  ]) {
    await button(page, 'Добавить ингредиент').click();
    await field('Название или штрихкод продукта').fill(query);
    await button(page, `Выбрать: ${product}`).click();
    await typeStable(page, `Количество: ${product}, г`, quantity);
  }
  await field('Инструкция (необязательно)').fill('Смешать в блендере.');
  await radio('Весь рецепт').click();
  await expect(page.getByText(/^1\D150,5 ккал/)).toBeVisible();
  await button(page, 'Назад').click();
  const discard = page.getByRole('dialog', { name: 'Выйти без сохранения?' });
  await expect(discard).toBeVisible();
  await discard
    .getByRole('button', { name: 'Продолжить редактирование' })
    .click();
  await button(page, 'Сохранить рецепт').click();
  await expect(heading(name)).toBeVisible();
  await typeStable(page, 'Приготовить порций', '4');
  await expect(page.getByText(/^Выход блюда · 4 порц/)).toBeVisible();
  await expect(page.getByText('1 400 мл', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await expect(
    page.getByRole('tab', { name: 'Питание', exact: true }),
  ).toBeVisible();
  await button(page, 'В избранное').click();
  await expect(button(page, 'Убрать из избранного')).toBeEnabled();
  await button(page, 'Назад').click();
  await button(page, 'Избранное').click();
  await field('Поиск рецептов').fill('другой рецепт');
  await expect(
    page.getByText('Рецепты по этому запросу не найдены.'),
  ).toBeVisible();
  await button(page, 'Очистить поиск').click();
  await expect(field('Поиск рецептов')).toBeFocused();
  await button(page, `Добавить в дневник: ${name}`).click();
  await typeStable(page, 'Съедено порций', '0,5');
  await radio('Обед').click();
  await button(page, 'Добавить в дневник').click();
  await expect(
    page.getByText('Блюдо добавлено в дневник.', { exact: true }),
  ).toBeVisible();
  const first = (await state(page)).entries;
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    meal: 'lunch',
    amount: 0.5,
    grams: 250,
    product: { name },
  });
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await expect(button(page, `Открыть запись: ${name}`)).toBeVisible();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Добавить продукт, ужин').click();
  await button(page, 'Выбрать рецепт').click();
  await button(page, 'Сортировка').click();
  await radio('Недавно использованные').click();
  await button(page, `Добавить в дневник: ${name}`).click();
  await radio('Граммы').click();
  await typeStable(page, 'Вес съеденного блюда, г', '125,5');
  await button(page, 'Добавить в дневник').click();
  await expect(
    page.getByText('Блюдо добавлено в дневник.', { exact: true }),
  ).toBeVisible();
  expect((await state(page)).entries[1]).toMatchObject({
    meal: 'dinner',
    grams: 125.5,
  });
  await page.reload();
  await button(page, 'Рецепты').click();
  await button(page, `Открыть: ${name}`).click();
  await button(page, 'Редактировать рецепт').click();
  await expect(field('Количество порций')).toHaveValue('2');
  await field('Название блюда').fill('Коктейль после правки');
  await button(page, 'Удалить ингредиент: Банан').click();
  await button(page, 'Сохранить рецепт').click();
  await button(page, 'Дублировать рецепт').click();
  await button(page, 'Открыть: Коктейль после правки').click();
  await button(page, 'Удалить рецепт').click();
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить рецепт?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog
    .getByRole('button', { name: 'Подтвердить удаление рецепта' })
    .click();
  await expect(
    button(page, 'Открыть: Коктейль после правки (копия)'),
  ).toBeVisible();
  await expect(button(page, 'Открыть: Коктейль после правки')).toHaveCount(0);
  await button(page, 'Назад').click();
  expect((await state(page)).entries[0]).toEqual(first[0]);
  await button(page, `Изменить запись: ${name}`).first().click();
  await expect(
    page.getByText('КБЖУ на момент записи', { exact: true }),
  ).toBeVisible();
});

test('готовый каталог, поиск, фильтры, продукты дома и избранное при холодном офлайн-запуске', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await button(page, 'Рецепты').click();
  await expect(
    page.getByText(
      `Найдено рецептов: ${150 + unitoolsRecipes.length + wikibooksRecipes.length}`,
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await typeStable(page, 'Поиск рецептов', 'овсянка с яблоком');
  const name = 'Молочная овсянка с яблоком';
  await button(page, 'Фильтры').click();
  await typeStable(page, 'Калории до, ккал', '1');
  await button(page, 'Применить фильтры').click();
  await expect(
    page.getByText('Найдено рецептов: 0', { exact: true }),
  ).toBeVisible();
  await button(page, 'Калории до, ккал 1 ×').click();
  await button(page, 'Что приготовить из того, что есть').click();
  await button(page, 'Выбрать продукты дома').click();
  await page
    .getByLabel('Название или штрихкод продукта', { exact: true })
    .fill('овсяные хлопья');
  await button(page, 'Выбрать: Овсяные хлопья сухие').click();
  await button(page, 'Готово').click();
  await button(page, 'Открыть: ' + name).click();
  await expect(page.getByText('Есть дома', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Не хватает', { exact: true }).first(),
  ).toBeVisible();
  await button(page, 'Отметить шаг 1').click();
  await expect(button(page, 'Шаг 1 выполнен')).toBeVisible();
  await button(page, 'В избранное').click();
  await expect(button(page, 'Убрать из избранного')).toBeEnabled();
  await button(page, 'Добавить в дневник').click();
  await button(page, 'Добавить в дневник').click();
  expect((await state(page)).entries).toEqual([
    expect.objectContaining({ product: expect.objectContaining({ name }) }),
  ]);
  await page.reload();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Рецепты').click();
  await expect(button(page, 'овсянка с яблоком')).toBeVisible();
  await button(page, 'Избранное').click();
  await expect(button(page, 'Открыть: ' + name)).toBeVisible();
  await button(page, 'Очистить историю').click();
  await expect(button(page, 'овсянка с яблоком')).toHaveCount(0);
});

test('импортированный рецепт офлайн ищется по составу, копируется и записывается в дневник', async ({
  page,
  context,
}) => {
  await seed(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Рецепты').click();
  await button(page, 'Следующая страница').click();
  await expect(button(page, 'Предыдущая страница')).toBeEnabled();
  await typeStable(page, 'Поиск рецептов', 'булгур мята');
  const name = 'Табуле';
  await button(page, 'Фильтры').click();
  await typeStable(page, 'Калории до, ккал', '1');
  await button(page, 'Применить фильтры').click();
  await expect(button(page, 'Открыть: ' + name)).toHaveCount(0);
  await button(page, 'Калории до, ккал 1 ×').click();
  await button(page, 'Открыть: ' + name).click();
  await expect(page.getByText(/UniTools — theunitools.com/)).toBeVisible();
  await page.getByLabel('Приготовить порций', { exact: true }).fill('8');
  await expect(button(page, 'Сбросить масштаб')).toBeEnabled();
  await button(page, 'В избранное').click();
  await expect(button(page, 'Убрать из избранного')).toBeEnabled();
  await button(page, 'Скопировать в мои рецепты').click();
  await expect.poll(async () => (await state(page)).recipes?.length).toBe(1);
  await button(page, 'Избранное').click();
  await button(page, 'Открыть: ' + name).click();
  await button(page, 'Добавить в дневник').click();
  await button(page, 'Добавить в дневник').click();
  const [entry] = (await state(page)).entries;
  expect(entry.product.id).toBe('library:unitools-tabbouleh');
});

test('Wikibooks офлайн: кухня, исходная мера и дробная порция', async ({
  page,
  context,
}) => {
  const started = performance.now();
  await seed(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const installed = performance.now();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  await button(page, 'Рецепты').click();
  await expect(page.getByText(/Найдено рецептов:/)).toBeVisible();
  const listed = performance.now();
  await typeStable(page, 'Поиск рецептов', 'полента');
  await button(page, 'Фильтры').click();
  await button(page, 'Итальянская кухня').click();
  await button(page, 'Применить фильтры').click();
  const filtered = performance.now();
  await button(page, 'Открыть: Итальянская полента').click();
  await expect(
    page.getByText(/Open Recipe Corpus · CC BY-SA 4.0/),
  ).toBeVisible();
  await expect(page.getByText(/1 кг · /)).toBeVisible();
  const detail = performance.now();
  await button(page, 'Добавить в дневник').click();
  await page.getByLabel('Съедено порций', { exact: true }).fill('0,5');
  await button(page, 'Добавить в дневник').click();
  await expect
    .poll(async () => (await state(page)).entries[0]?.product.id)
    .toBe('library:wikibooks-pl-31729');
  const [entry] = (await state(page)).entries;
  expect(entry.amount).toBe(0.5);
  const intervals = [
    installed - started,
    listed - installed,
    filtered - listed,
    detail - filtered,
    performance.now() - detail,
  ].map(Math.round);
  process.stdout.write(
    `Wikibooks browser flow (ms), preparation / cold reopen and list / search and filtering / detail / diary: ${intervals.join(' / ')}\n`,
  );
});
