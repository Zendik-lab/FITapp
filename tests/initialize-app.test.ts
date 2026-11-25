import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/database/client';
import { initializeApp } from '@/features/startup/initialize-app';

jest.mock('@/database/client', () => ({ getDatabase: jest.fn() }));

afterEach(() => jest.useRealTimers());

test('загружает сохранённую настройку и подставляет значения по умолчанию для отсутствующих', async () => {
  const database = {
    getFirstAsync: jest
      .fn()
      .mockResolvedValueOnce({ value: 'ru' })
      .mockResolvedValue(null),
  } as unknown as SQLiteDatabase;
  jest.mocked(getDatabase).mockResolvedValueOnce(database);

  await expect(initializeApp()).resolves.toEqual({
    locale: 'ru',
    units: 'metric',
    currency: 'KZT',
    themeMode: 'system',
  });
});

test.each([
  ['dark', 'dark'],
  ['light', 'light'],
  ['invalid', 'system'],
])('восстанавливает режим темы %s как %s', async (stored, expected) => {
  const database = {
    getFirstAsync: jest.fn(async (_sql: string, key: string) =>
      key === 'theme_mode' ? { value: stored } : null,
    ),
  } as unknown as SQLiteDatabase;
  jest.mocked(getDatabase).mockResolvedValueOnce(database);

  await expect(initializeApp()).resolves.toMatchObject({ themeMode: expected });
});

test('передаёт ошибку открытия базы для обработки на экране запуска', async () => {
  const failure = new Error('SQLite unavailable');
  jest.mocked(getDatabase).mockRejectedValueOnce(failure);

  await expect(initializeApp()).rejects.toBe(failure);
});

test('завершает ожидание, если SQLite не отвечает', async () => {
  jest.useFakeTimers();
  jest.mocked(getDatabase).mockReturnValueOnce(new Promise(() => {}));

  const result = expect(initializeApp()).rejects.toThrow(/время ожидания/i);
  await jest.runAllTimersAsync();
  await result;
});
