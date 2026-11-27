import {
  checkDayNutrition,
  newId,
  parseDateKey,
  recipePortion,
} from '@/features/food/domain';
import {
  meals,
  type FoodState,
  type MealType,
  type RecipeDiaryEntry,
} from '@/features/food/model';
import { addEntry, removeEntry } from '@/features/food/operations';
import { validateRecipe } from './domain';
import type { Recipe } from './model';
import { getBuiltinRecipe, hasBuiltinRecipe, isBuiltinRecipe } from './library';
import { ingredientQuantities } from '@/features/smart/planning';

function ensureCurrent(current: Recipe | undefined, expected: Recipe) {
  if (!current || JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('Рецепт изменился. Откройте его заново.');
}

export function saveRecipe(
  state: FoodState,
  recipe: Recipe,
  previous?: Recipe,
): FoodState {
  if (isBuiltinRecipe(recipe.id))
    throw new Error('Скопируйте встроенный рецепт, чтобы изменить его.');
  if (!validateRecipe(recipe).complete)
    throw new Error('Укажите КБЖУ всех ингредиентов перед сохранением.');
  const existing = state.recipes.find((r) => r.id === recipe.id);
  if (previous) ensureCurrent(existing, previous);
  else if (existing) return state;
  return {
    ...state,
    recipes: existing
      ? state.recipes.map((r) => (r.id === recipe.id ? recipe : r))
      : [...state.recipes, recipe],
  };
}

export function duplicateRecipe(recipe: Recipe): Recipe {
  const now = new Date().toISOString();
  return {
    ...recipe,
    id: newId(),
    name: `${recipe.name} (копия)`,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    ingredients: recipe.ingredients.map((i) => ({ ...i, id: newId() })),
  };
}

export function deleteRecipe(
  state: FoodState,
  id: string,
  previous?: Recipe,
): FoodState {
  if (isBuiltinRecipe(id)) throw new Error('Встроенный рецепт нельзя удалить.');
  if (previous)
    ensureCurrent(
      state.recipes.find((r) => r.id === id),
      previous,
    );
  return { ...state, recipes: state.recipes.filter((r) => r.id !== id) };
}

export function recipeIsFavorite(
  state: Pick<FoodState, 'favoriteRecipeIds'>,
  recipe: Pick<Recipe, 'id' | 'isFavorite'>,
) {
  return isBuiltinRecipe(recipe.id)
    ? (state.favoriteRecipeIds ?? []).includes(recipe.id)
    : recipe.isFavorite;
}

export function setRecipeFavorite(
  state: FoodState,
  recipe: Recipe,
  favorite: boolean,
): FoodState {
  if (!isBuiltinRecipe(recipe.id))
    return saveRecipe(
      state,
      {
        ...recipe,
        isFavorite: favorite,
        updatedAt: new Date().toISOString(),
      },
      recipe,
    );
  if (!hasBuiltinRecipe(recipe.id)) throw new Error('Рецепт недоступен.');
  const favorites = new Set(state.favoriteRecipeIds);
  if (favorite) favorites.add(recipe.id);
  else favorites.delete(recipe.id);
  return { ...state, favoriteRecipeIds: [...favorites] };
}

export function rememberRecipeQuery(
  state: FoodState,
  query: string,
): FoodState {
  const term = query.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!term) return state;
  const normalized = term.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  return {
    ...state,
    recipeSearchHistory: [
      term,
      ...(state.recipeSearchHistory ?? []).filter(
        (previous) =>
          previous.toLocaleLowerCase('ru').replace(/ё/g, 'е') !== normalized,
      ),
    ].slice(0, 8),
  };
}

export function addRecipeEntry(
  state: FoodState,
  id: string,
  amount: number,
  unit: RecipeDiaryEntry['unit'],
  meal: MealType,
  date: string,
  entryId: string,
  previous?: Recipe,
): FoodState {
  if (state.entries.some((entry) => entry.id === entryId)) return state;
  const recipe = getBuiltinRecipe(id) ?? state.recipes.find((r) => r.id === id);
  if (previous) ensureCurrent(recipe, previous);
  if (!recipe) throw new Error('Рецепт уже удалён.');
  const nutrition = validateRecipe(recipe);
  if (!nutrition.complete)
    throw new Error('КБЖУ рассчитаны не для всех ингредиентов рецепта.');
  const snapshot = {
    total: nutrition.total,
    servings: recipe.servings,
    cookedWeightGrams: recipe.cookedWeightGrams,
    ingredients: ingredientQuantities(recipe.ingredients).map(
      ({ id, grams }) => ({ id, grams }),
    ),
  };
  return addEntry(
    state,
    makeRecipeEntry(
      { id, name: recipe.name },
      snapshot,
      amount,
      unit,
      meal,
      date,
      entryId,
    ),
  );
}

function makeRecipeEntry(
  product: RecipeDiaryEntry['product'],
  recipe: RecipeDiaryEntry['recipe'],
  amount: number,
  unit: RecipeDiaryEntry['unit'],
  meal: MealType,
  date: string,
  id: string,
): RecipeDiaryEntry {
  parseDateKey(date);
  if (!Object.hasOwn(meals, meal)) throw new Error('Выберите приём пищи.');
  const { grams } = recipePortion(recipe, amount, unit);
  return {
    id,
    product,
    recipe,
    amount,
    unit,
    grams,
    meal,
    date,
    createdAt: new Date().toISOString(),
  };
}

function getCurrentEntry(
  state: FoodState,
  previous: RecipeDiaryEntry,
): RecipeDiaryEntry {
  const current = state.entries.find((entry) => entry.id === previous.id);
  if (!current?.recipe || JSON.stringify(current) !== JSON.stringify(previous))
    throw new Error('Запись изменилась. Откройте её заново.');
  return current;
}

export function deleteRecipeEntry(
  state: FoodState,
  previous: RecipeDiaryEntry,
): FoodState {
  return removeEntry(state, getCurrentEntry(state, previous).id);
}

export function editRecipeEntry(
  state: FoodState,
  previous: RecipeDiaryEntry,
  amount: number,
  unit: RecipeDiaryEntry['unit'],
  meal: MealType,
  date: string,
  copyId?: string,
): FoodState {
  const current = getCurrentEntry(state, previous);
  if (copyId && state.entries.some((entry) => entry.id === copyId))
    return state;
  const next = makeRecipeEntry(
    current.product,
    current.recipe,
    amount,
    unit,
    meal,
    date,
    copyId ?? current.id,
  );
  if (copyId) return addEntry(state, next);
  const entries = state.entries.map((entry) =>
    entry.id === current.id
      ? {
          ...next,
          createdAt: current.createdAt,
          copiedFrom: current.copiedFrom,
        }
      : entry,
  );
  checkDayNutrition(entries, date);
  return { ...state, entries };
}
