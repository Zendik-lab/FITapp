import { getSettingsStorage } from '@/database/settings-storage';

import { themePreferenceKey, type ThemeMode } from './app-settings';

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  const storage = await getSettingsStorage();
  await storage.apply([{ key: themePreferenceKey, value: mode }]);
}
