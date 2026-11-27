import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { formatNumber } from '@/features/calendar/calendar';
import { entryNutrition, parseDecimal, unitsFor } from '@/features/food/domain';
import { useDebouncedSearch } from '@/features/food/use-debounced-search';
import type { FoodSession } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import {
  unitLabels,
  type FoodProduct,
  type FoodUnit,
} from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { ProductEditor } from '@/features/food/product-editor';
import { ProductPicker } from '@/features/food/product-picker';
import { decimalText } from '@/features/recipes/domain';
import {
  builtinRecipeSearchInputs,
  getBuiltinRecipe,
} from '@/features/recipes/library';
import type { Recipe } from '@/features/recipes/model';
import { RecipeEditor } from '@/features/recipes/recipe-editor';
import {
  buildRecipeIndex,
  findRecipes,
} from '@/features/recipes/recipe-search';
import { spacing } from '@/theme';
import {
  planMealKinds,
  type PlanDay,
  type PlanItem,
  type PlanMeal,
  type PlanMealKind,
} from './model';
import {
  createPlanMeal,
  planItemFromProduct,
  planItemFromRecipe,
  resizePlanItem,
} from './operations';
import { validPlanTime } from './validation';

const mealOptions = (Object.keys(planMealKinds) as PlanMealKind[]).map(
  (value) => ({
    value,
    label: planMealKinds[value].title,
  }),
);
const sourceOptions = [
  { label: 'Продукты', value: 'product' },
  { label: 'Рецепты', value: 'recipe' },
] as const;

export function PlanMealEditor({
  initial,
  nextKind,
  pending,
  onClose,
  save,
}: {
  initial?: PlanMeal;
  nextKind: PlanMealKind;
  pending: boolean;
  onClose(): void;
  save(meal: PlanMeal): Promise<void>;
}) {
  const [base] = useState(() => initial ?? createPlanMeal(nextKind));
  const [meal, setMeal] = useState(base);
  const [categories, showCategories] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const nameError = !meal.title.trim() ? 'Введите название.' : undefined;
  const timeError = !validPlanTime(meal.time)
    ? 'Укажите время в формате ЧЧ:ММ.'
    : undefined;
  async function submit() {
    setSubmitted(true);
    if (nameError || timeError) return;
    try {
      await save({ ...meal, title: meal.title.trim() });
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  return (
    <FoodForm
      title={initial ? 'Настроить приём пищи' : 'Новый приём пищи'}
      onBack={onClose}
      pending={pending}
      dirty={meal !== base}
      error={error}
    >
      <PrimaryButton
        secondary
        label={`Категория · ${planMealKinds[meal.kind].title}`}
        expanded={categories}
        onPress={() => showCategories(!categories)}
      />
      {categories && (
        <ChoiceGroup
          label="Категория приёма пищи"
          value={meal.kind}
          options={mealOptions}
          onChange={(kind) => {
            const defaults = planMealKinds[meal.kind];
            setMeal({
              ...meal,
              kind,
              title:
                meal.title === defaults.title
                  ? planMealKinds[kind].title
                  : meal.title,
              time:
                meal.time === defaults.time
                  ? planMealKinds[kind].time
                  : meal.time,
            });
            showCategories(false);
          }}
        />
      )}
      <FormField
        name="plan-meal-title"
        label="Название приёма пищи"
        value={meal.title}
        maxLength={80}
        onChangeText={(title) => setMeal({ ...meal, title })}
        error={submitted ? nameError : undefined}
      />
      <FormField
        name="plan-meal-time"
        label="Время, ЧЧ:ММ"
        value={meal.time}
        maxLength={5}
        onChangeText={(time) => setMeal({ ...meal, time })}
        error={submitted ? timeError : undefined}
      />
      <PrimaryButton
        label="Сохранить приём пищи"
        disabled={pending}
        onPress={() => void submit()}
      />
    </FoodForm>
  );
}

type Picked =
  | { product: FoodProduct; recipe?: never }
  | { recipe: Recipe; product?: never };

function PlanRecipePicker({
  session,
  onPick,
}: {
  session: FoodSession;
  onPick(recipe: Recipe): void;
}) {
  const [query, setQuery] = useState('');
  const search = useDebouncedSearch(query);
  const [page, setPage] = useState(0);
  const fields = useRef(new Map<string, TextInputInstance>());
  const { recipes, favoriteRecipeIds } = session.state;
  const index = useMemo(
    () =>
      buildRecipeIndex(
        (function* () {
          yield* recipes;
          yield* builtinRecipeSearchInputs();
        })(),
        session.products,
        { entries: [], favoriteRecipeIds },
      ),
    [session.products, recipes, favoriteRecipeIds],
  );
  const matches = useMemo(
    () =>
      findRecipes(index, { query: search }).filter(
        ({ nutritionComplete }) => nutritionComplete,
      ),
    [index, search],
  );
  const size = 16;
  return (
    <>
      <FieldFocusContext value={fields}>
        <FormField
          name="plan-recipe-search"
          label="Название или ингредиент рецепта"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
      </FieldFocusContext>
      {!!query && (
        <PrimaryButton
          secondary
          label="Очистить поиск"
          onPress={() => {
            setQuery('');
            setPage(0);
            fields.current.get('plan-recipe-search')?.focus();
          }}
        />
      )}
      {query !== search ? (
        <AppText tone="muted" accessibilityRole="status">
          Поиск рецептов…
        </AppText>
      ) : matches.length === 0 ? (
        <AppText tone="muted">Рецепты с полным КБЖУ не найдены.</AppText>
      ) : (
        matches
          .slice(page * size, (page + 1) * size)
          .map(({ recipe, nutrition }) => (
            <Card key={recipe.id}>
              <PrimaryButton
                secondary
                label={recipe.name}
                onPress={() => {
                  const full =
                    recipes.find((row) => row.id === recipe.id) ??
                    getBuiltinRecipe(recipe.id);
                  if (full) onPick(full);
                }}
              />
              <AppText tone="muted" variant="caption">
                {formatNumber(nutrition.calories)} ккал на порцию
              </AppText>
            </Card>
          ))
      )}
      {matches.length > size && (
        <View style={styles.row}>
          <PrimaryButton
            secondary
            label="Предыдущая страница"
            disabled={page === 0}
            onPress={() => setPage(page - 1)}
          />
          <PrimaryButton
            secondary
            label="Следующая страница"
            disabled={(page + 1) * size >= matches.length}
            onPress={() => setPage(page + 1)}
          />
        </View>
      )}
    </>
  );
}

export function PlanItemPicker({
  session,
  day,
  meal,
  replacing,
  onClose,
  save,
}: {
  session: FoodSession;
  day: PlanDay;
  meal: PlanMeal;
  replacing?: PlanItem;
  onClose(): void;
  save(item: PlanItem): Promise<void>;
}) {
  const [source, setSource] = useState<'product' | 'recipe'>(
    replacing?.entry.recipe ? 'recipe' : 'product',
  );
  const [editor, setEditor] = useState(false);
  const [picked, setPicked] = useState<PlanItem>();
  const [error, setError] = useState('');
  function pick(value: Picked) {
    try {
      setError('');
      setPicked(
        value.recipe
          ? planItemFromRecipe(value.recipe, 1, day.date, meal.kind)
          : planItemFromProduct(
              value.product,
              100,
              value.product.baseUnit ?? 'g',
              day.date,
              meal.kind,
            ),
      );
      setEditor(false);
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  if (picked)
    return (
      <PlanPortionEditor
        item={picked}
        title={replacing ? 'Заменить блюдо' : 'Добавить в план'}
        submitLabel={replacing ? 'Сохранить замену' : 'Добавить в план'}
        pending={session.pending}
        onClose={() => setPicked(undefined)}
        save={(item) => save({ ...item, locked: replacing?.locked ?? false })}
      />
    );
  if (editor) {
    if (source === 'recipe')
      return (
        <RecipeEditor
          onBack={() => setEditor(false)}
          onSaved={(recipe) => pick({ recipe })}
        />
      );
    return (
      <ProductEditor
        onBack={() => setEditor(false)}
        onSaved={(product) => pick({ product })}
      />
    );
  }
  return (
    <FoodForm
      title={replacing ? 'Выбрать замену' : 'Добавить продукт или блюдо'}
      onBack={onClose}
      error={error}
      readOnly
    >
      <ChoiceGroup
        label="Источник"
        options={sourceOptions}
        value={source}
        onChange={setSource}
      />
      <PrimaryButton
        secondary
        icon="Plus"
        label={
          source === 'recipe' ? 'Создать свой рецепт' : 'Создать свой продукт'
        }
        onPress={() => setEditor(true)}
      />
      {source === 'product' ? (
        <ProductPicker onProduct={(product) => pick({ product })} />
      ) : (
        <PlanRecipePicker
          session={session}
          onPick={(recipe) => pick({ recipe })}
        />
      )}
    </FoodForm>
  );
}

export function PlanPortionEditor({
  item,
  title,
  submitLabel,
  pending,
  onClose,
  save,
}: {
  item: PlanItem;
  title: string;
  submitLabel: string;
  pending: boolean;
  onClose(): void;
  save(item: PlanItem): Promise<void>;
}) {
  const { entry } = item;
  const [amount, setAmount] = useState(decimalText(entry.amount));
  const [unit, setUnit] = useState(entry.unit);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const units: FoodUnit[] = entry.recipe
    ? entry.recipe.cookedWeightGrams
      ? ['serving', 'g']
      : ['serving']
    : unitsFor(entry.product);
  let next: PlanItem | undefined;
  let quantityError: string | undefined;
  try {
    next = resizePlanItem(item, parseDecimal(amount), unit);
  } catch (cause) {
    quantityError = describeError(cause);
  }
  async function submit() {
    setSubmitted(true);
    setError('');
    if (!next) return;
    try {
      await save(next);
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  return (
    <FoodForm
      title={title}
      onBack={onClose}
      pending={pending}
      dirty={amount !== decimalText(entry.amount) || unit !== entry.unit}
      error={error}
    >
      <Card>
        <AppText variant="section">{entry.product.name}</AppText>
        {next && (
          <NutritionValues
            animate
            caption="В выбранном количестве"
            values={entryNutrition(next.entry)}
          />
        )}
      </Card>
      {units.length > 1 && (
        <ChoiceGroup
          label="Единица"
          value={unit}
          options={units.map((value) => ({ value, label: unitLabels[value] }))}
          onChange={setUnit}
        />
      )}
      <FormField
        name="plan-item-quantity"
        label={`Количество, ${unitLabels[unit]}`}
        value={amount}
        inputMode="decimal"
        onChangeText={setAmount}
        error={submitted ? quantityError : undefined}
      />
      <PrimaryButton
        label={submitLabel}
        disabled={pending}
        onPress={() => void submit()}
      />
    </FoodForm>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
});
