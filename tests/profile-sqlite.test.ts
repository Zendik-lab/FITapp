/** @jest-environment node */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { migrateDatabase } from '@/database/migrations';
import { getSettingsStorage } from '@/database/settings-storage';
import { createProfileRepository } from '@/database/repositories/profile';
import { initialMigration } from '@/database/migrations/001-initial';
import { sampleDraft } from './fixtures/profile';

let sql: DatabaseSync;
function bindings(params: unknown[]): SQLInputValue[] {
  const values: unknown[] =
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values.map((value) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      value === null ||
      value instanceof Uint8Array
    )
      return value;
    if (typeof value === 'boolean') return Number(value);
    throw new Error('Unsupported test binding');
  });
}
const mockDatabase = {
  execAsync: async (statement: string) => {
    sql.exec(statement);
  },
  getFirstAsync: async <T>(statement: string, ...params: unknown[]) =>
    sql.prepare(statement).get(...bindings(params)) as T | null,
  getAllAsync: async <T>(statement: string, ...params: unknown[]) =>
    sql.prepare(statement).all(...bindings(params)) as T[],
  runAsync: async (statement: string, ...params: unknown[]) => {
    const result = sql.prepare(statement).run(...bindings(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  },
  withTransactionAsync: async (operation: () => Promise<void>) => {
    sql.exec('BEGIN');
    try {
      await operation();
      sql.exec('COMMIT');
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
};
jest.mock('@/database/client', () => ({
  getDatabase: async () => mockDatabase,
}));
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
});
afterEach(() => sql.close());

test('реальный SQLite обновляет схему v1 и сохраняет профиль с параметризованным именем', async () => {
  await migrateDatabase(mockDatabase, [initialMigration]);
  sql
    .prepare(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    )
    .run('theme_mode', 'dark', 'old');
  await migrateDatabase(mockDatabase);
  const storage = await getSettingsStorage();
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(await storage.get('user_state_schema')).toBe('1');
  const repository = createProfileRepository(storage);
  const name = "Алекс'; DROP TABLE app_settings; --";
  await repository.complete({ ...sampleDraft, name });
  const reopened = createProfileRepository(await getSettingsStorage());
  expect((await reopened.load()).profile?.personal.name).toBe(name);
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(
    sql.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
  ).toEqual([{ version: 1 }, { version: 2 }]);
});
