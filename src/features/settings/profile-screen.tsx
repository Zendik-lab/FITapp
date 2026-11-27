import { Touchable } from '@/components/touchable';
import { PersonalizationScreen } from './personalization-screen';
import { use, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { Dialog } from '@/components/dialog';
import { AppHeader, SectionHeader } from '@/components/headers';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { ScreenContainer } from '@/components/screen-container';
import { ScreenStack } from '@/components/screen-stack';
import { RadioGroup } from '@/components/radio-group';
import { SettingsRow } from '@/components/settings-row';
import { sectionTitles } from '@/constants/sections';
import { SettingsStorageError } from '@/database/settings-contract';
import {
  AppVersionSection,
  AppDiagnosticsSection,
  InstallAppSection,
  useUpdateBlocker,
} from '@/features/pwa/pwa-status';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { themeModeLabels, type ThemeMode } from './app-settings';
import { AppSettingsContext } from './app-settings-context';
import { useProfile } from '@/features/profile/profile-context';
import { ProfileSections } from '@/features/profile/profile-sections';
import { ProfileEditor } from '@/features/profile/profile-editor';
import type { ProfileSection } from '@/features/profile/model';
import { CalculatorScreen } from '@/features/nutrition/calculator-screen';
import { NutritionSummary } from '@/features/nutrition/nutrition-summary';

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
    title: 'Настройки приложения',
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
  const [customizing, setCustomizing] = useState(false);
  const appSettings = use(AppSettingsContext);
  const showComingSoon = useComingSoon();
  const [showTheme, setShowTheme] = useState(false);
  const session = useProfile();
  const [editing, setEditing] = useState<ProfileSection>();
  const [updated, setUpdated] = useState(false);
  const [calculator, setCalculator] = useState(false);
  const [nutritionUpdated, setNutritionUpdated] = useState(false);
  if (!appSettings) throw new Error('Не подключён AppSettingsProvider.');

  function renderDetail() {
    if (customizing)
      return <PersonalizationScreen onBack={() => setCustomizing(false)} />;
    if (calculator)
      return (
        <CalculatorScreen
          onClose={(saved) => {
            setCalculator(false);
            setNutritionUpdated(saved);
          }}
        />
      );

    if (editing && session?.state.profile)
      return (
        <ProfileEditor
          profile={session.state.profile}
          section={editing}
          onClose={(saved) => {
            setEditing(undefined);
            setUpdated(saved);
          }}
        />
      );
    return null;
  }

  return (
    <ScreenStack detail={renderDetail()}>
      <ScreenContainer>
        <AppHeader title={sectionTitles.profile} />
        {appSettings.setPersonalization && !appSettings.storageRecovery && (
          <PrimaryButton
            secondary
            icon="Contrast"
            label="Персонализация"
            onPress={() => setCustomizing(true)}
          />
        )}
        {updated && (
          <AppText tone="accentText" accessibilityLiveRegion="polite">
            Профиль обновлён.
          </AppText>
        )}
        <ProfileSections
          onEdit={(section) => {
            setUpdated(false);
            setEditing(section);
          }}
        />
        {nutritionUpdated && (
          <AppText tone="accentText" accessibilityLiveRegion="polite">
            Цели питания сохранены.
          </AppText>
        )}
        {session?.state.profile && (
          <NutritionSummary
            onOpen={() => {
              setNutritionUpdated(false);
              setCalculator(true);
            }}
          />
        )}
        {appSettings.storageRecovery && (
          <Card>
            <SectionHeader title="Локальное хранилище" />
            <AppText tone="muted" accessibilityRole="alert">
              Хранилище недоступно. Сейчас используются настройки по умолчанию.
            </AppText>
            {appSettings.storageRecovery.message && (
              <AppText tone="error" accessibilityRole="alert">
                {appSettings.storageRecovery.message}
              </AppText>
            )}
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
        {sections
          .filter(
            ({ title }) =>
              !session?.state.profile || title !== 'Профиль и цели',
          )
          .map(({ title, rows }) => (
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
        <AppVersionSection />
        <AppDiagnosticsSection />
        <ThemeDialog
          open={showTheme}
          mode={appSettings.settings.themeMode}
          onChange={appSettings.setThemeMode}
          onDismiss={() => setShowTheme(false)}
        />
      </ScreenContainer>
    </ScreenStack>
  );
}

function ThemeDialog({
  open,
  mode,
  onChange,
  onDismiss,
}: {
  open: boolean;
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => Promise<void>;
  onDismiss: () => void;
}) {
  useUpdateBlocker(open);
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
      open={open}
      dismissible={!pending}
      title={appearance}
      onDismiss={() => {
        if (!saving.current) onDismiss();
      }}
    >
      <RadioGroup label={appearance}>
        {themeOptions.map((option) => {
          const selected = mode === option;
          return (
            <Touchable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: pending }}
              aria-checked={selected}
              aria-disabled={pending}
              tabIndex={selected ? 0 : -1}
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
            </Touchable>
          );
        })}
      </RadioGroup>
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
