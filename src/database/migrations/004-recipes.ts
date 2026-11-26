export const recipesMigration = {
  version: 4,
  name: 'add_recipes_schema',
  sql: `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('recipes_schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO NOTHING;`,
};
