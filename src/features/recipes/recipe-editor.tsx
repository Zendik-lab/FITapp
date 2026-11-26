import { use, useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import {
  ChoiceGroup,
  FormDisabledContext,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { useBeforeUnload } from '@/components/form-screen';
import { describeError } from '@/database/storage-diagnostics';
import { formatNumber } from '@/features/calendar/calendar';
import { useFoodDiary } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import { newId, parseDecimal, searchFoods } from '@/features/food/domain';
import { unitLabels, type FoodProduct } from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { ProductEditor } from '@/features/food/product-editor';
import { useUpdateBlocker } from '@/features/pwa/pwa-status';
import {
  calculateRecipe,
  decimalText,
  ingredientFactors,
  ingredientNutrition,
  makeIngredient,
  positive,
  resizeIngredient,
  validateRecipe,
} from './domain';
import {
  extraUnitLabels,
  recipeCategories,
  type IngredientUnit,
  type Recipe,
  type RecipeCategory,
  type RecipeIngredient,
} from './model';
import { saveRecipe } from './operations';
import {
  RecipeNutrition,
  SearchField,
  type NutritionMode,
} from './recipe-controls';

const labels = { ...unitLabels, ...extraUnitLabels };
const categoryOptions = recipeCategories.map((value) => ({
  value,
  label: value,
}));
const optionalNumber = (text: string) =>
  text.trim() ? parseDecimal(text) : undefined;
type IngredientDraft = {
  snapshot: RecipeIngredient;
  amount: string;
  factors: Partial<Record<IngredientUnit, number>>;
};

function IngredientPicker({
  products,
  onBack,
  onCreate,
  onSelect,
}: {
  products: readonly FoodProduct[];
  onBack(): void;
  onCreate(): void;
  onSelect(product: FoodProduct): void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const found = searchFoods(products, query);
  return (
    <FoodForm title="Выбрать ингредиент" onBack={onBack}>
      <SearchField
        name="ingredient-query"
        label="Название или штрихкод продукта"
        value={query}
        onChange={(text) => {
          setQuery(text);
          setLimit(20);
        }}
      />
      <PrimaryButton secondary label="Создать продукт" onPress={onCreate} />
      {found.length === 0 && (
        <AppText tone="muted">
          Продукты не найдены. Измените запрос или создайте продукт.
        </AppText>
      )}
      {found.slice(0, limit).map((product) => (
        <Card key={product.id}>
          <AppText variant="action">{product.name}</AppText>
          {!!product.brand && <AppText tone="muted">{product.brand}</AppText>}
          <NutritionValues caption="На 100 г" values={product.per100} />
          <PrimaryButton
            secondary
            label={`Выбрать: ${product.name}`}
            onPress={() => onSelect(product)}
          />
        </Card>
      ))}
      {found.length > limit && (
        <PrimaryButton
          secondary
          label="Показать ещё продукты"
          onPress={() => setLimit((n) => n + 20)}
        />
      )}
    </FoodForm>
  );
}

function IngredientFields({
  draft,
  productAvailable,
  onChange,
  onRemove,
  error,
}: {
  draft: IngredientDraft;
  productAvailable: boolean;
  onChange(draft: IngredientDraft): void;
  onRemove(): void;
  error?: string;
}) {
  const { snapshot, amount, factors } = draft;
  const disabled = use(FormDisabledContext);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const quantity = parseDecimal(amount);
  const grams = quantity * snapshot.gramsPerUnit;
  const options = (Object.keys(factors) as IngredientUnit[]).map((value) => ({
    value,
    label: labels[value],
    description: `1 ${labels[value]} = ${formatNumber(factors[value] ?? 0)} г`,
  }));
  let values;
  try {
    values = ingredientNutrition(resizeIngredient(snapshot, quantity));
  } catch {
    // Invalid input stays editable until the next keystroke.
  }
  return (
    <Card>
      <AppText variant="action">{snapshot.productName}</AppText>
      {!productAvailable && (
        <AppText variant="caption" tone="muted">
          Продукт удалён из базы. Используются сохранённые данные.
        </AppText>
      )}
      <FormField
        name={snapshot.id}
        label={`Количество: ${snapshot.productName}, ${labels[snapshot.unit]}`}
        inputMode="decimal"
        value={amount}
        onChangeText={(text) => onChange({ ...draft, amount: text })}
        error={error}
      />
      <PrimaryButton
        secondary
        label={`Единица: ${labels[snapshot.unit]}`}
        expanded={unitsOpen}
        disabled={disabled}
        onPress={() => setUnitsOpen(!unitsOpen)}
      />
      {unitsOpen && (
        <>
          <ChoiceGroup
            label="Единица измерения ингредиента"
            value={snapshot.unit}
            options={options}
            onChange={(unit) => {
              const gramsPerUnit = factors[unit];
              if (!gramsPerUnit) return;
              onChange({
                ...draft,
                amount:
                  positive(grams) && positive(grams / gramsPerUnit)
                    ? decimalText(grams / gramsPerUnit)
                    : amount,
                snapshot: { ...snapshot, unit, gramsPerUnit },
              });
              setUnitsOpen(false);
            }}
          />
          {factors.ml === undefined && (
            <AppText variant="caption" tone="muted">
              Для мл и л нужна плотность продукта.
            </AppText>
          )}
        </>
      )}
      {values && <NutritionValues values={values} />}
      <PrimaryButton
        secondary
        label={`Удалить ингредиент: ${snapshot.productName}`}
        disabled={disabled}
        onPress={onRemove}
      />
    </Card>
  );
}

export function RecipeEditor({
  original,
  onBack,
  onSaved,
}: {
  original?: Recipe;
  onBack(): void;
  onSaved(recipe: Recipe): void;
}) {
  const session = useFoodDiary();
  useUpdateBlocker();
  const [id] = useState(() => original?.id ?? newId());
  const [initial] = useState(() => ({
    name: original?.name ?? '',
    description: original?.description ?? '',
    servings: decimalText(original?.servings ?? 1),
    cookedWeight:
      original?.cookedWeightGrams === undefined
        ? ''
        : decimalText(original.cookedWeightGrams),
    preparationTime:
      original?.preparationTime === undefined
        ? ''
        : decimalText(original.preparationTime),
    instructions: original?.instructions ?? '',
    category: original?.category ?? ('Основные блюда' as RecipeCategory),
    ingredients: (original?.ingredients ?? []).map((snapshot) => {
      const product = session?.products.find(
        (p) => p.id === snapshot.productId,
      );
      const factors = product ? ingredientFactors(product) : { g: 1, kg: 1000 };
      return {
        snapshot,
        amount: decimalText(snapshot.quantity),
        factors: { ...factors, [snapshot.unit]: snapshot.gramsPerUnit },
      };
    }),
  }));
  const [draft, setDraft] = useState(initial);
  const [page, setPage] = useState<'editor' | 'picker' | 'product'>('editor');
  const [mode, setMode] = useState<NutritionMode>('perServing');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [failure, setFailure] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const saving = useRef(false);
  const fields = useRef(new Map<string, TextInputInstance>());
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useBeforeUnload(dirty && page !== 'editor');
  const name = draft.name.trim();
  const servings = parseDecimal(draft.servings);
  const cookedWeightGrams = optionalNumber(draft.cookedWeight);
  const preparationTime = optionalNumber(draft.preparationTime);
  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Укажите название блюда.';
  if (!positive(servings))
    errors.servings = 'Введите положительное количество порций.';
  if (cookedWeightGrams !== undefined && !positive(cookedWeightGrams))
    errors.cookedWeight = 'Введите положительный вес.';
  if (preparationTime !== undefined && !positive(preparationTime))
    errors.preparationTime = 'Введите положительное время.';
  if (!draft.ingredients.length)
    errors.ingredients = 'Добавьте хотя бы один ингредиент.';
  const ingredients = draft.ingredients.flatMap(({ snapshot, amount }) => {
    try {
      const ingredient = resizeIngredient(snapshot, parseDecimal(amount));
      ingredientNutrition(ingredient);
      return [ingredient];
    } catch {
      errors[snapshot.id] = 'Проверьте количество ингредиента.';
      return [];
    }
  });
  let nutrition;
  if (ingredients.length === draft.ingredients.length) {
    try {
      nutrition = calculateRecipe({ ingredients, servings, cookedWeightGrams });
    } catch {
      // Field errors describe partial input. Aggregate overflow is reported on save.
    }
  }
  function field<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function select(product: FoodProduct) {
    try {
      const snapshot = makeIngredient(product, 100, 'g');
      setDraft((d) => ({
        ...d,
        ingredients: [
          ...d.ingredients,
          { amount: '100', snapshot, factors: ingredientFactors(product) },
        ],
      }));
      setFailure('');
      setPage('editor');
    } catch (error) {
      setFailure(describeError(error));
      setPage('editor');
    }
  }
  async function save() {
    if (!session || saving.current) return;
    setSubmitted(true);
    setFailure('');
    const first = Object.keys(errors)[0];
    if (first) {
      fields.current.get(first)?.focus();
      return;
    }
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id,
      name,
      category: draft.category,
      servings,
      cookedWeightGrams,
      preparationTime,
      ingredients,
      description: draft.description.trim() || undefined,
      instructions: draft.instructions.trim() || undefined,
      isFavorite: original?.isFavorite ?? false,
      createdAt: original?.createdAt ?? now,
      updatedAt: now,
    };
    saving.current = true;
    try {
      validateRecipe(recipe);
      await session.change((state) => saveRecipe(state, recipe, original));
      onSaved(recipe);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      saving.current = false;
    }
  }
  if (page === 'product')
    return <ProductEditor onBack={() => setPage('picker')} onSaved={select} />;
  if (page === 'picker')
    return (
      <IngredientPicker
        products={session?.products ?? []}
        onSelect={select}
        onBack={() => setPage('editor')}
        onCreate={() => setPage('product')}
      />
    );
  return (
    <FieldFocusContext value={fields}>
      <FoodForm
        title={original ? 'Редактировать рецепт' : 'Новый рецепт'}
        onBack={onBack}
        dirty={dirty}
        pending={session?.pending}
        error={failure}
      >
        <FormField
          name="name"
          label="Название блюда"
          value={draft.name}
          onChangeText={(v) => field('name', v)}
          error={submitted ? errors.name : undefined}
        />
        <RecipeNutrition nutrition={nutrition} mode={mode} onChange={setMode} />
        <FormField
          name="servings"
          label="Количество порций"
          inputMode="decimal"
          value={draft.servings}
          onChangeText={(v) => field('servings', v)}
          error={submitted ? errors.servings : undefined}
        />
        <FormField
          name="cookedWeight"
          label="Вес готового блюда, г (необязательно)"
          inputMode="decimal"
          value={draft.cookedWeight}
          onChangeText={(v) => field('cookedWeight', v)}
          error={submitted ? errors.cookedWeight : undefined}
        />
        <PrimaryButton
          secondary
          label={`Категория: ${draft.category}`}
          expanded={categoriesOpen}
          disabled={session?.pending}
          onPress={() => setCategoriesOpen(!categoriesOpen)}
        />
        {categoriesOpen && (
          <ChoiceGroup
            label="Категория блюда"
            value={draft.category}
            options={categoryOptions}
            onChange={(value) => {
              field('category', value);
              setCategoriesOpen(false);
            }}
          />
        )}
        <AppText variant="section" accessibilityRole="header">
          Ингредиенты
        </AppText>
        {draft.ingredients.map((item) => (
          <IngredientFields
            key={item.snapshot.id}
            draft={item}
            error={submitted ? errors[item.snapshot.id] : undefined}
            productAvailable={
              !!session?.products.some(
                (product) => product.id === item.snapshot.productId,
              )
            }
            onChange={(value) =>
              setDraft((d) => ({
                ...d,
                ingredients: d.ingredients.map((i) =>
                  i.snapshot.id === item.snapshot.id ? value : i,
                ),
              }))
            }
            onRemove={() =>
              setDraft((d) => ({
                ...d,
                ingredients: d.ingredients.filter(
                  (i) => i.snapshot.id !== item.snapshot.id,
                ),
              }))
            }
          />
        ))}
        {submitted && !!errors.ingredients && (
          <AppText tone="error" accessibilityRole="alert">
            {errors.ingredients}
          </AppText>
        )}
        <PrimaryButton
          secondary
          icon="Plus"
          label="Добавить ингредиент"
          disabled={session?.pending}
          onPress={() => setPage('picker')}
        />
        <FormField
          name="preparationTime"
          label="Время приготовления, мин (необязательно)"
          inputMode="decimal"
          value={draft.preparationTime}
          onChangeText={(v) => field('preparationTime', v)}
          error={submitted ? errors.preparationTime : undefined}
        />
        <FormField
          name="description"
          label="Описание (необязательно)"
          value={draft.description}
          onChangeText={(v) => field('description', v)}
          multiline
        />
        <FormField
          name="instructions"
          label="Инструкция (необязательно)"
          value={draft.instructions}
          onChangeText={(v) => field('instructions', v)}
          multiline
          maxLength={10000}
        />
        <PrimaryButton
          label={session?.pending ? 'Сохранение…' : 'Сохранить рецепт'}
          disabled={session?.pending || !!session?.failure}
          onPress={() => void save()}
        />
      </FoodForm>
    </FieldFocusContext>
  );
}
