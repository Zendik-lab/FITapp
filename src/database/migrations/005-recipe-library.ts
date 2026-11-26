export const recipeLibraryMigration = {
  version: 5,
  name: 'add_recipe_library_schema',
  sql: `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('recipe_library_schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO NOTHING;`,
};
