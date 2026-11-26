export const foodDiaryMigration = {
  version: 3,
  name: 'add_food_diary_schema',
  sql: `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('food_diary_schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO NOTHING;`,
};
