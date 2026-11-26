import {
  newId,
  validNutrition,
  scaleNutrition,
  addNutrition,
  zeroNutrition,
} from '@/features/food/domain';
import type { FoodProduct } from '@/features/food/model';
import {
  recipeCategories,
  type IngredientUnit,
  type Recipe,
  type RecipeIngredient,
} from './model';

export function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Keep exact generated quantities readable by the decimal-only form parser. */
export function decimalText(amount: number): string {
  const text = String(amount);
  const [mantissa, power] = text.split('e');
  if (power === undefined) return text;
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = whole + fraction;
  const decimal = whole.length + Number(power);
  if (decimal <= 0) return '0.' + '0'.repeat(-decimal) + digits;
  if (decimal >= digits.length) return digits.padEnd(decimal, '0');
  return digits.slice(0, decimal) + '.' + digits.slice(decimal);
}

export function ingredientFactors(
  product: FoodProduct,
): Partial<Record<IngredientUnit, number>> {
  const factors = {
    g: 1,
    kg: 1000,
    ml: product.gramsPerMl,
    l: product.gramsPerMl === undefined ? undefined : product.gramsPerMl * 1000,
    piece: product.pieceGrams,
    serving: product.servingGrams,
  };
  return Object.fromEntries(
    Object.entries(factors).filter(([, v]) => v !== undefined && positive(v)),
  );
}

export function makeIngredient(
  product: FoodProduct,
  quantity: number,
  unit: IngredientUnit,
): RecipeIngredient {
  const gramsPerUnit = ingredientFactors(product)[unit];
  if (gramsPerUnit === undefined || !validNutrition(product.per100))
    throw new Error(
      'Для продукта нужны данные КБЖУ и коэффициент пересчёта в граммы.',
    );
  return resizeIngredient(
    {
      id: newId(),
      productId: product.id,
      productName: product.name,
      quantity,
      unit,
      gramsPerUnit,
      normalizedQuantity: 0,
      nutritionSnapshot: { ...product.per100 },
    },
    quantity,
  );
}

export function resizeIngredient(
  ingredient: RecipeIngredient,
  quantity: number,
): RecipeIngredient {
  const normalizedQuantity = quantity * ingredient.gramsPerUnit;
  if (!positive(quantity) || !positive(normalizedQuantity))
    throw new Error('Введите положительное количество ингредиента.');
  return { ...ingredient, quantity, normalizedQuantity };
}

export function ingredientNutrition(ingredient: RecipeIngredient) {
  return scaleNutrition(
    ingredient.nutritionSnapshot,
    ingredient.normalizedQuantity / 100,
  );
}

export function calculateRecipe(
  recipe: Pick<Recipe, 'ingredients' | 'servings' | 'cookedWeightGrams'>,
) {
  if (!positive(recipe.servings))
    throw new Error('Введите положительное количество порций.');
  if (
    recipe.cookedWeightGrams !== undefined &&
    !positive(recipe.cookedWeightGrams)
  )
    throw new Error('Введите положительный вес готового блюда.');
  if (!recipe.ingredients.length)
    throw new Error('Добавьте хотя бы один ингредиент.');
  let total = zeroNutrition;
  let ingredientWeight = 0;
  for (const ingredient of recipe.ingredients) {
    if (
      !positive(ingredient.normalizedQuantity) ||
      !validNutrition(ingredient.nutritionSnapshot)
    )
      throw new Error('Проверьте количество и КБЖУ ингредиента.');
    total = addNutrition(total, ingredientNutrition(ingredient));
    ingredientWeight += ingredient.normalizedQuantity;
  }
  if (!positive(ingredientWeight) || !validNutrition(total))
    throw new Error('Проверьте количество и КБЖУ ингредиентов.');
  return {
    total,
    perServing: scaleNutrition(total, 1 / recipe.servings),
    per100: scaleNutrition(
      total,
      100 / (recipe.cookedWeightGrams ?? ingredientWeight),
    ),
    estimated: recipe.cookedWeightGrams === undefined,
  };
}

export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  if (!positive(servings))
    throw new Error('Введите положительное количество порций.');
  const factor = servings / recipe.servings;
  const next = {
    ...recipe,
    servings,
    cookedWeightGrams:
      recipe.cookedWeightGrams === undefined
        ? undefined
        : recipe.cookedWeightGrams * factor,
    ingredients: recipe.ingredients.map((i) =>
      resizeIngredient(i, i.quantity * factor),
    ),
  };
  calculateRecipe(next);
  return next;
}

export function validateRecipe(recipe: Recipe) {
  if (!recipe.name.trim()) throw new Error('Укажите название блюда.');
  if (!recipeCategories.includes(recipe.category))
    throw new Error('Выберите категорию блюда.');
  if (recipe.preparationTime !== undefined && !positive(recipe.preparationTime))
    throw new Error('Введите положительное время приготовления.');
  return calculateRecipe(recipe);
}
