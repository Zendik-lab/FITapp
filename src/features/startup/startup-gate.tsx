import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { StatusScreen } from '@/components/status-screen';
import {
  describeError,
  recordStorageFailure,
} from '@/database/storage-diagnostics';
import { AppSettingsProvider } from '@/features/settings/app-settings-provider';
import {
  defaultAppSettings,
  type AppSettings,
} from '@/features/settings/app-settings';

import { initializeApp } from './initialize-app';
import { LaunchBrand } from './launch-brand';
import { useAppTheme } from '@/theme';

type StartupState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'limited'; retrying: boolean; message: string }
  | { status: 'ready'; settings: AppSettings };

export function StartupGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StartupState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { colors } = useAppTheme();

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
          recordStorageFailure(error);
          const message = describeError(error);
          if (Platform.OS === 'web') {
            console.warn('[MassTracker] Локальное хранилище недоступно', error);
            setState({ status: 'limited', retrying: false, message });
          } else {
            console.error('[MassTracker] Ошибка инициализации', error);
            setState({ status: 'error', message });
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
        message={state.message}
        onRetry={retry}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {state.status !== 'loading' && (
        <AppSettingsProvider
          initialSettings={
            state.status === 'ready' ? state.settings : defaultAppSettings
          }
          storageRecovery={
            state.status === 'limited'
              ? { retry, pending: state.retrying, message: state.message }
              : undefined
          }
        >
          {children}
        </AppSettingsProvider>
      )}
      {attempt === 0 && <LaunchBrand loaded={state.status !== 'loading'} />}
      {attempt > 0 && state.status === 'loading' && (
        <StatusScreen title="Загрузка приложения…" loading />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
