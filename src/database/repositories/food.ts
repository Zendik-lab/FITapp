import type { SettingsStorage } from '../settings-contract';
import {
  emptyFoodState,
  meals,
  type FoodProduct,
  type FoodState,
  type RecipeDiaryEntry,
} from '@/features/food/model';
import {
  dateKey,
  gramsFor,
  parseDateKey,
  validateProduct,
  validNutrition,
  recipePortion,
} from '@/features/food/domain';
import { positive, validateRecipe } from '@/features/recipes/domain';
import type { Recipe } from '@/features/recipes/model';

const key = 'food_diary_state';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && positive(value);
}
function recipe(value: unknown): value is Recipe {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.isFavorite !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Array.isArray(value.ingredients) ||
    !positiveNumber(value.servings)
  )
    return false;
  for (const field of ['description', 'instructions'])
    if (value[field] !== undefined && typeof value[field] !== 'string')
      return false;
  for (const field of ['cookedWeightGrams', 'preparationTime'])
    if (value[field] !== undefined && !positiveNumber(value[field]))
      return false;
  const metadata = value.metadata;
  if (
    metadata !== undefined &&
    (!record(metadata) ||
      !['prep', 'cook'].every(
        (key) =>
          typeof metadata[key] === 'number' &&
          Number.isFinite(metadata[key]) &&
          metadata[key] >= 0,
      ) ||
      !['Простой', 'Средний', 'Сложный'].includes(
        String(metadata.difficulty),
      ) ||
      (metadata.seasoningNote !== undefined &&
        typeof metadata.seasoningNote !== 'string') ||
      (metadata.provenance !== undefined &&
        typeof metadata.provenance !== 'string') ||
      !['tags', 'steps', 'sources'].every((key) => strings(metadata[key])))
  )
    return false;
  const ids = new Set<string>();
  for (const i of value.ingredients) {
    if (
      !record(i) ||
      typeof i.id !== 'string' ||
      ids.has(i.id) ||
      typeof i.productId !== 'string' ||
      typeof i.productName !== 'string' ||
      !positiveNumber(i.quantity) ||
      !positiveNumber(i.gramsPerUnit) ||
      !positiveNumber(i.normalizedQuantity) ||
      i.quantity * i.gramsPerUnit !== i.normalizedQuantity ||
      typeof i.unit !== 'string' ||
      !['g', 'kg', 'ml', 'l', 'piece', 'serving'].includes(i.unit) ||
      !validNutrition(i.nutritionSnapshot)
    )
      return false;
    ids.add(i.id);
  }
  try {
    validateRecipe(value as unknown as Recipe);
    return true;
  } catch {
    return false;
  }
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function recipeEntry(e: Record<string, unknown>): boolean {
  const snapshot = e.recipe;
  if (
    !record(e.product) ||
    typeof e.product.id !== 'string' ||
    typeof e.product.name !== 'string' ||
    !e.product.name.trim() ||
    !record(snapshot) ||
    !validNutrition(snapshot.total) ||
    !positiveNumber(snapshot.servings) ||
    (snapshot.cookedWeightGrams !== undefined &&
      !positiveNumber(snapshot.cookedWeightGrams)) ||
    (e.unit !== 'g' && e.unit !== 'serving') ||
    !positiveNumber(e.amount)
  )
    return false;
  return (
    recipePortion(
      snapshot as unknown as RecipeDiaryEntry['recipe'],
      e.amount,
      e.unit,
    ).grams === e.grams
  );
}
function product(value: unknown): value is FoodProduct {
  if (!record(value) || !record(value.per100)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.isCustom !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    return false;
  for (const k of ['brand', 'barcode', 'imageUrl'])
    if (value[k] !== undefined && typeof value[k] !== 'string') return false;
  if (
    (value.aliases !== undefined && !strings(value.aliases)) ||
    (value.approximate !== undefined &&
      typeof value.approximate !== 'boolean') ||
    (value.baseUnit !== undefined && value.baseUnit !== 'g') ||
    (value.fdcId !== undefined &&
      (!positiveNumber(value.fdcId) || !Number.isInteger(value.fdcId)))
  )
    return false;
  for (const k of ['gramsPerMl', 'pieceGrams', 'servingGrams'])
    if (
      value[k] !== undefined &&
      (typeof value[k] !== 'number' ||
        !Number.isFinite(value[k]) ||
        value[k] <= 0)
    )
      return false;
  return validateProduct(value as unknown as FoodProduct).errors.length === 0;
}
function valid(value: unknown): value is FoodState {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.products) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.favorites) ||
    !Array.isArray(value.recent) ||
    !Array.isArray(value.recipes)
  )
    return false;
  if (!value.products.every(product)) return false;
  if (
    (value.favoriteRecipeIds !== undefined &&
      !strings(value.favoriteRecipeIds)) ||
    (value.recipeSearchHistory !== undefined &&
      !strings(value.recipeSearchHistory))
  )
    return false;
  if (
    !value.recipes.every(recipe) ||
    new Set(value.recipes.map((r) => r.id)).size !== value.recipes.length
  )
    return false;
  if (
    !value.entries.every((e) => {
      if (
        !record(e) ||
        typeof e.id !== 'string' ||
        typeof e.date !== 'string' ||
        typeof e.meal !== 'string' ||
        !Object.hasOwn(meals, e.meal) ||
        typeof e.amount !== 'number' ||
        !['g', 'ml', 'piece', 'serving'].includes(String(e.unit)) ||
        typeof e.createdAt !== 'string'
      )
        return false;
      try {
        if (dateKey(parseDateKey(e.date)) !== e.date) return false;
        if (e.recipe !== undefined) return recipeEntry(e);
        return (
          product(e.product) &&
          gramsFor(
            e.product,
            e.amount,
            e.unit as 'g' | 'ml' | 'piece' | 'serving',
          ) === e.grams
        );
      } catch {
        return false;
      }
    })
  )
    return false;
  return (
    value.favorites.every(
      (f) => record(f) && typeof f.productId === 'string',
    ) &&
    value.recent.every(
      (f) =>
        record(f) &&
        typeof f.productId === 'string' &&
        typeof f.usedAt === 'string',
    )
  );
}
export function createFoodRepository(storage: SettingsStorage) {
  async function read() {
    const raw = await storage.get(key);
    if (raw === null) return { raw, state: emptyFoodState() };
    try {
      const decoded: unknown = JSON.parse(raw);
      const state =
        record(decoded) && decoded.recipes === undefined
          ? { ...decoded, recipes: [] }
          : decoded;
      if (!valid(state)) throw new Error('schema');
      return { raw, state };
    } catch (cause) {
      throw new Error(
        'Дневник повреждён или имеет неподдерживаемую версию. Данные сохранены без изменений.',
        { cause },
      );
    }
  }
  return {
    load: async () => (await read()).state,
    async change(
      operation: (state: FoodState) => FoodState,
    ): Promise<FoodState> {
      const { raw, state } = await read();
      const next = operation(state);
      if (!valid(next)) throw new Error('Проверьте данные дневника.');
      await storage.apply([{ key, value: JSON.stringify(next) }], {
        key,
        value: raw,
      });
      return next;
    },
  };
}
