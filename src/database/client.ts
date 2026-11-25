import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from './migrations';

let connection: Promise<SQLiteDatabase> | undefined;

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!connection) {
    connection = openAndMigrate().catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
  }

  return connection;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync('masstracker.db', {
    useNewConnection: true,
  });

  try {
    await database.execAsync(
      'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
    const journal = await database.getFirstAsync<{ journal_mode: string }>(
      'PRAGMA journal_mode = WAL',
    );
    if (journal?.journal_mode !== 'wal') {
      console.warn(
        '[MassTracker] SQLite использует режим журналирования',
        journal?.journal_mode,
      );
    }

    await migrateDatabase(database);
    return database;
  } catch (error) {
    try {
      await database.closeAsync();
    } catch (closeError) {
      console.error(
        '[MassTracker] Ошибка закрытия соединения SQLite',
        closeError,
      );
    }
    throw error;
  }
}
