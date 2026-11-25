import type { SQLiteDatabase } from 'expo-sqlite';

type Database = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export function createSettingsRepository(database: Database) {
  return {
    async get(key: string): Promise<string | null> {
      const row = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        key,
      );
      return row?.value ?? null;
    },

    async set(key: string, value: string): Promise<void> {
      await database.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
        new Date().toISOString(),
      );
    },

    async remove(key: string): Promise<void> {
      await database.runAsync('DELETE FROM app_settings WHERE key = ?', key);
    },
  };
}
