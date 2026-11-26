import { useRef, useState } from 'react';
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
import { deleteRecipe, duplicateRecipe, saveRecipe } from './operations';
import {
  RecipeNutrition,
  recipeYield,
  type NutritionMode,
} from './recipe-controls';

const labels = { ...unitLabels, ...extraUnitLabels };
export function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  onAdd,
  onList,
}: {
  recipe: Recipe;
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
      <RecipeNutrition
        nutrition={calculateRecipe(displayed)}
        mode={mode}
        onChange={setMode}
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
        {!!recipe.description && <AppText>{recipe.description}</AppText>}
      </Card>
      <AppText variant="section" accessibilityRole="header">
        Ингредиенты
      </AppText>
      {displayed.ingredients.map((item) => (
        <Card key={item.id}>
          <AppText variant="action">{item.productName}</AppText>
          <AppText tone="muted">
            {formatFoodQuantity(item.quantity)} {labels[item.unit]}
          </AppText>
          <NutritionValues values={ingredientNutrition(item)} />
        </Card>
      ))}
      {!!recipe.instructions && (
        <Card>
          <AppText variant="section">Инструкция</AppText>
          <AppText>{recipe.instructions}</AppText>
        </Card>
      )}
      <PrimaryButton
        label="Добавить в дневник"
        disabled={disabled}
        onPress={onAdd}
      />
      <PrimaryButton
        secondary
        label="Редактировать рецепт"
        disabled={disabled}
        onPress={onEdit}
      />
      <PrimaryButton
        secondary
        label={recipe.isFavorite ? 'Убрать из избранного' : 'В избранное'}
        disabled={disabled}
        onPress={() =>
          void commit((state) =>
            saveRecipe(
              state,
              {
                ...recipe,
                isFavorite: !recipe.isFavorite,
                updatedAt: new Date().toISOString(),
              },
              recipe,
            ),
          )
        }
      />
      <PrimaryButton
        secondary
        label="Дублировать рецепт"
        disabled={disabled}
        onPress={() => {
          const copy = (duplicate.current ??= duplicateRecipe(recipe));
          void commit(
            (state) => saveRecipe(state, copy),
            'Копия рецепта сохранена.',
          );
        }}
      />
      <PrimaryButton
        secondary
        label="Удалить рецепт"
        disabled={disabled}
        onPress={() => setConfirm(true)}
      />
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
