import { useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { formatNumber } from '@/features/calendar/calendar';
import { parseDecimal } from '@/features/food/domain';
import { useFoodDiary } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import { unitLabels, type FoodState } from '@/features/food/model';
import { formatFoodQuantity } from '@/features/food/units';
import { NutritionValues } from '@/features/food/nutrition-values';
import {
  calculateRecipe,
  decimalText,
  ingredientNutrition,
  scaleRecipe,
} from './domain';
import { extraUnitLabels, type Recipe } from './model';
import {
  deleteRecipe,
  duplicateRecipe,
  recipeIsFavorite,
  saveRecipe,
  setRecipeFavorite,
} from './operations';
import { isBuiltinRecipe } from './library';
import {
  RecipeArtwork,
  ToggleChip,
  toggleValue,
} from './recipe-library-controls';
import { isPantryBasic } from './recipe-search';
import {
  RecipeNutrition,
  recipeYield,
  type NutritionMode,
} from './recipe-controls';

const labels = { ...unitLabels, ...extraUnitLabels };
export function RecipeDetail({
  recipe,
  available,
  ignoreBasics = false,
  onBack,
  onEdit,
  onAdd,
  onList,
}: {
  recipe: Recipe;
  available?: readonly string[];
  ignoreBasics?: boolean;
  onBack(): void;
  onEdit(): void;
  onAdd(): void;
  onList(message: string): void;
}) {
  const session = useFoodDiary();
  const [mode, setMode] = useState<NutritionMode>('perServing');
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [prepared, setPrepared] = useState<readonly string[]>([]);
  const [completed, setCompleted] = useState<readonly string[]>([]);
  const saving = useRef(false);
  const duplicate = useRef<Recipe | null>(null);
  let scaled;
  try {
    scaled =
      amount === null ? recipe : scaleRecipe(recipe, parseDecimal(amount));
  } catch {
    // Keep the input and show a correction hint below it.
  }
  const displayed = scaled ?? recipe;
  const disabled = session?.pending || !!session?.failure;
  const builtin = isBuiltinRecipe(recipe.id);
  const favorite = session ? recipeIsFavorite(session.state, recipe) : false;
  const steps =
    recipe.metadata?.steps ??
    recipe.instructions?.split('\n').filter((step) => step.trim());
  async function commit(
    operation: (s: FoodState) => FoodState,
    message?: string,
  ) {
    if (!session || saving.current) return;
    saving.current = true;
    setError('');
    try {
      await session.change(operation);
      if (message) onList(message);
    } catch (error) {
      setConfirm(false);
      setError(describeError(error));
    } finally {
      saving.current = false;
    }
  }
  return (
    <FoodForm
      readOnly={!confirm}
      title={recipe.name}
      onBack={onBack}
      pending={session?.pending}
      error={error}
    >
      <RecipeArtwork category={recipe.category} large />
      <AppText variant="caption" tone="muted">
        {[
          recipe.category,
          recipe.metadata?.difficulty,
          ...(recipe.metadata?.tags ?? []),
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
      {recipe.metadata && recipe.metadata.prep + recipe.metadata.cook > 0 && (
        <AppText tone="muted">
          Подготовка · {recipe.metadata.prep} мин ·{' '}
          {recipe.metadata.cook
            ? `Приготовление · ${recipe.metadata.cook} мин`
            : 'Без приготовления'}
        </AppText>
      )}
      {!!recipe.description && <AppText>{recipe.description}</AppText>}
      <RecipeNutrition
        nutrition={calculateRecipe(displayed)}
        mode={mode}
        onChange={setMode}
      />
      {!!recipe.metadata?.sources.length && (
        <AppText variant="caption" tone="muted">
          КБЖУ рассчитаны по составу и приблизительны.{' '}
          {[recipe.metadata.provenance, ...recipe.metadata.sources]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      )}
      <PrimaryButton
        secondary
        label={favorite ? 'Убрать из избранного' : 'В избранное'}
        disabled={disabled}
        onPress={() =>
          void commit((state) => setRecipeFavorite(state, recipe, !favorite))
        }
      />
      <Card>
        <AppText variant="section">Приготовление</AppText>
        <AppText variant="caption" tone="muted">
          {recipe.category}
          {recipe.preparationTime === undefined
            ? ''
            : ` · ${formatNumber(recipe.preparationTime)} мин`}
        </AppText>
        <FormField
          name="recipe-scale"
          label="Приготовить порций"
          inputMode="decimal"
          value={amount ?? decimalText(recipe.servings)}
          onChangeText={setAmount}
          hint={`Сохранённый рецепт рассчитан на ${recipeYield(recipe.servings, recipe.cookedWeightGrams)}.`}
          error={
            scaled ? undefined : 'Введите положительное количество порций.'
          }
        />
        {amount !== null && (
          <PrimaryButton
            secondary
            label="Сбросить масштаб"
            onPress={() => setAmount(null)}
          />
        )}
        {scaled?.cookedWeightGrams !== undefined && (
          <AppText>
            Выход блюда ·{' '}
            {recipeYield(scaled.servings, scaled.cookedWeightGrams)}
          </AppText>
        )}
      </Card>
      <AppText variant="section" accessibilityRole="header">
        Ингредиенты
      </AppText>
      {!!recipe.metadata?.seasoningNote && (
        <AppText variant="caption" tone="muted">
          {recipe.metadata.seasoningNote}
        </AppText>
      )}
      {displayed.ingredients.map((item) => (
        <Card key={item.id}>
          <AppText variant="action">{item.productName}</AppText>
          <AppText tone="muted">
            {formatFoodQuantity(item.quantity)} {labels[item.unit]}
          </AppText>
          {available && (
            <AppText variant="caption" tone="muted">
              {ignoreBasics && isPantryBasic(item.productName)
                ? 'Базовый продукт'
                : available.includes(item.productId)
                  ? 'Есть дома'
                  : 'Не хватает'}
            </AppText>
          )}
          <NutritionValues values={ingredientNutrition(item)} />
          <ToggleChip
            label={
              prepared.includes(item.id)
                ? 'Подготовлено'
                : 'Отметить как подготовленное'
            }
            active={prepared.includes(item.id)}
            onPress={() => setPrepared((value) => toggleValue(value, item.id))}
          />
        </Card>
      ))}
      {!!steps?.length && (
        <Card>
          <AppText variant="section">Инструкция</AppText>
          {steps.map((step, index) => {
            const id = String(index + 1);
            return (
              <View key={id}>
                <AppText>
                  {id}. {step}
                </AppText>
                <ToggleChip
                  label={
                    completed.includes(id)
                      ? `Шаг ${id} выполнен`
                      : `Отметить шаг ${id}`
                  }
                  active={completed.includes(id)}
                  onPress={() =>
                    setCompleted((value) => toggleValue(value, id))
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
      <PrimaryButton
        label="Добавить в дневник"
        disabled={disabled}
        onPress={onAdd}
      />
      {!builtin && (
        <PrimaryButton
          secondary
          label="Редактировать рецепт"
          disabled={disabled}
          onPress={onEdit}
        />
      )}
      <PrimaryButton
        secondary
        label={builtin ? 'Скопировать в мои рецепты' : 'Дублировать рецепт'}
        disabled={disabled}
        onPress={() => {
          const copy = (duplicate.current ??= duplicateRecipe(recipe));
          void commit(
            (state) => saveRecipe(state, copy),
            'Копия рецепта сохранена.',
          );
        }}
      />
      {!builtin && (
        <PrimaryButton
          secondary
          label="Удалить рецепт"
          disabled={disabled}
          onPress={() => setConfirm(true)}
        />
      )}
      {confirm && (
        <Dialog title="Удалить рецепт?" onDismiss={() => setConfirm(false)}>
          <AppText>
            «{recipe.name}» исчезнет из списка рецептов. История питания
            сохранится.
          </AppText>
          <PrimaryButton
            secondary
            label="Отмена"
            disabled={session?.pending}
            onPress={() => setConfirm(false)}
          />
          <PrimaryButton
            label="Подтвердить удаление рецепта"
            disabled={disabled}
            onPress={() =>
              void commit(
                (state) => deleteRecipe(state, recipe.id, recipe),
                'Рецепт удалён.',
              )
            }
          />
        </Dialog>
      )}
    </FoodForm>
  );
}
