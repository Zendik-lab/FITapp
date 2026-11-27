export const mealPlannerMigration = {
  version: 6,
  name: 'add_meal_planner_schema',
  sql: `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('meal_planner_schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO NOTHING;`,
};
