/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { createFoodRepository } from '@/database/repositories/food';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { builtinFoods } from '@/features/food/catalog';
import { emptyFoodState } from '@/features/food/model';
import { calculateRecipe, scaleRecipe } from '@/features/recipes/domain';
import { builtinRecipes } from '@/features/recipes/library';
import {
  addRecipeEntry,
  duplicateRecipe,
  rememberRecipeQuery,
  recipeIsFavorite,
  saveRecipe,
  setRecipeFavorite,
} from '@/features/recipes/operations';
import {
  buildRecipeIndex,
  findRecipes,
  pantryMatch,
} from '@/features/recipes/recipe-search';

test('the offline catalog contains unique, complete, cookable recipes with local product references', () => {
  expect(builtinRecipes.length).toBeGreaterThanOrEqual(150);
  expect(new Set(builtinRecipes.map((r) => r.id)).size).toBe(
    builtinRecipes.length,
  );
  expect(new Set(builtinRecipes.map((r) => r.name.toLowerCase())).size).toBe(
    builtinRecipes.length,
  );
  expect(
    new Set(
      builtinRecipes.map((recipe) =>
        recipe.ingredients
          .map((ingredient) => ingredient.productId)
          .sort()
          .join('|'),
      ),
    ).size,
  ).toBe(builtinRecipes.length);
  expect(new Set(builtinRecipes.map((recipe) => recipe.category)).size).toBe(
    15,
  );
  const products = new Map(builtinFoods.map((p) => [p.id, p]));
  for (const recipe of builtinRecipes) {
    expect(recipe.description).toBeTruthy();
    expect(recipe.metadata?.steps.length).toBeGreaterThan(1);
    for (const ingredient of recipe.ingredients) {
      expect(products.get(ingredient.productId)?.per100).toEqual(
        ingredient.nutritionSnapshot,
      );
    }
    const nutrition = calculateRecipe(recipe);
    expect(nutrition.perServing.calories).toBeCloseTo(
      nutrition.total.calories / recipe.servings,
    );
    expect(
      calculateRecipe(scaleRecipe(recipe, recipe.servings * 2)).total.protein,
    ).toBeCloseTo(nutrition.total.protein * 2);
  }
});

test('search ranks titles, combines ingredient terms and respects exclusions and pantry matching', () => {
  const index = buildRecipeIndex(
    builtinRecipes,
    builtinFoods,
    emptyFoodState(),
  );
  const sample = index[0];
  expect(
    findRecipes(index, { query: sample.recipe.name.toUpperCase() })[0].recipe
      .id,
  ).toBe(sample.recipe.id);
  expect(
    findRecipes(index, { query: 'банан   молоко овсянка' }).length,
  ).toBeGreaterThan(0);
  const cheesePasta = findRecipes(index, { query: 'Макароны с сыром' }).map(
    ({ recipe }) => recipe.name,
  );
  expect(cheesePasta.length).toBeGreaterThan(0);
  expect(cheesePasta).not.toContain('Паста с мясным соусом');
  expect(cheesePasta).not.toContain('Паста с лососем и горошком');
  const ids = [...sample.ingredientIds];
  expect(
    findRecipes(index, { required: [ids[0]], excluded: [ids[0]] }),
  ).toEqual([]);
  expect(findRecipes(index, { required: [ids[0]], maxCalories: 0 })).toEqual(
    [],
  );
  expect(pantryMatch(sample, new Set(ids), false).percent).toBe(100);
  expect(findRecipes(index, { pantry: ids })[0].match?.missing).toBe(0);
});

test('a built-in recipe logs as one immutable nutrition snapshot and can be copied independently', () => {
  const recipe = builtinRecipes[0];
  const copy = duplicateRecipe(recipe);
  expect(copy.id).not.toBe(recipe.id);
  const state = saveRecipe(emptyFoodState(), copy);
  const logged = addRecipeEntry(
    state,
    recipe.id,
    2,
    'serving',
    'lunch',
    '2026-11-27',
    'entry',
    recipe,
  );
  expect(logged.entries).toHaveLength(1);
  expect(logged.entries[0].recipe?.total).toEqual(
    calculateRecipe(recipe).total,
  );
  expect(logged.recipes).toEqual([copy]);
  expect(
    addRecipeEntry(
      logged,
      recipe.id,
      2,
      'serving',
      'lunch',
      '2026-11-27',
      'entry',
      recipe,
    ),
  ).toBe(logged);
  expect(() => saveRecipe(state, recipe)).toThrow(/Скопируйте/);
});

test('the IndexedDB catalog migration preserves existing entries and preferences survive restart', async () => {
  const factory = new IDBFactory();
  const old = emptyFoodState();
  const recipe = builtinRecipes[1];
  const copy = duplicateRecipe(recipe);
  const existing = addRecipeEntry(
    saveRecipe(old, copy),
    copy.id,
    1,
    'serving',
    'dinner',
    '2026-11-27',
    'old',
  );
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('masstracker', 4);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('app_settings', {
        keyPath: 'key',
      });
      store.put({
        key: 'food_diary_state',
        value: JSON.stringify(existing),
        updatedAt: 'previous',
      });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
  const storage = await openIndexedDbSettings(factory);
  const repository = createFoodRepository(storage);
  expect(await storage.get('recipe_library_schema')).toBe('1');
  expect(await repository.load()).toEqual(existing);
  await repository.change((state) => setRecipeFavorite(state, recipe, true));
  await repository.change((state) =>
    rememberRecipeQuery(state, '  ПЛОВ   с курицей '),
  );
  await repository.change((state) =>
    rememberRecipeQuery(state, 'плов с курицей'),
  );
  const restored = await createFoodRepository(
    await openIndexedDbSettings(factory),
  ).load();
  expect(restored.entries).toEqual(existing.entries);
  expect(restored.recipes).toEqual([copy]);
  expect(recipeIsFavorite(restored, recipe)).toBe(true);
  expect(restored.recipeSearchHistory).toEqual(['плов с курицей']);
  expect(
    recipeIsFavorite(setRecipeFavorite(restored, recipe, false), recipe),
  ).toBe(false);
});
