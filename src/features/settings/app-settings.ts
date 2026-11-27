import type { SettingsStorage } from '@/database/settings-contract';
import {
  decodePersonalization,
  personalizationKey,
  type Personalization,
} from './personalization';

export const themePreferenceKey = 'theme_mode';

export const themeModeLabels = {
  system: 'Системная',
  light: 'Светлая',
  dark: 'Тёмная',
} as const;

export type ThemeMode = keyof typeof themeModeLabels;

export type AppSettings = {
  locale: string;
  units: string;
  currency: string;
  themeMode: ThemeMode;
  personalization?: Personalization;
};

export const defaultAppSettings: AppSettings = {
  locale: 'ru-KZ',
  units: 'metric',
  currency: 'KZT',
  themeMode: 'system',
};

export async function loadAppSettings(
  repository: Pick<SettingsStorage, 'get'>,
): Promise<AppSettings> {
  const [locale, units, currency, themeMode, presentation] = await Promise.all([
    repository.get('locale'),
    repository.get('units'),
    repository.get('currency'),
    repository.get(themePreferenceKey),
    repository.get(personalizationKey),
  ]);

  return {
    locale: locale ?? defaultAppSettings.locale,
    units: units ?? defaultAppSettings.units,
    currency: currency ?? defaultAppSettings.currency,
    ...(presentation
      ? { personalization: decodePersonalization(presentation) }
      : {}),
    themeMode:
      themeMode === 'light' || themeMode === 'dark'
        ? themeMode
        : defaultAppSettings.themeMode,
  };
}
