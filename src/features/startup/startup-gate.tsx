import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { StatusScreen } from '@/components/status-screen';
import { AppSettingsProvider } from '@/features/settings/app-settings-provider';
import {
  defaultAppSettings,
  type AppSettings,
} from '@/features/settings/app-settings';

import { initializeApp } from './initialize-app';

type StartupState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'limited'; retrying: boolean }
  | { status: 'ready'; settings: AppSettings };

export function StartupGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StartupState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void initializeApp().then(
      (settings) => {
        if (active) {
          setState({ status: 'ready', settings });
        }
      },
      (error: unknown) => {
        if (active) {
          if (Platform.OS === 'web') {
            console.warn('[MassTracker] Локальное хранилище недоступно', error);
            setState({ status: 'limited', retrying: false });
          } else {
            console.error('[MassTracker] Ошибка инициализации', error);
            setState({ status: 'error' });
          }
        }
      },
    );

    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setState((previous) =>
      previous.status === 'limited'
        ? { ...previous, retrying: true }
        : { status: 'loading' },
    );
    setAttempt((previous) => previous + 1);
  }

  if (state.status === 'error') {
    return (
      <StatusScreen
        title="Не удалось запустить приложение"
        message="Повторите попытку. Если ошибка сохраняется, перезапустите Expo Go."
        onRetry={retry}
      />
    );
  }

  if (state.status === 'loading') {
    return <StatusScreen title="Загрузка приложения…" loading />;
  }

  return (
    <AppSettingsProvider
      initialSettings={
        state.status === 'ready' ? state.settings : defaultAppSettings
      }
      storageRecovery={
        state.status === 'limited'
          ? { retry, pending: state.retrying }
          : undefined
      }
    >
      {children}
    </AppSettingsProvider>
  );
}
