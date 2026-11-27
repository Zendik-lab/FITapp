import { useMemo } from 'react';
import type { FoodSession } from '@/features/food/food-context';
import {
  builtinRecipeSearchInputs,
  getBuiltinRecipe,
} from '@/features/recipes/library';
import { buildRecipeIndex } from '@/features/recipes/recipe-search';
import type { FoodState } from '@/features/food/model';
import { emptyPantry, type SmartPantry } from './model';

let builtin: ReturnType<typeof buildRecipeIndex> | undefined;

export function useSmartRecipes(session: FoodSession) {
  const { recipes, entries, favoriteRecipeIds } = session.state;
  const products = session.products;
  return useMemo(() => {
    builtin ??= buildRecipeIndex(builtinRecipeSearchInputs(), products, {
      entries: [],
    });
    const favoriteIds = new Set(favoriteRecipeIds);
    const counts = new Map<string, number>();
    for (const row of entries) {
      if (row.recipe)
        counts.set(row.product.id, (counts.get(row.product.id) ?? 0) + 1);
    }
    return [
      ...buildRecipeIndex(recipes, products, { entries }),
      ...builtin.map((row) => ({
        ...row,
        favorite: favoriteIds.has(row.recipe.id),
        usage: counts.get(row.recipe.id) ?? 0,
      })),
    ];
  }, [entries, favoriteRecipeIds, products, recipes]);
}

export function resolveRecipe(state: FoodState, id: string) {
  return (
    state.recipes.find((recipe) => recipe.id === id) ?? getBuiltinRecipe(id)
  );
}

export function changePantry(
  state: FoodState,
  update: (pantry: SmartPantry) => SmartPantry,
): FoodState {
  return { ...state, pantry: update(state.pantry ?? emptyPantry) };
}
