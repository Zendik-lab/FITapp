import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { AnimatedNumber } from '@/components/animated-number';
import {
  ChoiceGroup,
  FormField,
  FieldFocusContext,
} from '@/components/form-controls';
import { FormScreen } from '@/components/form-screen';
import { SectionHeader } from '@/components/headers';
import { formatNumber } from '@/features/calendar/calendar';
import { useProfile } from '@/features/profile/profile-context';
import {
  activityDescriptions,
  activityLabels,
  goalLabels,
} from '@/features/profile/options';
import { numeric } from '@/features/profile/validation';
import { spacing, useAppTheme } from '@/theme';
import {
  calculateMacroCalories,
  calculateMacroDistribution,
  type NutritionTargets,
} from './engine';
import {
  defaultPreferences,
  resolveNutrition,
  type NutritionPreferences,
} from './model';
import { useNutrition } from './nutrition-context';

const modeOptions = [
  { value: 'auto', label: 'Автоматический расчёт' },
  { value: 'manual', label: 'Ручная настройка' },
] as const;
const gainOptions = [
  { value: 'gentle', label: 'Плавный набор', description: '+200 ккал в день' },
  {
    value: 'standard',
    label: 'Стандартный набор',
    description: '+350 ккал в день',
  },
  {
    value: 'accelerated',
    label: 'Ускоренный набор',
    description: '+500 ккал в день',
  },
] as const;
const fields = [
  { key: 'calories', label: 'Целевая калорийность, ккал' },
  { key: 'protein', label: 'Белки, г' },
  { key: 'fat', label: 'Жиры, г' },
  { key: 'carbs', label: 'Углеводы, г' },
] as const;
type Draft = Record<keyof NutritionTargets, string>;
function toDraft(targets?: NutritionTargets | null, calories?: number): Draft {
  return {
    calories: targets
      ? String(targets.calories)
      : calories === undefined
        ? ''
        : String(calories),
    protein: targets ? String(targets.protein) : '',
    fat: targets ? String(targets.fat) : '',
    carbs: targets ? String(targets.carbs) : '',
  };
}

export function CalculatorScreen({
  onClose,
}: {
  onClose: (saved: boolean) => void;
}) {
  const session = useNutrition();
  const profile = useProfile()?.state.profile ?? null;
  const router = useRouter();
  const [preferences, setPreferences] = useState(
    session?.preferences ?? defaultPreferences,
  );
  const [draft, setDraft] = useState(() =>
    toDraft(
      session?.snapshot?.targets ?? session?.recommendation?.targets,
      session?.recommendation?.calories,
    ),
  );
  const [initial, setInitial] = useState(() =>
    JSON.stringify([preferences, draft]),
  );
  const currentSource = JSON.stringify([
    session?.preferences,
    session?.snapshot?.targets,
  ]);
  const [source, setSource] = useState(currentSource);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Draft, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const guard = useRef(false);
  const inputs = useRef(new Map<string, TextInputInstance>());
  const scroll = useRef<ScrollViewInstance>(null);
  const dirty = JSON.stringify([preferences, draft]) !== initial;
  const stale = source !== currentSource;
  const loadCurrent = useCallback(() => {
    const latestPreferences = session?.preferences ?? defaultPreferences();
    const latestDraft = toDraft(
      session?.snapshot?.targets ?? session?.recommendation?.targets,
      session?.recommendation?.calories,
    );
    setPreferences(latestPreferences);
    setDraft(latestDraft);
    setInitial(JSON.stringify([latestPreferences, latestDraft]));
    setSource(currentSource);
    setError(undefined);
    setFieldErrors({});
  }, [
    session?.preferences,
    session?.snapshot?.targets,
    session?.recommendation?.targets,
    session?.recommendation?.calories,
    currentSource,
  ]);
  // Rebase only an untouched form; dirty inputs wait for an explicit reload.
  if (stale && !dirty && !saving) loadCurrent();
  const next: NutritionPreferences = {
    ...preferences,
    manualCalories:
      preferences.calorieMode === 'manual'
        ? numeric(draft.calories)
        : preferences.manualCalories,
    manualMacros:
      preferences.macroMode === 'manual'
        ? {
            protein: numeric(draft.protein),
            fat: numeric(draft.fat),
            carbs: numeric(draft.carbs),
          }
        : preferences.manualMacros,
  };
  const preview = resolveNutrition(profile, next);
  const recommendation = preview.recommendation;
  const disabled = saving || !!session?.pending;

  async function save() {
    if (!session || guard.current || disabled || stale) return;
    const errors: Partial<Record<keyof Draft, string>> = {};
    for (const { key } of fields) {
      if (
        (key === 'calories'
          ? preferences.calorieMode
          : preferences.macroMode) !== 'manual'
      )
        continue;
      const value = numeric(draft[key]);
      if (
        !Number.isFinite(value) ||
        value < (key === 'calories' ? 1 : 0) ||
        value > (key === 'calories' ? 20000 : 5000)
      )
        errors[key] =
          key === 'calories'
            ? 'Укажите калории от 1 до 20000.'
            : 'Укажите граммы от 0 до 5000.';
    }
    setFieldErrors(errors);
    const first = fields.find(({ key }) => errors[key]);
    if (first) {
      inputs.current.get(`nutrition-${first.key}`)?.focus();
      return;
    }
    if (!preview.snapshot || preview.issues.length) {
      setError(preview.issues.join(' '));
      return;
    }
    guard.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await session.save(next);
      onClose(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Не удалось сохранить цели. Повторите попытку.',
      );
    } finally {
      guard.current = false;
      setSaving(false);
    }
  }

  function restore() {
    const recommended = resolveNutrition(profile, defaultPreferences());
    setPreferences(defaultPreferences());
    setDraft(
      toDraft(
        recommended.recommendation?.targets,
        recommended.recommendation?.calories,
      ),
    );
    setError(undefined);
    setFieldErrors({});
  }

  return (
    <FieldFocusContext value={inputs}>
      <FormScreen
        withinTabs
        transitionKey="nutrition-calculator"
        scrollRef={scroll}
        disabled={disabled || stale}
        blockUpdate={dirty || saving}
      >
        <AppText variant="title" accessibilityRole="header">
          Калории и БЖУ
        </AppText>
        {stale && (
          <Card>
            <AppText accessibilityRole="alert">
              Цели питания изменены на другом экране. Загрузите актуальные
              значения перед сохранением.
            </AppText>
            <PrimaryButton
              label="Загрузить актуальные цели"
              disabled={disabled}
              onPress={loadCurrent}
            />
          </Card>
        )}
        {recommendation ? (
          <>
            <Card>
              <AppText variant="action">
                Рекомендуемая суточная калорийность
              </AppText>
              <AppText variant="metric">
                <AnimatedNumber
                  value={recommendation.calories}
                  suffix=" ккал"
                />
              </AppText>
              <AppText tone="muted">
                {profile ? goalLabels[profile.goals.kind] : ''}
              </AppText>
              <AppText>BMR · {formatNumber(recommendation.bmr)} ккал</AppText>
              <AppText>TDEE · {formatNumber(recommendation.tdee)} ккал</AppText>
              <AppText>
                {recommendation.adjustment < 0 ? 'Дефицит' : 'Профицит'} ·{' '}
                {formatNumber(Math.abs(recommendation.adjustment))} ккал
              </AppText>
              {preview.snapshot && (
                <AppText>
                  Текущая поправка к TDEE ·{' '}
                  {formatNumber(
                    preview.snapshot.targets.calories - recommendation.tdee,
                  )}{' '}
                  ккал
                </AppText>
              )}
            </Card>
            {profile?.goals.kind === 'gain' && (
              <ChoiceGroup
                label="Режим набора массы"
                value={preferences.gainMode}
                options={gainOptions}
                onChange={(gainMode) =>
                  setPreferences((p) => ({ ...p, gainMode }))
                }
              />
            )}
            <ChoiceGroup
              label="Режим калорийности"
              value={preferences.calorieMode}
              options={modeOptions}
              onChange={(calorieMode) =>
                setPreferences((p) => ({ ...p, calorieMode }))
              }
            />
            {preferences.calorieMode === 'manual' && (
              <FormField
                name="nutrition-calories"
                label={fields[0].label}
                inputMode="decimal"
                value={draft.calories}
                onChangeText={(value) =>
                  setDraft((p) => ({ ...p, calories: value }))
                }
                error={fieldErrors.calories}
                hint="Число с точкой или запятой. При сохранении округляется до целых ккал."
              />
            )}
            <ChoiceGroup
              label="Режим БЖУ"
              value={preferences.macroMode}
              options={modeOptions}
              onChange={(macroMode) =>
                setPreferences((p) => ({ ...p, macroMode }))
              }
            />
            {preferences.macroMode === 'manual' &&
              fields
                .slice(1)
                .map(({ key, label }) => (
                  <FormField
                    key={key}
                    name={`nutrition-${key}`}
                    label={label}
                    inputMode="decimal"
                    value={draft[key]}
                    error={fieldErrors[key]}
                    onChangeText={(value) =>
                      setDraft((p) => ({ ...p, [key]: value }))
                    }
                    hint="Граммы; можно вводить точку или запятую."
                  />
                ))}
            {(preferences.calorieMode === 'manual' ||
              preferences.macroMode === 'manual') && (
              <>
                <AppText tone="muted">
                  Ручные значения сохраняются при изменении профиля. Новые
                  рекомендации показаны отдельно. Восстановление рекомендаций
                  применяется только после сохранения.
                </AppText>
                {recommendation.targets && (
                  <TargetsCard
                    title="Рекомендуемые калории и БЖУ"
                    targets={recommendation.targets}
                  />
                )}
              </>
            )}
            {preview.snapshot && (
              <TargetsCard targets={preview.snapshot.targets} />
            )}
            {preview.snapshot &&
              preview.snapshot.targets.calories < recommendation.bmr && (
                <AppText accessibilityRole="alert">
                  Целевая калорийность ниже BMR. Проверьте ручные настройки.
                </AppText>
              )}
            {preview.issues.map((issue) => (
              <AppText key={issue} tone="error" accessibilityRole="alert">
                {issue}
              </AppText>
            ))}
            <Card>
              <SectionHeader title="Как работает расчёт" />
              <AppText tone="muted">
                Формула Миффлина — Сан Жеора оценивает базовый обмен взрослых.
                TDEE = BMR × коэффициент активности. Учитывайте тренировки в
                выбранной активности; отдельно их калории не прибавляются.
              </AppText>
              {profile && (
                <AppText tone="muted">
                  {activityLabels[profile.activity.level]}:{' '}
                  {activityDescriptions[profile.activity.level]}
                </AppText>
              )}
              <AppText tone="muted">
                Белки — 1,8 г/кг, жиры — 1 г/кг, углеводы — оставшаяся энергия.
                Белки и углеводы дают 4 ккал/г, жиры — 9 ккал/г. Граммы
                округляются до десятых.
              </AppText>
              <AppText tone="muted">
                Поддержание — без поправки, снижение — дефицит 350 ккал.
                Результат ориентировочный и не гарантирует конкретную скорость
                изменения веса. Темп в анкете не переводится в обещание
                прибавки.
              </AppText>
            </Card>
          </>
        ) : (
          <Card>
            {preview.issues.map((issue) => (
              <AppText key={issue} accessibilityRole="alert">
                {issue}
              </AppText>
            ))}
            {!session?.loadFailed && (
              <PrimaryButton
                secondary
                label="Заполнить данные профиля"
                onPress={() => {
                  onClose(false);
                  router.navigate('/profile');
                }}
              />
            )}
          </Card>
        )}
        {(error || session?.failure) && (
          <AppText tone="error" accessibilityRole="alert">
            {error || session?.failure}
          </AppText>
        )}
        {session?.loadFailed && (
          <PrimaryButton
            secondary
            label="Повторить загрузку целей"
            onPress={session.retry}
          />
        )}
        {recommendation && (
          <>
            <PrimaryButton
              label={saving ? 'Сохраняем…' : 'Сохранить изменения'}
              disabled={disabled || stale}
              onPress={() => void save()}
            />
            <PrimaryButton
              secondary
              label="Восстановить рекомендации"
              disabled={disabled || stale}
              onPress={restore}
            />
          </>
        )}
        <PrimaryButton
          secondary
          label="Назад без сохранения"
          disabled={disabled}
          onPress={() => (dirty ? setDiscard(true) : onClose(false))}
        />
        <Dialog
          open={discard}
          title="Отменить изменения?"
          onDismiss={() => setDiscard(false)}
        >
          <AppText>Изменения целей питания не будут сохранены.</AppText>
          <PrimaryButton
            label="Продолжить редактирование"
            onPress={() => setDiscard(false)}
          />
          <PrimaryButton
            secondary
            label="Отменить изменения"
            onPress={() => onClose(false)}
          />
        </Dialog>
      </FormScreen>
    </FieldFocusContext>
  );
}

function TargetsCard({
  targets,
  title = 'Суточная цель',
}: {
  targets: NutritionTargets;
  title?: string;
}) {
  const { colors } = useAppTheme();
  let distribution;
  try {
    distribution = calculateMacroDistribution(targets);
  } catch {
    return null;
  }
  return (
    <Card>
      <SectionHeader title={title} />
      <AppText variant="stat">
        <AnimatedNumber value={targets.calories} suffix=" ккал" />
      </AppText>
      <View
        style={styles.track}
        accessible
        accessibilityLabel="Распределение калорий БЖУ"
      >
        {(['protein', 'fat', 'carbs'] as const).map((key) => (
          <View
            key={key}
            style={{ flex: distribution[key], backgroundColor: colors[key] }}
          />
        ))}
      </View>
      {fields.slice(1).map(
        ({ key, label }) =>
          key !== 'calories' && (
            <AppText key={key}>
              {label.replace(', г', '')} ·{' '}
              <AnimatedNumber value={targets[key]} suffix=" г" /> ·{' '}
              <AnimatedNumber value={distribution[key]} suffix="%" />
            </AppText>
          ),
      )}
      <AppText variant="caption" tone="muted">
        <AnimatedNumber
          prefix="Энергия БЖУ: "
          value={calculateMacroCalories(targets)}
          suffix=" ккал"
        />
      </AppText>
    </Card>
  );
}
const styles = StyleSheet.create({
  track: {
    height: spacing.small,
    flexDirection: 'row',
    borderRadius: spacing.small,
    overflow: 'hidden',
  },
});
