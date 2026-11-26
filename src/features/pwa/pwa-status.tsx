import type { ComponentType, ReactNode } from 'react';
import Constants from 'expo-constants';
import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { SectionHeader } from '@/components/headers';
import { DiagnosticsSection } from '@/features/settings/diagnostics-section';
import { version } from '../../../package.json';

export function PwaProvider({ children }: { children: ReactNode }) {
  return children;
}

export const PwaNotices: ComponentType<{ blockUpdate?: boolean }> = () => null;

export const useUpdateBlocker: (enabled?: boolean) => void = () => {};
export function useConfirmPwaStartup() {}

export function AppVersionSection() {
  return (
    <Card>
      <SectionHeader title="Версия приложения" />
      <AppText>{Constants.expoConfig?.version ?? version}</AppText>
      <AppText variant="caption" tone="muted">
        Нативная сборка {Constants.expoConfig?.ios?.buildNumber ?? 'не задана'}
      </AppText>
      <AppText variant="caption" tone="muted">
        Обновления этой версии устанавливаются вместе с новой нативной сборкой.
        Expo OTA не настроен.
      </AppText>
    </Card>
  );
}

export function AppDiagnosticsSection() {
  return (
    <DiagnosticsSection
      rows={[
        { label: 'Версия', value: Constants.expoConfig?.version ?? version },
        {
          label: 'ID сборки',
          value: Constants.expoConfig?.ios?.buildNumber ?? 'не задан',
        },
        {
          label: 'Окружение',
          value: __DEV__ ? 'Разработка / Expo Go' : 'Native production',
        },
        {
          label: 'Service Worker и кеш PWA',
          value: 'Используются только в web',
        },
        {
          label: 'Проверка обновлений',
          value: 'Новая нативная сборка; Expo OTA не настроен',
        },
      ]}
    />
  );
}

export function InstallAppSection() {
  return null;
}
