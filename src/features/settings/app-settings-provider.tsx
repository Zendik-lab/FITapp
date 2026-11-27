import { useState, type ReactNode } from 'react';

import type { AppSettings, ThemeMode } from './app-settings';
import {
  AppSettingsContext,
  type StorageRecovery,
} from './app-settings-context';
import { saveThemeMode } from './save-theme-mode';
import { getSettingsStorage } from '@/database/settings-storage';
import {
  decodePersonalization,
  personalizationKey,
  type Personalization,
} from './personalization';

export function AppSettingsProvider({
  initialSettings,
  storageRecovery,
  children,
}: {
  initialSettings: AppSettings;
  storageRecovery?: StorageRecovery;
  children: ReactNode;
}) {
  const [savedTheme, setSavedTheme] = useState<ThemeMode>();
  const [presentation, setPresentation] = useState<Personalization>();
  const settings = {
    ...initialSettings,
    themeMode: savedTheme ?? initialSettings.themeMode,
    personalization: presentation ?? initialSettings.personalization,
  };

  async function setThemeMode(themeMode: ThemeMode) {
    if (themeMode === settings.themeMode) return;
    await saveThemeMode(themeMode);
    setSavedTheme(themeMode);
  }

  async function setPersonalization(preferences: Personalization) {
    const value = JSON.stringify(preferences);
    const decoded = decodePersonalization(value);
    const storage = await getSettingsStorage();
    await storage.apply([{ key: personalizationKey, value }]);
    setPresentation(decoded);
  }

  return (
    <AppSettingsContext
      value={{ settings, setThemeMode, setPersonalization, storageRecovery }}
    >
      {children}
    </AppSettingsContext>
  );
}
