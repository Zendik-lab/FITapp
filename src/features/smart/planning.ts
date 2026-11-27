import { newId } from '@/features/food/domain';
import type { FoodDiaryEntry } from '@/features/food/model';
import type { RecipeIngredient, Recipe } from '@/features/recipes/model';
import type {
  FoodQuantity,
  PackagePrice,
  ShoppingItem,
  SmartPantry,
} from './model';

export function mergeShopping(rows: ShoppingItem[], additions: FoodQuantity[]) {
  const next = [...rows];
  const positions = new Map(
    next.flatMap((row, index) =>
      row.bought ? [] : [[row.id, index] as const],
    ),
  );
  for (const item of additions) {
    const index = positions.get(item.id);
    if (index === undefined) {
      positions.set(item.id, next.length);
      next.push({ ...item, key: newId(), bought: false });
    } else {
      next[index] = { ...next[index], grams: next[index].grams + item.grams };
    }
  }
  return next;
}

type Ingredient = Pick<
  RecipeIngredient,
  'productId' | 'productName' | 'normalizedQuantity'
>;

export function ingredientQuantities(
  ingredients: readonly Ingredient[],
  categories?: ReadonlyMap<string, string>,
  factor = 1,
) {
  const byId = new Map<string, FoodQuantity>();
  for (const ingredient of ingredients) {
    const id = ingredient.productId;
    byId.set(id, {
      id,
      name: ingredient.productName,
      category: categories?.get(id) ?? 'Прочее',
      grams:
        (byId.get(id)?.grams ?? 0) + ingredient.normalizedQuantity * factor,
    });
  }
  return [...byId.values()];
}

export function recipeCoverage(
  ingredients: readonly Ingredient[],
  stock: Record<string, number>,
  categories?: ReadonlyMap<string, string>,
  factor = 1,
) {
  const required = ingredientQuantities(ingredients, categories, factor);
  const missing = required.flatMap((item) => {
    const grams =
      item.grams - (Object.hasOwn(stock, item.id) ? stock[item.id] : 0);
    return grams > 0.00001 ? [{ ...item, grams }] : [];
  });
  const total = required.reduce((sum, item) => sum + item.grams, 0);
  const deficit = missing.reduce((sum, item) => sum + item.grams, 0);
  return {
    missing,
    percent: total ? Math.floor((1 - deficit / total) * 100 + 1e-8) : 0,
  };
}

export function portionCost(price: PackagePrice | undefined, grams: number) {
  if (!price || !Number.isFinite(grams) || grams < 0) return null;
  const amount = (price.amount / price.grams) * grams;
  return Number.isFinite(amount) ? amount : null;
}

export function estimateCost(
  items: readonly Pick<FoodQuantity, 'id' | 'grams'>[],
  prices: SmartPantry['prices'],
) {
  let amount = 0;
  let unknown = 0;
  for (const item of items) {
    const cost = portionCost(
      Object.hasOwn(prices, item.id) ? prices[item.id] : undefined,
      item.grams,
    );
    if (cost === null) unknown += 1;
    else amount += cost;
  }
  return { amount, unknown };
}

export function recipeCost(
  recipe: Recipe,
  prices: SmartPantry['prices'],
  servings = 1,
) {
  return estimateCost(
    ingredientQuantities(
      recipe.ingredients,
      undefined,
      servings / recipe.servings,
    ),
    prices,
  );
}

export function diaryCost(
  entries: readonly FoodDiaryEntry[],
  prices: SmartPantry['prices'],
) {
  return entries.reduce(
    (sum, entry) => {
      const recipe = entry.recipe;
      const fraction =
        recipe &&
        (entry.unit === 'serving'
          ? entry.amount / recipe.servings
          : entry.amount / (recipe.cookedWeightGrams ?? 0));
      const estimate = recipe
        ? recipe.ingredients && fraction && Number.isFinite(fraction)
          ? estimateCost(
              recipe.ingredients.map(({ id, grams }) => ({
                id,
                grams: grams * fraction,
              })),
              prices,
            )
          : { amount: 0, unknown: 1 }
        : entry.grams === null
          ? { amount: 0, unknown: 1 }
          : estimateCost(
              [{ id: entry.product.id, grams: entry.grams }],
              prices,
            );
      return {
        amount: sum.amount + estimate.amount,
        unknown: sum.unknown + estimate.unknown,
      };
    },
    { amount: 0, unknown: 0 },
  );
}
