import { getDatabase } from './client';
import { createSettingsRepository } from './repositories/settings';
import type { SettingsStorage } from './settings-contract';
import { trackSettingsWrite } from './settings-writes';

export async function getSettingsStorage(): Promise<SettingsStorage> {
  const database = await getDatabase();
  const repository = createSettingsRepository(database);

  return {
    get: repository.get,
    list: () =>
      database.getAllAsync(
        'SELECT key, value, updated_at AS updatedAt FROM app_settings ORDER BY key',
      ),
    apply: (changes) =>
      trackSettingsWrite(async () => {
        if (changes.length === 1) {
          const { key, value } = changes[0];
          return value === null
            ? repository.remove(key)
            : repository.set(key, value);
        }
        if (changes.length === 0) return;

        await database.withExclusiveTransactionAsync(async (transaction) => {
          const batch = createSettingsRepository(transaction);
          for (const { key, value } of changes) {
            if (value === null) await batch.remove(key);
            else await batch.set(key, value);
          }
        });
      }),
  };
}
