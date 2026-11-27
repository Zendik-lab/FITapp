import { createContext } from 'react';

import type { AppSettings, ThemeMode } from './app-settings';
import type { Personalization } from './personalization';

export type StorageRecovery = {
  retry: () => void;
  pending: boolean;
  message?: string;
};

export const AppSettingsContext = createContext<{
  settings: AppSettings;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setPersonalization?: (preferences: Personalization) => Promise<void>;
  storageRecovery?: StorageRecovery;
} | null>(null);
