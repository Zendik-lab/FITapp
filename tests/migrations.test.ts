import { migrateDatabase } from '@/database/migrations';

const migration1 = {
  version: 1,
  name: 'первый',
  sql: 'CREATE TABLE first_table (id INTEGER)',
};
const migration2 = {
  version: 2,
  name: 'второй',
  sql: 'CREATE TABLE second_table (id INTEGER)',
};

function mockDatabase(history: { version: number; name: string }[] = []) {
  const events: string[] = [];
  const database = {
    execAsync: jest.fn(async (sql: string) => {
      events.push(
        sql === migration1.sql || sql === migration2.sql ? sql : 'журнал',
      );
    }),
    getAllAsync: jest.fn().mockResolvedValue(history),
    runAsync: jest
      .fn()
      .mockImplementation(
        async (_sql: string, version: number, name: string) => {
          events.push(`запись: ${version} ${name}`);
          return { changes: 1, lastInsertRowId: version };
        },
      ),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
      events.push('начало');
      await callback();
      events.push('фиксация');
    }),
  };
  return { ...database, events };
}

test('применяет миграции по возрастанию и записывает их в той же транзакции', async () => {
  const database = mockDatabase();

  await migrateDatabase(database, [migration2, migration1]);

  expect(database.events).toEqual([
    'начало',
    'журнал',
    migration1.sql,
    'запись: 1 первый',
    migration2.sql,
    'запись: 2 второй',
    'фиксация',
  ]);
});

test('не применяет заново уже записанную миграцию', async () => {
  const database = mockDatabase([{ version: 1, name: 'первый' }]);

  await migrateDatabase(database, [migration1, migration2]);

  expect(database.events).toEqual([
    'начало',
    'журнал',
    migration2.sql,
    'запись: 2 второй',
    'фиксация',
  ]);
});

test('прерывает обновление, если история базы относится к более новой версии', async () => {
  const database = mockDatabase([
    { version: 1, name: 'первый' },
    { version: 2, name: 'второй' },
  ]);

  await expect(migrateDatabase(database, [migration1])).rejects.toThrow(
    /истори/i,
  );
  expect(database.runAsync).not.toHaveBeenCalled();
  expect(database.events).not.toContain('фиксация');
});

test('передаёт ошибку SQL из транзакции и не записывает версию', async () => {
  const database = mockDatabase();
  const failure = new Error('SQLite disk I/O error');
  database.execAsync
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(failure);

  await expect(
    migrateDatabase(database, [migration1, migration2]),
  ).rejects.toBe(failure);
  expect(database.runAsync).not.toHaveBeenCalled();
  expect(database.events).not.toContain('фиксация');
});
