import { openDatabaseAsync } from 'expo-sqlite';

import { getDatabase } from '@/database/client';
import { migrateDatabase } from '@/database/migrations';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('@/database/migrations', () => ({ migrateDatabase: jest.fn() }));

test('разделяет одну попытку, закрывает соединение после ошибки и открывает его повторно', async () => {
  const error = new Error('SQLite disk I/O error');
  const database = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue({ journal_mode: 'wal' }),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  } as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>;
  jest.mocked(openDatabaseAsync).mockResolvedValue(database);
  jest
    .mocked(migrateDatabase)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(undefined);

  const firstAttempt = getDatabase();
  expect(getDatabase()).toBe(firstAttempt);
  await expect(firstAttempt).rejects.toBe(error);
  expect(database.closeAsync).toHaveBeenCalledTimes(1);

  await expect(getDatabase()).resolves.toBe(database);
  await expect(getDatabase()).resolves.toBe(database);
  expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  expect(database.execAsync).toHaveBeenCalledWith(
    expect.stringContaining('PRAGMA foreign_keys = ON'),
  );
});
