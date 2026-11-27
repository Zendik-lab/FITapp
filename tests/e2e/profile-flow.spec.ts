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

test('посимвольный ввод сохраняет фокус и курсор после автосохранения', async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const name = page.getByLabel('Имя', { exact: true });
  const original = await name.elementHandle();
  await name.focus();
  for (const character of 'Alex') {
    await page.keyboard.type(character);
    await expect(name).toBeFocused();
    await expect(
      page.getByText('Ответы сохранены на устройстве.', { exact: true }),
    ).toBeVisible();
    expect(await original?.evaluate((node) => node.isConnected)).toBe(true);
  }
  await expect(name).toHaveValue('Alex');
  await name.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 3));
  await page.keyboard.type('i');
  await expect(name).toHaveValue('Aix');
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((node: HTMLInputElement) => [
      node.selectionStart,
      node.selectionEnd,
    ]),
  ).toEqual([2, 2]);
});

for (const standalone of [false, true]) {
  test(`прокрутка формы при вводе не закрывает клавиатуру (standalone=${standalone})`, async ({
    page,
  }) => {
    if (standalone) {
      // Exercise the installed-mode code path; this is not an installed iOS PWA.
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'standalone', { get: () => true }),
      );
    }
    await page.goto(url);
    await page.getByRole('button', { name: 'Начать', exact: true }).click();
    const height = page.getByLabel('Рост, см', { exact: true });
    await height.focus();
    await page.keyboard.type('1');
    await expect(height).toHaveValue('1');
    expect(
      await height.evaluate((node: HTMLInputElement) => node.selectionStart),
    ).toBe(1);
    // Safari scrolls the form to keep the caret visible as the keyboard and
    // visual viewport change. Use a real scroll, without any touch/drag gesture.
    const scroll = await height.evaluate(async (input) => {
      let parent = input.parentElement;
      while (parent) {
        if (
          parent.scrollHeight > parent.clientHeight &&
          /auto|scroll/.test(getComputedStyle(parent).overflowY)
        ) {
          const before = parent.scrollTop;
          const scrolled = new Promise<void>((resolve) =>
            parent?.addEventListener('scroll', () => resolve(), { once: true }),
          );
          parent.scrollTop = before > 24 ? before - 24 : before + 24;
          const changed = parent.scrollTop !== before;
          if (changed) await scrolled;
          return changed;
        }
        parent = parent.parentElement;
      }
      return false;
    });
    expect(scroll).toBe(true);
    await expect(height).toBeFocused();
    expect(
      await height.evaluate((node: HTMLInputElement) => node.selectionStart),
    ).toBe(1);
    await page.keyboard.type('80,5');
    await expect(height).toHaveValue('180,5');
    await expect(height).toBeFocused();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(height).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(height).toHaveValue('180,');
    await expect(height).toBeFocused();
    await height.press('Enter');
    await expect(height).not.toBeFocused();
  });
}

test('целочисленные поля используют цифровую клавиатуру', async ({ page }) => {
  await reachSummary(page);
  await page
    .getByRole('button', { name: 'Изменить: Тренировки', exact: true })
    .click();
  await expect(
    page.getByLabel('Тренировок в неделю', { exact: true }),
  ).toHaveAttribute('inputmode', 'numeric');
});

test('быстрый ввод двух полей одним пакетом переживает reload без потери даты рождения', async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  const birthDate = page.getByLabel('Дата рождения', { exact: true });
  const height = page.getByLabel('Рост, см', { exact: true });
  await expect(birthDate).toBeEditable();
  await expect(height).toBeEditable();
  await page.evaluate(
    ({ birthDate, height }) => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setValue) throw new Error('Missing input setter');
      for (const [input, value] of [
        [birthDate, '01.01.1996'],
        [height, '180'],
      ] as const) {
        if (!(input instanceof HTMLInputElement))
          throw new Error('Expected an editable input');
        setValue.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    {
      birthDate: await birthDate.elementHandle(),
      height: await height.elementHandle(),
    },
  );
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

async function typeField(
  page: Page,
  label: string,
  value: string,
  inputMode: 'text' | 'numeric' | 'decimal' = 'text',
  autosave = false,
) {
  const field = page.getByLabel(label, { exact: true });
  await expect(field).toBeEditable();
  const original = await field.evaluateHandle((node) => node);
  if (inputMode !== 'text') {
    await expect(field).toHaveAttribute('inputmode', inputMode);
    // A text input with a keypad hint accepts both decimal separators and
    // intermediate values, and supports selection APIs unlike type=number.
    await expect(field).toHaveAttribute('type', 'text');
  }
  await field.focus();
  await field.evaluate((node: HTMLInputElement | HTMLTextAreaElement) =>
    node.setSelectionRange(0, node.value.length),
  );
  await page.keyboard.press('Backspace');
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  let expected = '';
  for (const character of value) {
    await page.keyboard.type(character);
    expected += character;
    await expect(field).toHaveValue(expected);
    await expect(field).toBeFocused();
    if (autosave) {
      await expect(
        page.getByText('Ответы сохранены на устройстве.', { exact: true }),
      ).toBeVisible();
      await expect(field).toBeFocused();
    }
    expect(await original.evaluate((node) => node.isConnected)).toBe(true);
    expect(
      await field.evaluate(
        (node: HTMLInputElement | HTMLTextAreaElement) => node.selectionStart,
      ),
    ).toBe(expected.length);
  }
  await original.dispose();
}

test('все поля анкеты и профиля допускают посимвольное редактирование', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  // Validation must preserve editable raw text, even while errors are visible.
  await continueStep(page);
  await typeField(page, 'Имя', 'Алекс', 'text', true);
  await typeField(page, 'Дата рождения', '01.01.1996', 'text', true);
  await expect(page.getByText(/^Возраст: \d+$/)).toBeVisible();
  await page.getByRole('radio', { name: 'Мужской', exact: true }).click();
  await typeField(page, 'Рост, см', '180.5', 'decimal', true);
  await typeField(page, 'Текущий вес, кг', '70,5', 'decimal', true);
  // Replace a digit in the middle without changing the separator or caret.
  const weight = page.getByLabel('Текущий вес, кг', { exact: true });
  await weight.evaluate((node: HTMLInputElement) =>
    node.setSelectionRange(1, 2),
  );
  await page.keyboard.type('1');
  await expect(weight).toHaveValue('71,5');
  await expect(weight).toBeFocused();
  expect(
    await weight.evaluate((node: HTMLInputElement) => node.selectionStart),
  ).toBe(2);
  await continueStep(page);
  await page.getByRole('radio', { name: 'Набор массы', exact: true }).click();
  await continueStep(page);
  await typeField(page, 'Целевой вес, кг', '76.25', 'decimal', true);
  await page.getByRole('radio', { name: 'Свой темп', exact: true }).click();
  await typeField(page, 'Темп, кг в неделю', '0,35', 'decimal', true);
  await continueStep(page);
  await page
    .getByRole('radio', { name: 'Средняя активность', exact: true })
    .click();
  await continueStep(page);
  await typeField(page, 'Тренировок в неделю', '14', 'numeric', true);
  await page.getByRole('radio', { name: 'Силовые', exact: true }).click();
  await page.getByRole('radio', { name: 'Начинающий', exact: true }).click();
  await continueStep(page);
  await typeField(page, 'Приёмов пищи в день', '10', 'numeric', true);
  await typeField(
    page,
    'Предпочтительный режим питания',
    'Обычный',
    'text',
    true,
  );
  await typeField(page, 'Не употребляю', 'Рыба\nМясо', 'text', true);
  await typeField(page, 'Аллергии', 'Орехи', 'text', true);
  await typeField(page, 'Пищевые ограничения', 'Нет', 'text', true);
  await continueStep(page);
  await page
    .getByRole('button', { name: 'Создать мой профиль', exact: true })
    .click();
  await expect(page.getByText('Привет, Алекс!', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();

  const edits: readonly {
    section: RegExp;
    fields: readonly [string, string, ('text' | 'numeric' | 'decimal')?][];
  }[] = [
    {
      section: /^Личная информация,/,
      fields: [
        ['Имя', 'Мария'],
        ['Дата рождения', '02.03.1995'],
      ],
    },
    {
      section: /^Параметры тела,/,
      fields: [
        ['Рост, см', '175,5', 'decimal'],
        ['Текущий вес, кг', '72.25', 'decimal'],
      ],
    },
    {
      section: /^Моя цель,/,
      fields: [
        ['Целевой вес, кг', '77,5', 'decimal'],
        ['Темп, кг в неделю', '0.25', 'decimal'],
      ],
    },
    {
      section: /^Тренировки,/,
      fields: [['Тренировок в неделю', '12', 'numeric']],
    },
    {
      section: /^Пищевые предпочтения,/,
      fields: [
        ['Приёмов пищи в день', '4', 'numeric'],
        ['Предпочтительный режим питания', 'Обычный'],
        ['Не употребляю', 'Мясо\nРыба'],
        ['Аллергии', 'Нет'],
        ['Пищевые ограничения', 'Нет'],
      ],
    },
  ];
  for (const edit of edits) {
    await page.getByRole('button', { name: edit.section }).click();
    for (const [label, value, mode] of edit.fields) {
      await typeField(page, label, value, mode);
    }
    await page
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(
      page.getByText('Профиль обновлён.', { exact: true }),
    ).toBeVisible();
  }
  await page.reload();
  await page.getByRole('button', { name: /^Параметры тела,/ }).click();
  await expect(page.getByLabel('Рост, см', { exact: true })).toHaveValue(
    '175.5',
  );
  await expect(page.getByLabel('Текущий вес, кг', { exact: true })).toHaveValue(
    '72.25',
  );
  expect(errors).toEqual([]);
});

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

test('ошибка автосохранения и отключение сети сохраняют редактируемое поле', async ({
  page,
  context,
}) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
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
  await typeField(page, 'Имя', 'Алекс');
  await expect(page.getByText(/Не удалось сохранить данные/)).toBeVisible();
  const name = page.getByLabel('Имя', { exact: true });
  await expect(name).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await expect(page.getByText('Офлайн', { exact: true })).toBeVisible();
  await expect(name).toBeFocused();
  await page.keyboard.type('андр');
  await expect(name).toHaveValue('Александр');
  await expect(name).toBeFocused();
  await page.evaluate(() => {
    const restore: unknown = Reflect.get(window, 'restoreProfileWrites');
    if (typeof restore !== 'function')
      throw new Error('Missing write recovery');
    restore();
  });
  // The next input retries persistence without moving focus to a retry button.
  await page.keyboard.press('Backspace');
  await expect(
    page.getByText('Ответы сохранены на устройстве.', { exact: true }),
  ).toBeVisible();
  await expect(name).toBeFocused();
  await page.reload();
  await expect(name).toHaveValue('Александ');
});

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
    page.getByRole('button', { name: 'Калории и БЖУ', exact: true }),
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
