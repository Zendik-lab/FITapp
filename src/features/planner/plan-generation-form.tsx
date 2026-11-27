import { useRef, useState } from 'react';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { formatDate, formatNumber } from '@/features/calendar/calendar';
import { parseDateKey } from '@/features/food/domain';
import type { FoodSession } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import type { NutritionTargets } from '@/features/nutrition/engine';
import type { UserProfile } from '@/features/profile/model';
import { generatePlans } from './generator';
import {
  defaultGeneration,
  generationModes,
  type GenerationSettings,
  type PlanDay,
} from './model';
import { planDates, planStats, readPlanner, savePlanDays } from './operations';
import { validGeneration } from './validation';

export type GenerationScope = {
  start: string;
  count?: number;
  mealId?: string;
};

const modeOptions = (
  Object.keys(generationModes) as GenerationSettings['mode'][]
).map((value) => ({
  value,
  label: generationModes[value],
}));
const dietOptions = [
  { value: 'any', label: 'Любой рацион' },
  { value: 'vegetarian', label: 'Вегетарианский' },
  { value: 'vegan', label: 'Растительный' },
] as const;
const yesNo = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
] as const;

function ToggleOption({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange(enabled: boolean): void;
}) {
  return (
    <ChoiceGroup
      compact
      label={label}
      value={enabled ? 'yes' : 'no'}
      options={yesNo}
      onChange={(value) => onChange(value === 'yes')}
    />
  );
}

export function PlanGenerationForm({
  session,
  target,
  profile,
  scope,
  onClose,
  onSaved,
}: {
  session: FoodSession;
  target: NutritionTargets;
  profile?: UserProfile['nutrition'];
  scope: GenerationScope;
  onClose(): void;
  onSaved(firstDate: string): void;
}) {
  const planner = readPlanner(session.state);
  const [initial] = useState(() => {
    const diet = profile?.diet.toLocaleLowerCase('ru') ?? '';
    const base: GenerationSettings = {
      ...defaultGeneration,
      meals: profile?.mealsPerDay ?? defaultGeneration.meals,
      diet: /веган|растительн|vegan/.test(diet)
        ? 'vegan'
        : /вегетари|vegetarian/.test(diet)
          ? 'vegetarian'
          : 'any',
      ...planner.generation,
    };
    return base;
  });
  const [settings, setSettings] = useState(initial);
  const [days, setDays] = useState(String(scope.count ?? initial.days));
  const [meals, setMeals] = useState(String(initial.meals));
  const [minutes, setMinutes] = useState(
    initial.maxMinutes ? String(initial.maxMinutes) : '',
  );
  const [advanced, setAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<{
    days: PlanDay[];
    expected: Record<string, PlanDay>;
    settings: GenerationSettings;
    retainedWithAllergies: boolean;
  }>();
  const busy = useRef(false);
  const hasPrices = Object.keys(session.state.pantry?.prices ?? {}).length > 0;
  const hasSport = session.products.some(
    (product) => product.category === 'Спортивное питание',
  );
  const hasStock = !!session.state.pantry?.stock.length;
  const numberOf = (value: string) =>
    /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const update = <K extends keyof GenerationSettings>(
    key: K,
    value: GenerationSettings[K],
  ) => setSettings((previous) => ({ ...previous, [key]: value }));

  async function prepare() {
    if (busy.current) return;
    const next = {
      ...settings,
      days: numberOf(days),
      meals: numberOf(meals),
      maxMinutes: minutes.trim() ? numberOf(minutes) : 0,
      sport: hasSport && settings.sport,
    };
    if (!validGeneration(next)) {
      setError(
        'Укажите от 1 до 14 дней, от 1 до 12 приёмов и не более 1440 минут.',
      );
      return;
    }
    const effective = {
      ...next,
      excludes: [profile?.excludedFoods, next.excludes]
        .filter(Boolean)
        .join(', '),
      allergies: [profile?.allergies, next.allergies]
        .filter(Boolean)
        .join(', '),
      preferences: [profile?.diet, next.preferences].filter(Boolean).join(', '),
    };
    const dates = planDates(scope.start, next.days);
    const expected = Object.fromEntries(
      dates.flatMap((date) =>
        planner.days[date] ? [[date, planner.days[date]]] : [],
      ),
    );
    setError('');
    setProgress(0);
    busy.current = true;
    setRunning(true);
    try {
      const result = await generatePlans({
        dates,
        products: session.products,
        state: session.state,
        settings: effective,
        target,
        existing: expected,
        mealId: scope.mealId,
        lookupInstalled: true,
        onProgress: setProgress,
      });
      setPreview({
        days: result,
        expected,
        settings: { ...next, days: scope.count ? initial.days : next.days },
        retainedWithAllergies:
          !!effective.allergies.trim() && Object.keys(expected).length > 0,
      });
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }

  async function commit() {
    if (!preview || busy.current) return;
    setError('');
    busy.current = true;
    try {
      await session.change((state) =>
        savePlanDays(state, preview.days, preview.expected, preview.settings),
      );
      onSaved(preview.days[0].date);
    } catch (cause) {
      setConfirm(false);
      setError(describeError(cause));
    } finally {
      busy.current = false;
    }
  }

  const disabled = running || session.pending || !!session.failure;
  return (
    <FoodForm
      title={scope.mealId ? 'Перегенерировать приём пищи' : 'Генерация рациона'}
      onBack={onClose}
      dirty={
        !!preview ||
        settings !== initial ||
        days !== String(scope.count ?? initial.days) ||
        meals !== String(initial.meals) ||
        minutes !== (initial.maxMinutes ? String(initial.maxMinutes) : '')
      }
      error={error}
      pending={running || session.pending}
    >
      <Card>
        <AppText variant="action">
          {formatDate(parseDateKey(scope.start), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </AppText>
        <AppText tone="muted">
          Цель на день · {formatNumber(target.calories)} ккал · Б{' '}
          {formatNumber(target.protein)} · Ж {formatNumber(target.fat)} · У{' '}
          {formatNumber(target.carbs)} г
        </AppText>
      </Card>
      {preview ? (
        <>
          <AppText variant="section">Предварительный просмотр</AppText>
          {preview.days.map((day) => {
            const { planned, delta } = planStats(day, []);
            const percentage = (100 * (delta?.calories ?? 0)) / target.calories;
            return (
              <Card key={day.date}>
                <AppText variant="action">
                  {formatDate(parseDateKey(day.date), {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {formatNumber(planned.calories)} ккал
                </AppText>
                <AppText tone={Math.abs(percentage) > 5 ? 'error' : 'muted'}>
                  Отклонение {percentage > 0 ? '+' : ''}
                  {formatNumber(percentage)}%
                  {day.meals.some((meal) => !meal.items.length)
                    ? ' · есть пустые приёмы'
                    : ''}
                </AppText>
                <AppText variant="caption" tone="muted">
                  Б {formatNumber(planned.protein)} · Ж{' '}
                  {formatNumber(planned.fat)} · У {formatNumber(planned.carbs)}{' '}
                  г
                </AppText>
                {day.meals.map((meal) => (
                  <AppText key={meal.id} variant="caption">
                    {meal.title} ·{' '}
                    {meal.items
                      .map((item) => item.entry.product.name)
                      .join(', ') || 'нет подходящих блюд'}
                  </AppText>
                ))}
              </Card>
            );
          })}
          {preview.settings.stockOnly && (
            <AppText tone="muted">
              Запасы использованы для расчёта порций. Количество продуктов в
              холодильнике сохранено.
            </AppText>
          )}
          {preview.retainedWithAllergies && (
            <AppText tone="muted">
              Проверьте состав ранее зафиксированных и съеденных блюд с учётом
              указанных аллергенов.
            </AppText>
          )}
          <PrimaryButton
            label="Сохранить рацион"
            disabled={disabled}
            onPress={() =>
              Object.keys(preview.expected).length
                ? setConfirm(true)
                : void commit()
            }
          />
          <PrimaryButton
            secondary
            label="Изменить настройки"
            disabled={disabled}
            onPress={() => setPreview(undefined)}
          />
        </>
      ) : (
        <>
          {scope.count === undefined && (
            <FormField
              name="plan-gen-days"
              label="Дней подряд"
              inputMode="numeric"
              value={days}
              onChangeText={setDays}
            />
          )}
          {!scope.mealId && (
            <FormField
              name="plan-gen-meals"
              label="Приёмов пищи в день"
              inputMode="numeric"
              value={meals}
              onChangeText={setMeals}
            />
          )}
          <ChoiceGroup
            label="Режим"
            options={modeOptions.filter(
              ({ value }) =>
                value !== 'budget' || hasPrices || settings.mode === 'budget',
            )}
            value={settings.mode}
            onChange={(value) => update('mode', value)}
          />
          {!hasPrices && (
            <AppText variant="caption" tone="muted">
              Бюджетный режим доступен после добавления цен упаковок.
            </AppText>
          )}
          <PrimaryButton
            secondary
            label="Состав и ограничения"
            expanded={advanced}
            onPress={() => setAdvanced(!advanced)}
            disabled={disabled}
          />
          {advanced && (
            <Card>
              <FormField
                name="plan-gen-minutes"
                label="Время приготовления до, мин"
                inputMode="numeric"
                value={minutes}
                onChangeText={setMinutes}
                hint="Оставьте поле пустым для подбора без ограничения времени."
              />
              <FormField
                name="plan-gen-exclude"
                label="Исключить продукты"
                value={settings.excludes}
                hint="Перечислите через запятую."
                onChangeText={(value) => update('excludes', value)}
                maxLength={500}
              />
              <FormField
                name="plan-gen-allergies"
                label="Аллергены"
                value={settings.allergies}
                hint="Аллергены из профиля также учитываются. Сверяйте состав и следы аллергенов на этикетке."
                onChangeText={(value) => update('allergies', value)}
                maxLength={500}
              />
              <FormField
                name="plan-gen-prefer"
                label="Предпочитаемые продукты и блюда"
                value={settings.preferences}
                onChangeText={(value) => update('preferences', value)}
                maxLength={500}
              />
              <ChoiceGroup
                label="Пищевой режим"
                options={dietOptions}
                value={settings.diet}
                onChange={(value) => update('diet', value)}
              />
              <ToggleOption
                label="Разрешить повторение"
                enabled={settings.repeats}
                onChange={(value) => update('repeats', value)}
              />
              {hasSport && (
                <ToggleOption
                  label="Использовать спортивное питание"
                  enabled={settings.sport}
                  onChange={(value) => update('sport', value)}
                />
              )}
              {(hasStock || settings.stockOnly) && (
                <ToggleOption
                  label="Только из запасов"
                  enabled={settings.stockOnly}
                  onChange={(value) => update('stockOnly', value)}
                />
              )}
              {profile?.restrictions && (
                <AppText variant="caption" tone="muted">
                  Ограничения из профиля · {profile.restrictions}. Добавьте
                  конкретные продукты в исключения.
                </AppText>
              )}
            </Card>
          )}
          {running && (
            <AppText
              accessibilityRole="status"
              accessibilityLiveRegion="polite"
            >
              Подбор рациона · {progress} из {days}
            </AppText>
          )}
          <PrimaryButton
            label={running ? 'Подбираем блюда…' : 'Составить рацион'}
            disabled={disabled}
            onPress={() => void prepare()}
          />
        </>
      )}
      <Dialog
        open={confirm}
        title="Заменить существующий рацион?"
        dismissible={!session.pending}
        onDismiss={() => setConfirm(false)}
      >
        <AppText>
          Будут обновлены планы на {Object.keys(preview?.expected ?? {}).length}{' '}
          дн. Съеденные и зафиксированные блюда сохранятся.
        </AppText>
        <PrimaryButton
          secondary
          label="Отмена"
          disabled={session.pending}
          onPress={() => setConfirm(false)}
        />
        <PrimaryButton
          label="Подтвердить замену"
          disabled={disabled}
          onPress={() => void commit()}
        />
      </Dialog>
    </FoodForm>
  );
}
