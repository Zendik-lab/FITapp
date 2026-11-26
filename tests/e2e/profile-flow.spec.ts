import { test, expect, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import { resolve, join, sep } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createStaticServer } from '../../scripts/serve-web.cjs';

let server: Server;
let url: string;
test.beforeAll(async () => {
  server = createStaticServer(resolve('dist'));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server');
  url = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

test('быстрый ввод двух полей одним пакетом переживает reload без потери даты рождения', async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByLabel('Дата рождения', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (!setValue) throw new Error('Missing input setter');
    for (const [id, value] of [
      ['birthDate', '01.01.1996'],
      ['height', '180'],
    ]) {
      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement))
        throw new Error(`Missing ${id}`);
      setValue.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect(
    page.getByText('Ответы сохранены на устройстве.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Дата рождения', { exact: true })).toHaveValue(
    '01.01.1996',
  );
  await expect(page.getByLabel('Рост, см', { exact: true })).toHaveValue('180');
});

async function continueStep(page: Page) {
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
}

async function reachSummary(page: Page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await continueStep(page);
  await expect(
    page.getByText('Укажите имя от 1 до 80 символов.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Имя', { exact: true }).fill('Алекс');
  await page.getByLabel('Дата рождения', { exact: true }).fill('01.01.1996');
  // Wait for the controlled form to accept WebKit's input event, rather than
  // treating the DOM value changed by automation as a saved application value.
  await expect(page.getByText(/^Возраст: \d+$/)).toBeVisible();
  const male = page.getByRole('radio', { name: 'Мужской', exact: true });
  await male.focus();
  await male.press('Space');
  await expect(male).toBeChecked();
  await male.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Женский', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(male).toBeChecked();
  await page.getByLabel('Рост, см', { exact: true }).fill('180');
  await page.getByLabel('Текущий вес, кг', { exact: true }).fill('70,5');
  await expect(
    page.getByText('Ответы сохранены на устройстве.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Алекс');
  await expect(page.getByLabel('Текущий вес, кг', { exact: true })).toHaveValue(
    '70,5',
  );
  await expect(page.getByLabel('Дата рождения', { exact: true })).toHaveValue(
    '01.01.1996',
  );
  await expect(page.getByLabel('Рост, см', { exact: true })).toHaveValue('180');
  await expect(
    page.getByRole('radio', { name: 'Мужской', exact: true }),
  ).toBeChecked();
  await continueStep(page);
  await page.getByRole('radio', { name: 'Набор массы', exact: true }).click();
  await continueStep(page);
  await page.getByLabel('Целевой вес, кг', { exact: true }).fill('76');
  await continueStep(page);
  await page
    .getByRole('radio', { name: 'Средняя активность', exact: true })
    .click();
  await continueStep(page);
  await page.getByLabel('Тренировок в неделю', { exact: true }).fill('0');
  await continueStep(page);
  await page
    .getByRole('button', {
      name: 'Пропустить необязательные поля',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Всё готово', exact: true }),
  ).toBeVisible();
}

test('анкета, восстановление, редактирование, темы и повторное прохождение без потери данных', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reachSummary(page);
  await page
    .getByRole('button', { name: 'Изменить: Личная информация', exact: true })
    .click();
  await page.getByLabel('Имя', { exact: true }).fill('Александр');
  await continueStep(page);
  await expect(
    page.getByRole('heading', { name: 'Всё готово', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Создать мой профиль', exact: true })
    .click();
  await expect(
    page.getByText('Привет, Александр!', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Пока не рассчитаны.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('70,5 кг', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('today-light.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: /^Личная информация,/ }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Мария');
  await page
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(
    page.getByText('Профиль обновлён.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Внешний вид,/ }).click();
  await page.getByRole('radio', { name: 'Тёмная', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Внешний вид, Тёмная', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: /^Личная информация, Мария/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Внешний вид, Тёмная', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('profile-dark.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Пройти анкетирование заново', exact: true })
    .click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Сегодня', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Доступно без интернета', { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Пройти анкетирование заново', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Начать заново', exact: true })
    .click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Мария');
  await page.reload();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Мария');
  await expect(page.getByLabel('Текущий вес, кг', { exact: true })).toHaveValue(
    '70.5',
  );
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.getByTestId('form-content')).toHaveCSS('opacity', '1');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('onboarding-dark-320.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('ошибка финальной записи сохраняет ответы и позволяет повторить создание профиля', async ({
  page,
}) => {
  await reachSummary(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === 'user_state'
      )
        throw new DOMException('test quota', 'QuotaExceededError');
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
    Object.defineProperty(window, 'restoreProfileWrites', {
      value: () => {
        IDBObjectStore.prototype.put = put;
      },
    });
  });
  await page
    .getByRole('button', { name: 'Создать мой профиль', exact: true })
    .click();
  await expect(page.getByText(/Не удалось сохранить данные/)).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Всё готово', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const restore: unknown = Reflect.get(window, 'restoreProfileWrites');
    if (typeof restore !== 'function')
      throw new Error('Missing write recovery');
    restore();
  });
  await page
    .getByRole('button', { name: 'Создать мой профиль', exact: true })
    .click();
  await expect(page.getByText('Привет, Алекс!', { exact: true })).toBeVisible();
});

test('каждый раздел профиля редактируется отдельно и сохраняется после перезапуска', async ({
  page,
}) => {
  await reachSummary(page);
  await page
    .getByRole('button', { name: 'Создать мой профиль', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  const save = async () => {
    await page
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Профиль', exact: true }),
    ).toBeVisible();
  };
  await page.getByRole('button', { name: /^Параметры тела,/ }).click();
  await page.getByLabel('Рост, см', { exact: true }).fill('175');
  await page.getByLabel('Текущий вес, кг', { exact: true }).fill('72');
  await save();
  await page.getByRole('button', { name: /^Моя цель,/ }).click();
  await page
    .getByRole('radio', { name: 'Поддержание веса', exact: true })
    .click();
  await expect(page.getByLabel('Целевой вес, кг', { exact: true })).toHaveValue(
    '72',
  );
  await save();
  await page.getByRole('button', { name: /^Физическая активность,/ }).click();
  await page
    .getByRole('radio', { name: 'Высокая активность', exact: true })
    .click();
  await save();
  await page.getByRole('button', { name: /^Тренировки,/ }).click();
  await page.getByLabel('Тренировок в неделю', { exact: true }).fill('4');
  await page.getByRole('radio', { name: 'Кардио', exact: true }).click();
  await page.getByRole('radio', { name: 'Опытный', exact: true }).click();
  await save();
  await page.getByRole('button', { name: /^Пищевые предпочтения,/ }).click();
  await page.getByLabel('Приёмов пищи в день', { exact: true }).fill('4');
  await page
    .getByLabel('Предпочтительный режим питания', { exact: true })
    .fill('Вегетарианский');
  await page.getByLabel('Не употребляю', { exact: true }).fill('Мясо');
  await page.getByLabel('Аллергии', { exact: true }).fill('Арахис');
  await page
    .getByLabel('Пищевые ограничения', { exact: true })
    .fill('Без лактозы');
  await save();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: 'Моя цель, Поддержание веса',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Физическая активность, Высокая активность',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Тренировки, 4 в неделю', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Пищевые предпочтения,/ }).click();
  await expect(page.getByLabel('Аллергии', { exact: true })).toHaveValue(
    'Арахис',
  );
  await expect(
    page.getByLabel('Пищевые ограничения', { exact: true }),
  ).toHaveValue('Без лактозы');
  await page
    .getByRole('button', { name: 'Назад без сохранения', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByText('72 кг', { exact: true })).toBeVisible();
  await expect(
    page.getByText('До целевого веса: 0 кг', { exact: true }),
  ).toBeVisible();
});

test('заполненная анкета, цель и тема переживают два полных перезапуска браузера с офлайн-правками', async ({
  browser,
  browserName,
}) => {
  // WebKit on Windows needs a short path for its on-disk Cache API bodies.
  const directory = mkdtempSync(join(resolve('.expo'), 'persistence-'));
  const options = {
    headless: true,
    viewport: { width: 390, height: 844 },
    channel:
      browserName === 'chromium'
        ? process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
        : undefined,
  };
  let persistent = await browser
    .browserType()
    .launchPersistentContext(directory, options);
  try {
    let page = persistent.pages()[0] ?? (await persistent.newPage());
    await reachSummary(page);
    await page
      .getByRole('button', { name: 'Создать мой профиль', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    await page.getByRole('button', { name: /^Моя цель,/ }).click();
    await page.getByLabel('Целевой вес, кг', { exact: true }).fill('78');
    await page
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await page.getByRole('button', { name: /^Внешний вид,/ }).click();
    await page.getByRole('radio', { name: 'Тёмная', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Внешний вид, Тёмная', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Доступно без интернета', { exact: true }),
    ).toBeVisible();
    await persistent.close();
    persistent = await browser
      .browserType()
      .launchPersistentContext(directory, { ...options, offline: true });
    page = persistent.pages()[0] ?? (await persistent.newPage());
    await page.goto(url + '/profile');
    await expect(
      page.getByRole('button', { name: /^Личная информация, Алекс/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Внешний вид, Тёмная', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Моя цель,/ }).click();
    await expect(
      page.getByLabel('Целевой вес, кг', { exact: true }),
    ).toHaveValue('78');
    await page.getByLabel('Целевой вес, кг', { exact: true }).fill('79');
    await page
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await page.getByRole('button', { name: /^Личная информация,/ }).click();
    await page.getByLabel('Имя', { exact: true }).fill('Офлайн Алекс');
    await page
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: /^Личная информация, Офлайн Алекс/ }),
    ).toBeVisible();
    await persistent.close();
    persistent = await browser
      .browserType()
      .launchPersistentContext(directory, { ...options, offline: true });
    page = persistent.pages()[0] ?? (await persistent.newPage());
    await page.goto(url);
    await expect(
      page.getByText('Привет, Офлайн Алекс!', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('70,5 кг', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    await page.getByRole('button', { name: /^Моя цель,/ }).click();
    await expect(
      page.getByLabel('Целевой вес, кг', { exact: true }),
    ).toHaveValue('79');
  } finally {
    await persistent.close();
    if (!resolve(directory).startsWith(resolve('.expo') + sep))
      throw new Error('Unsafe browser profile cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});
