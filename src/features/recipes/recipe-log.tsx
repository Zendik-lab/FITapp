import { useRef, useState } from 'react';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import {
  newId,
  parseDateKey,
  parseDecimal,
  recipePortion,
} from '@/features/food/domain';
import { useFoodDiary } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import {
  meals,
  type FoodState,
  type MealType,
  type RecipeDiaryEntry,
} from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { calculateRecipe, decimalText } from './domain';
import type { Recipe } from './model';
import {
  addRecipeEntry,
  deleteRecipeEntry,
  editRecipeEntry,
} from './operations';

const mealOptions = Object.entries(meals).map(([value, label]) => ({
  value: value as MealType,
  label,
}));
const units = [
  { value: 'serving', label: 'Порции' },
  { value: 'g', label: 'Граммы' },
] as const;
type Source =
  | { recipe: Recipe; entry?: never }
  | { entry: RecipeDiaryEntry; recipe?: never };

export function RecipeLog({
  recipe,
  entry,
  date,
  meal,
  onBack,
  onSaved,
}: Source & {
  date: string;
  meal: MealType;
  onBack(): void;
  onSaved(message: string, date: string): void;
}) {
  const session = useFoodDiary();
  const snapshot = recipe
    ? {
        total: calculateRecipe(recipe).total,
        servings: recipe.servings,
        cookedWeightGrams: recipe.cookedWeightGrams,
      }
    : entry.recipe;
  const name = recipe ? recipe.name : entry.product.name;
  const weight = snapshot.cookedWeightGrams;
  const [unit, setUnit] = useState<RecipeDiaryEntry['unit']>(
    entry?.unit ?? 'serving',
  );
  const initialAmount = decimalText(entry?.amount ?? 1);
  const [amount, setAmount] = useState(initialAmount);
  const [selectedDate, setDate] = useState(entry?.date ?? date);
  const [selectedMeal, setMeal] = useState(entry?.meal ?? meal);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [id] = useState(newId);
  const saving = useRef(false);
  const dirty =
    unit !== (entry?.unit ?? 'serving') ||
    amount !== initialAmount ||
    selectedDate !== (entry?.date ?? date) ||
    selectedMeal !== (entry?.meal ?? meal);
  const quantity = parseDecimal(amount);
  let portion: ReturnType<typeof recipePortion> | undefined;
  let dateError: string | undefined;
  try {
    portion = recipePortion(snapshot, quantity, unit);
  } catch {
    // Keep the raw quantity editable.
  }
  try {
    parseDateKey(selectedDate);
  } catch (error) {
    dateError = describeError(error);
  }
  async function commit(
    operation: (state: FoodState) => FoodState,
    message: string,
    destination: string,
  ) {
    if (!session || saving.current) return;
    setError('');
    saving.current = true;
    try {
      await session.change(operation);
      onSaved(message, destination);
    } catch (error) {
      setConfirm(false);
      setError(describeError(error));
    } finally {
      saving.current = false;
    }
  }
  function save(copy = false) {
    setSubmitted(true);
    if (dateError || !portion) return;
    void commit(
      (state) =>
        recipe
          ? addRecipeEntry(
              state,
              recipe.id,
              quantity,
              unit,
              selectedMeal,
              selectedDate,
              id,
              recipe,
            )
          : editRecipeEntry(
              state,
              entry,
              quantity,
              unit,
              selectedMeal,
              selectedDate,
              copy ? id : undefined,
            ),
      copy
        ? 'Запись скопирована.'
        : entry
          ? 'Запись сохранена.'
          : 'Блюдо добавлено в дневник.',
      selectedDate,
    );
  }
  const disabled = session?.pending || !!session?.failure;
  return (
    <FoodForm
      title={entry ? 'Запись рецепта' : 'Добавить блюдо'}
      onBack={onBack}
      dirty={dirty}
      pending={session?.pending}
      error={error}
    >
      <Card>
        <AppText variant="section">{name}</AppText>
        {portion && (
          <NutritionValues
            animate
            caption="В выбранном количестве"
            values={portion.values}
          />
        )}
        {entry && (
          <AppText variant="caption" tone="muted">
            КБЖУ на момент записи
          </AppText>
        )}
      </Card>
      {weight !== undefined ? (
        <ChoiceGroup
          label="Единица записи"
          value={unit}
          options={units}
          onChange={(value) => {
            if (value === unit) return;
            if (portion?.grams) {
              const next =
                value === 'g'
                  ? portion.grams
                  : (portion.grams / weight) * snapshot.servings;
              if (Number.isFinite(next) && next > 0)
                setAmount(decimalText(next));
            }
            setUnit(value);
          }}
        />
      ) : (
        <AppText tone="muted" variant="caption">
          Для записи в граммах укажите фактический вес готового блюда в рецепте.
        </AppText>
      )}
      <FormField
        name="recipe-log-amount"
        label={unit === 'g' ? 'Вес съеденного блюда, г' : 'Съедено порций'}
        inputMode="decimal"
        value={amount}
        onChangeText={setAmount}
        hint="Можно ввести дробное значение, например 0,5."
        error={
          submitted && !portion
            ? 'Введите положительное количество.'
            : undefined
        }
      />
      <FormField
        name="recipe-log-date"
        label="Дата записи, ГГГГ-ММ-ДД"
        value={selectedDate}
        onChangeText={setDate}
        error={submitted ? dateError : undefined}
      />
      <ChoiceGroup
        label="Приём пищи"
        value={selectedMeal}
        options={mealOptions}
        onChange={setMeal}
      />
      <PrimaryButton
        label={entry ? 'Сохранить запись' : 'Добавить в дневник'}
        disabled={disabled}
        onPress={() => save()}
      />
      {entry && (
        <>
          <PrimaryButton
            secondary
            label="Скопировать запись"
            disabled={disabled}
            onPress={() => save(true)}
          />
          <PrimaryButton
            secondary
            label="Удалить запись"
            disabled={disabled}
            onPress={() => setConfirm(true)}
          />
        </>
      )}
      {entry && (
        <Dialog
          open={confirm}
          dismissible={!session?.pending}
          title="Удалить запись?"
          onDismiss={() => setConfirm(false)}
        >
          <AppText>Блюдо будет удалено из выбранного дня.</AppText>
          <PrimaryButton
            secondary
            label="Отмена"
            disabled={session?.pending}
            onPress={() => setConfirm(false)}
          />
          <PrimaryButton
            label="Удалить запись из дневника"
            disabled={disabled}
            onPress={() =>
              void commit(
                (state) => deleteRecipeEntry(state, entry),
                'Запись удалена.',
                entry.date,
              )
            }
          />
        </Dialog>
      )}
    </FoodForm>
  );
}
