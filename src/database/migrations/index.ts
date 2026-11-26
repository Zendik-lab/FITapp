import type { SQLiteDatabase } from 'expo-sqlite';

import { initialMigration } from './001-initial';
import { userStateMigration } from './002-user-state';
import { foodDiaryMigration } from './003-food-diary';

type Migration = {
  version: number;
  name: string;
  sql: string;
};

type Database = Pick<
  SQLiteDatabase,
  'execAsync' | 'getAllAsync' | 'runAsync' | 'withTransactionAsync'
>;

const migrations: readonly Migration[] = [
  initialMigration,
  userStateMigration,
  foodDiaryMigration,
];

export async function migrateDatabase(
  database: Database,
  plan: readonly Migration[] = migrations,
): Promise<void> {
  const ordered = [...plan].sort((left, right) => left.version - right.version);
  if (ordered.some((migration, index) => migration.version !== index + 1)) {
    throw new Error('Номера миграций должны идти подряд, начиная с 1.');
  }

  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = await database.getAllAsync<
      Pick<Migration, 'version' | 'name'>
    >('SELECT version, name FROM schema_migrations ORDER BY version');

    const matchesPlan = applied.every(
      ({ version, name }, index) =>
        ordered[index]?.version === version && ordered[index]?.name === name,
    );
    if (!matchesPlan) {
      throw new Error(
        'История миграций SQLite несовместима с этой версией приложения.',
      );
    }

    for (const migration of ordered.slice(applied.length)) {
      await database.execAsync(migration.sql);
      await database.runAsync(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    }
  });
}
