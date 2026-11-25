import { use, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { Dialog } from '@/components/dialog';
import { AppHeader, SectionHeader } from '@/components/headers';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { ScreenContainer } from '@/components/screen-container';
import { SettingsRow } from '@/components/settings-row';
import { sectionTitles } from '@/constants/sections';
import { SettingsStorageError } from '@/database/settings-contract';
import { InstallAppSection } from '@/features/pwa/pwa-status';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { themeModeLabels, type ThemeMode } from './app-settings';
import { AppSettingsContext } from './app-settings-context';

const themeOptions = [
  'system',
  'light',
  'dark',
] as const satisfies readonly ThemeMode[];
const appearance = 'Внешний вид';

const sections: readonly {
  title: string;
  rows: readonly { label: string; icon: AppIconName }[];
}[] = [
  {
    title: 'Профиль и цели',
    rows: [
      { label: 'Личные данные', icon: 'CircleUserRound' },
      { label: 'Мои цели', icon: 'Target' },
      { label: 'Параметры тела', icon: 'Accessibility' },
      { label: 'Настройки питания', icon: 'Utensils' },
      { label: 'Настройки тренировок', icon: 'Dumbbell' },
    ],
  },
  {
    title: 'Приложение',
    rows: [
      { label: appearance, icon: 'Contrast' },
      { label: 'Уведомления', icon: 'Bell' },
      { label: 'Единицы измерения', icon: 'Ruler' },
    ],
  },
  {
    title: 'Данные',
    rows: [
      { label: 'Apple Health', icon: 'Heart' },
      { label: 'Резервное копирование', icon: 'HardDrive' },
      { label: 'О приложении', icon: 'Info' },
    ],
  },
];

export function ProfileScreen() {
  const appSettings = use(AppSettingsContext);
  const showComingSoon = useComingSoon();
  const [showTheme, setShowTheme] = useState(false);
  if (!appSettings) throw new Error('Не подключён AppSettingsProvider.');

  return (
    <ScreenContainer>
      <AppHeader title={sectionTitles.profile} />
      {appSettings.storageRecovery && (
        <Card>
          <SectionHeader title="Локальное хранилище" />
          <AppText tone="muted" accessibilityRole="alert">
            Хранилище недоступно. Сейчас используются настройки по умолчанию.
          </AppText>
          <PrimaryButton
            label={
              appSettings.storageRecovery.pending
                ? 'Проверяем хранилище…'
                : 'Проверить хранилище'
            }
            onPress={appSettings.storageRecovery.retry}
            disabled={appSettings.storageRecovery.pending}
            secondary
          />
        </Card>
      )}
      {sections.map(({ title, rows }) => (
        <View key={title} style={styles.group}>
          <SectionHeader title={title} />
          <Card style={styles.settings}>
            {rows.map(({ label, icon }, index) => (
              <SettingsRow
                key={label}
                label={label}
                icon={icon}
                divider={index > 0}
                value={
                  label === appearance
                    ? themeModeLabels[appSettings.settings.themeMode]
                    : undefined
                }
                onPress={() =>
                  label === appearance
                    ? setShowTheme(true)
                    : showComingSoon(label)
                }
              />
            ))}
          </Card>
        </View>
      ))}
      <InstallAppSection />
      {showTheme && (
        <ThemeDialog
          mode={appSettings.settings.themeMode}
          onChange={appSettings.setThemeMode}
          onDismiss={() => setShowTheme(false)}
        />
      )}
    </ScreenContainer>
  );
}

function ThemeDialog({
  mode,
  onChange,
  onDismiss,
}: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => Promise<void>;
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  async function select(next: ThemeMode) {
    if (saving.current) return;
    if (next === mode) {
      onDismiss();
      return;
    }

    saving.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      await onChange(next);
      onDismiss();
    } catch (error) {
      console.warn('[MassTracker] Не удалось сохранить тему', error);
      setFailure(
        error instanceof SettingsStorageError && error.code === 'quota'
          ? 'В хранилище браузера закончилось место. Освободите место и попробуйте ещё раз.'
          : 'Не удалось сохранить тему. Попробуйте ещё раз.',
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      title={appearance}
      onDismiss={() => {
        if (!saving.current) onDismiss();
      }}
    >
      <View style={styles.options}>
        {themeOptions.map((option) => {
          const selected = mode === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: pending }}
              disabled={pending}
              onPress={() => void select(option)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor:
                    selected || pressed
                      ? colors.accentSurface
                      : colors.background,
                },
              ]}
            >
              <AppText
                variant="action"
                tone={selected ? 'accentText' : 'text'}
                style={styles.optionLabel}
              >
                {themeModeLabels[option]}
              </AppText>
              {selected && <AppIcon name="Check" />}
            </Pressable>
          );
        })}
      </View>
      {pending && <AppText tone="muted">Сохраняем тему…</AppText>}
      {failure && (
        <AppText tone="error" accessibilityRole="alert">
          {failure}
        </AppText>
      )}
      <PrimaryButton
        label="Закрыть"
        onPress={onDismiss}
        disabled={pending}
        secondary
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.small },
  settings: { padding: 0, gap: 0, overflow: 'hidden' },
  options: { gap: spacing.tight },
  option: {
    minHeight: touchSize,
    padding: spacing.compact,
    borderRadius: radii.action,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  optionLabel: { flex: 1 },
});
