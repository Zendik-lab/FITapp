import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { inspectStorage } from '@/database/inspect-storage';
import {
  getStorageDiagnostics,
  subscribeStorageDiagnostics,
} from '@/database/storage-diagnostics';

export function diagnosticTime(value?: string) {
  return value ? new Date(value).toLocaleString('ru-KZ') : 'Ещё не было';
}

export function DiagnosticsSection({
  rows,
}: {
  rows: readonly { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const storage = useSyncExternalStore(
    subscribeStorageDiagnostics,
    getStorageDiagnostics,
    getStorageDiagnostics,
  );
  useEffect(() => {
    if (!open) return;
    let active = true;
    void inspectStorage()
      .catch(() => {
        // The data layer publishes the original error; reading never modifies data.
      })
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);
  return (
    <Card>
      <PrimaryButton
        label="Диагностика"
        secondary
        expanded={open}
        onPress={() => {
          if (!open) setReading(true);
          setOpen(!open);
        }}
      />
      {open && (
        <View>
          {rows.map(({ label, value }) => (
            <AppText key={label} variant="caption" selectable>
              {label}: {value}
            </AppText>
          ))}
          <AppText variant="caption">
            Локальное хранилище:{' '}
            {Platform.OS === 'web'
              ? 'IndexedDB · masstracker · v2'
              : 'SQLite · masstracker.db · миграции 1–2'}
          </AppText>
          <AppText variant="caption">
            Последняя успешная запись:{' '}
            {reading
              ? 'Проверяем…'
              : diagnosticTime(storage.lastSuccessfulWrite)}
          </AppText>
          {storage.error && (
            <AppText
              variant="caption"
              tone="error"
              accessibilityRole="alert"
              selectable
            >
              Ошибка хранилища: {storage.error}
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}
