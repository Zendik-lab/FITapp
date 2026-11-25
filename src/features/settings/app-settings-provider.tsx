import { useState, type ReactNode } from 'react';

import type { AppSettings, ThemeMode } from './app-settings';
import {
  AppSettingsContext,
  type StorageRecovery,
} from './app-settings-context';
import { saveThemeMode } from './save-theme-mode';

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
  const settings = {
    ...initialSettings,
    themeMode: savedTheme ?? initialSettings.themeMode,
  };

  async function setThemeMode(themeMode: ThemeMode) {
    if (themeMode === settings.themeMode) return;
    await saveThemeMode(themeMode);
    setSavedTheme(themeMode);
  }

  return (
    <AppSettingsContext value={{ settings, setThemeMode, storageRecovery }}>
      {children}
    </AppSettingsContext>
  );
}
