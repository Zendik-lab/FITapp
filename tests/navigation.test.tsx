import { selectionAsync } from 'expo-haptics';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { saveThemeMode } from '@/features/settings/save-theme-mode';
import { initializeApp } from '@/features/startup/initialize-app';

jest.mock('@/features/startup/initialize-app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('@/features/settings/save-theme-mode', () => ({
  saveThemeMode: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.mocked(selectionAsync).mockClear();
  jest.mocked(initializeApp).mockResolvedValue({
    locale: 'ru-KZ',
    units: 'metric',
    currency: 'KZT',
    themeMode: 'system',
  });
});

test('открывает «Сегодня» и переключает все пять вкладок', async () => {
  await renderRouter('./app');

  expect(await screen.findByRole('header', { name: 'Сегодня' })).toBeTruthy();
  const tabs = [
    ['Питание', '/nutrition'],
    ['Тренировки', '/workouts'],
    ['Прогресс', '/progress'],
    ['Профиль', '/profile'],
    ['Сегодня', '/'],
  ];

  for (const [title, pathname] of tabs) {
    await fireEvent.press(screen.getByLabelText(title));
    expect(await screen.findByRole('header', { name: title })).toBeTruthy();
    expect(screen).toHavePathname(pathname);
  }
  expect(selectionAsync).toHaveBeenCalledTimes(5);
  await fireEvent.press(screen.getByLabelText('Сегодня'));
  expect(selectionAsync).toHaveBeenCalledTimes(5);
});

test('переносит выбранную дату между разделами и показывает статус будущих функций', async () => {
  await renderRouter('./app');

  await fireEvent.press(
    await screen.findByRole('button', { name: 'Предыдущая неделя' }),
  );
  await fireEvent.press(screen.getByLabelText('Питание'));
  expect(await screen.findByText('Завтрак')).toBeTruthy();
  expect(screen.getByText('Записей нет')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сканировать штрихкод' }),
  );
  expect(await screen.findByText(/функция ещё разрабатывается/i)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Понятно' }));
  expect(screen.queryByText(/функция ещё разрабатывается/i)).toBeNull();
});

test('переключает период графика', async () => {
  await renderRouter('./app');

  await fireEvent.press(await screen.findByLabelText('Прогресс'));
  await fireEvent.press(await screen.findByRole('tab', { name: 'Год' }));
  expect(screen.getByRole('tab', { name: 'Год', selected: true })).toBeTruthy();
  expect(screen.getByRole('image', { name: /график веса, год/i })).toBeTruthy();
});

test('подтверждает режим темы после сохранения и позволяет повторить запись после ошибки', async () => {
  jest
    .mocked(saveThemeMode)
    .mockRejectedValueOnce(new Error('SQLite unavailable'));
  jest.mocked(saveThemeMode).mockResolvedValueOnce();
  await renderRouter('./app');

  await fireEvent.press(await screen.findByLabelText('Профиль'));
  await fireEvent.press(
    await screen.findByRole('button', { name: /Внешний вид/ }),
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }));
  expect(await screen.findByText(/не удалось сохранить тему/i)).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: 'Системная', checked: true }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }));
  expect(
    await screen.findByRole('button', { name: /Внешний вид, Тёмная/ }),
  ).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Профиль' })).toHaveStyle({
    color: '#FFFFFF',
  });
  expect(saveThemeMode).toHaveBeenLastCalledWith('dark');
  await fireEvent.press(
    screen.getByRole('button', { name: /Внешний вид, Тёмная/ }),
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'Светлая' }));
  expect(
    await screen.findByRole('button', { name: /Внешний вид, Светлая/ }),
  ).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Профиль' })).toHaveStyle({
    color: '#1C1C1E',
  });
  await fireEvent.press(
    screen.getByRole('button', { name: /Внешний вид, Светлая/ }),
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'Системная' }));
  expect(
    await screen.findByRole('button', { name: /Внешний вид, Системная/ }),
  ).toBeTruthy();
  expect(saveThemeMode).toHaveBeenLastCalledWith('system');
});
