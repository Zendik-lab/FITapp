export const userStateMigration = {
  version: 2,
  name: 'add_user_state_schema',
  sql: `INSERT INTO app_settings (key, value, updated_at)
        VALUES ('user_state_schema', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO NOTHING;`,
};
