import { test, expect, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve, join, sep } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createStaticServer } from '../../scripts/serve-web.cjs';
import { sampleDraft } from '../fixtures/profile';
import type { ProfileDraft } from '../../src/features/profile/model';

let server: Server;
let url: string;
test.beforeAll(async () => {
  server = createStaticServer(resolve('dist'), (request, response) => {
    if (request.url !== '/__nutrition-setup') return false;
    response
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end('<!doctype html><title>Nutrition setup</title>');
    return true;
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing nutrition test server');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

async function seed(page: Page, changes: Partial<ProfileDraft> = {}) {
  await page.goto(url + '/__nutrition-setup');
  await page.evaluate(
    (draft) =>
      new Promise<void>((done, reject) => {
        const request = indexedDB.open('masstracker', 2);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('app_settings', { keyPath: 'key' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
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
    {
      ...sampleDraft,
      birthDate: `01.01.${new Date().getFullYear() - 19}`,
      height: '196',
      currentWeight: '72',
      ...changes,
    },
  );
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Сегодня', exact: true }),
  ).toBeVisible();
}
async function open(page: Page, tab = 'Питание') {
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await expect(
    page
      .getByRole('heading', { name: tab, exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Калории и БЖУ', exact: true })
    .and(page.locator(':not([inert] *)'))
    .click();
  await expect(
    page
      .getByRole('heading', { name: 'Калории и БЖУ', exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeVisible();
}
async function manualCalories(page: Page, value = '3000') {
  await page
    .getByRole('radiogroup', { name: 'Режим калорийности', exact: true })
    .and(page.locator(':not([inert] *)'))
    .getByRole('radio', { name: 'Ручная настройка', exact: true })
    .click();
  await page
    .getByLabel('Целевая калорийность, ккал', { exact: true })
    .and(page.locator(':not([inert] *)'))
    .fill(value);
}
async function save(page: Page) {
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .and(page.locator(':not([inert] *)'))
    .click();
  await expect(
    page
      .getByText('Цели питания сохранены.', { exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeVisible();
}
async function weight(page: Page, value: string) {
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: /^Параметры тела,/ }).click();
  await page.getByLabel('Текущий вес, кг', { exact: true }).fill(value);
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(
    page.getByText('Профиль обновлён.', { exact: true }),
  ).toBeVisible();
}

test('реальные цели, нулевое потребление, формулы и отсутствие шестой вкладки', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(
    page.getByText('ккал из 3\u00a0225', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Белки, 0 из 129,6 г', { exact: true }),
  ).toBeVisible();
  await open(page);
  await expect(
    page.getByText('BMR · 1\u00a0855 ккал', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('TDEE · 2\u00a0875,3 ккал', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Белки · 129,6 г/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(
    page.getByTestId('form-content').and(page.locator(':not([inert] *)')),
  ).toHaveCSS('opacity', '1');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('nutrition-light-320.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Назад без сохранения', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: /^Внешний вид,/ }).click();
  await page.getByRole('radio', { name: 'Тёмная', exact: true }).click();
  await open(page, 'Профиль');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByTestId('form-content').and(page.locator(':not([inert] *)')),
  ).toHaveCSS('opacity', '1');
  await expect(
    page
      .getByRole('heading', { name: 'Калории и БЖУ', exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.screenshot({
    path: testInfo.outputPath('nutrition-dark-desktop.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('ручной ввод сохраняет DOM, фокус и курсор; ошибка БЖУ исправляется до commit', async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await manualCalories(page, '');
  const calories = page.getByLabel('Целевая калорийность, ккал', {
    exact: true,
  });
  const original = await calories.elementHandle();
  await expect(calories).toBeEditable();
  await calories.focus();
  for (const character of '3000,0') {
    await page.keyboard.type(character);
    await expect(calories).toBeFocused();
    expect(await original?.evaluate((n) => n.isConnected)).toBe(true);
  }
  await calories.evaluate((n: HTMLInputElement) => n.setSelectionRange(0, 1));
  await page.keyboard.type('3');
  await expect(calories).toHaveValue('3000,0');
  expect(
    await calories.evaluate((n: HTMLInputElement) => n.selectionStart),
  ).toBe(1);
  await page.setViewportSize({ width: 390, height: 460 });
  await expect(calories).toBeFocused();
  await page
    .getByRole('radiogroup', { name: 'Режим БЖУ', exact: true })
    .getByRole('radio', { name: 'Ручная настройка', exact: true })
    .click();
  await page.getByLabel('Белки, г', { exact: true }).fill('150');
  await page.getByLabel('Жиры, г', { exact: true }).fill('80');
  await page.getByLabel('Углеводы, г', { exact: true }).fill('410');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(
    page.getByText(/Энергия БЖУ.*не совпадает/).first(),
  ).toBeVisible();
  await page.getByLabel('Углеводы, г', { exact: true }).fill('420');
  await save(page);
  await weight(page, '73');
  await open(page, 'Профиль');
  await expect(calories).toHaveValue('3000');
  await expect(page.getByLabel('Белки, г', { exact: true })).toHaveValue('150');
  await expect(page.getByText('3\u00a0241 ккал', { exact: true })).toHaveCount(
    2,
  );
  await expect(page.getByText(/Белки · 131,4 г/)).toBeVisible();
  await expect(page.getByText(/Жиры · 73 г/)).toBeVisible();
  await expect(page.getByText(/Углеводы · 514,6 г/)).toBeVisible();
  await page.reload();
  await open(page, 'Профиль');
  await expect(calories).toHaveValue('3000');
  await expect(page.getByLabel('Углеводы, г', { exact: true })).toHaveValue(
    '420',
  );
  await page
    .getByRole('button', { name: 'Восстановить рекомендации', exact: true })
    .click();
  await save(page);
  await expect(
    page.getByText('ккал из 3\u00a0241', { exact: true }),
  ).toBeVisible();
});

for (const dirty of [false, true]) {
  test(`калькуляторы в разных вкладках сохраняют общую цель (черновик=${dirty})`, async ({
    page,
  }) => {
    await seed(page);
    await open(page);
    if (dirty) await manualCalories(page, '2900');
    await open(page, 'Профиль');
    await manualCalories(page, '3000');
    await save(page);
    await page.getByRole('tab', { name: 'Питание', exact: true }).click();
    const field = page
      .getByLabel('Целевая калорийность, ккал', { exact: true })
      .and(page.locator(':not([inert] *)'));
    if (dirty) {
      await expect(field).toHaveValue('2900');
      await expect(
        page.getByText(
          'Цели питания изменены на другом экране. Загрузите актуальные значения перед сохранением.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Сохранить изменения', exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('button', { name: 'Загрузить актуальные цели', exact: true })
        .click();
    }
    await expect(field).toHaveValue('3000');
    await save(page);
    await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
    await expect(
      page
        .getByText('ккал из 3\u00a0000', { exact: true })
        .and(page.locator(':not([inert] *)')),
    ).toBeVisible();
  });
}

test('пересчёт в другом окне сохраняет последнюю ручную цель', async ({
  page,
}) => {
  await seed(page);
  const other = await page.context().newPage();
  await other.goto(url);
  await expect(
    other.getByRole('heading', { name: 'Сегодня', exact: true }),
  ).toBeVisible();
  await open(page);
  await manualCalories(page, '3000');
  await save(page);
  await weight(other, '73');
  await open(other, 'Профиль');
  await expect(
    other.getByLabel('Целевая калорийность, ккал', { exact: true }),
  ).toHaveValue('3000');
  await expect(other.getByText('3\u00a0241 ккал', { exact: true })).toHaveCount(
    2,
  );
  await page.reload();
  await expect(
    page.getByText('ккал из 3\u00a0000', { exact: true }),
  ).toBeVisible();
});

test('автоматические цели пересчитываются при правке профиля и режима набора', async ({
  page,
}) => {
  await seed(page);
  await weight(page, '73');
  await open(page, 'Профиль');
  await expect(
    page.getByText('3\u00a0241 ккал', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Плавный набор', exact: true }).click();
  await expect(
    page.getByText('3\u00a0091 ккал', { exact: true }).first(),
  ).toBeVisible();
  await save(page);
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await expect(
    page
      .getByText('ккал из 3\u00a0091', { exact: true })
      .and(page.locator(':not([inert] *)')),
  ).toBeVisible();
});

test('ручной режим доступен при недостаточной калорийности автоматических БЖУ', async ({
  page,
}) => {
  await seed(page, {
    sex: 'female',
    birthDate: `01.01.${new Date().getFullYear() - 65}`,
    height: '150',
    currentWeight: '100',
    goal: 'lose',
    targetWeight: '90',
    activity: 'minimal',
  });
  await open(page);
  await manualCalories(page, '3000');
  await save(page);
  await page.reload();
  await expect(
    page.getByText('ккал из 3\u00a0000', { exact: true }),
  ).toBeVisible();
});

for (const changes of [
  { sex: 'unspecified' as const },
  { birthDate: '01.01.2015' },
]) {
  test(`не подставляет данные для ${JSON.stringify(changes)}`, async ({
    page,
  }) => {
    await seed(page, changes);
    await open(page);
    await expect(
      page.getByRole('button', {
        name: 'Заполнить данные профиля',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Сохранить изменения', exact: true }),
    ).toHaveCount(0);
  });
}

test('цели и ручные изменения переживают два холодных офлайн-перезапуска', async ({
  browser,
  browserName,
}) => {
  const directory = mkdtempSync(
    join(resolve('.expo'), 'nutrition-persistence-'),
  );
  const options = {
    headless: true,
    viewport: { width: 390, height: 844 },
    channel:
      browserName === 'chromium'
        ? process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
        : undefined,
  };
  let context = await browser
    .browserType()
    .launchPersistentContext(directory, options);
  try {
    let page = context.pages()[0] ?? (await context.newPage());
    await seed(page);
    await open(page);
    await manualCalories(page);
    await save(page);
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    await expect(
      page.getByText('Доступно без интернета', { exact: true }),
    ).toBeVisible();
    await context.close();
    context = await browser
      .browserType()
      .launchPersistentContext(directory, { ...options, offline: true });
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url + '/nutrition');
    await expect(
      page.getByText('ккал из 3\u00a0000', { exact: true }),
    ).toBeVisible();
    await open(page);
    await expect(
      page.getByLabel('Целевая калорийность, ккал', { exact: true }),
    ).toHaveValue('3000');
    await page
      .getByLabel('Целевая калорийность, ккал', { exact: true })
      .fill('3100');
    await save(page);
    await context.close();
    context = await browser
      .browserType()
      .launchPersistentContext(directory, { ...options, offline: true });
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url);
    await expect(
      page.getByText('ккал из 3\u00a0100', { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    if (!resolve(directory).startsWith(resolve('.expo') + sep))
      throw new Error('Unsafe browser profile cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});
