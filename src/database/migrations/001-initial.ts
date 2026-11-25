export const initialMigration = {
  version: 1,
  name: 'create_app_settings',
  sql: `
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO app_settings (key, value, updated_at)
    VALUES
      ('locale', 'ru-KZ', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('units', 'metric', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ('currency', 'KZT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `,
};
