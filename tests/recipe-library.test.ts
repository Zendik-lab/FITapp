/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { createFoodRepository } from '@/database/repositories/food';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { builtinFoods } from '@/features/food/catalog';
import { emptyFoodState } from '@/features/food/model';
import { calculateRecipe, scaleRecipe } from '@/features/recipes/domain';
import {
  builtinRecipeIds,
  builtinRecipeSearchInputs,
  getBuiltinRecipe,
} from '@/features/recipes/library';
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
  recipeIngredientKey,
} from '@/features/recipes/recipe-search';

const builtinRecipes = builtinRecipeIds.map((id) => {
  const recipe = getBuiltinRecipe(id);
  if (!recipe) throw new Error(`Missing published recipe ${id}`);
  return recipe;
});

test('the offline catalog contains unique, complete, cookable recipes with local product references', () => {
  expect(builtinRecipes.length).toBeGreaterThan(150);
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
  expect(
    new Set(builtinRecipes.map((recipe) => recipe.category)).size,
  ).toBeGreaterThanOrEqual(15);
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
  const cream = findRecipes(index, { query: 'сливки' }).filter((item) =>
    item.ingredientWords.some((words) => words.includes('сливки')),
  );
  expect(cream.length).toBeGreaterThan(0);
  const noCream = new Set(
    findRecipes(index, { query: 'без сливок' }).map((item) => item.recipe.id),
  );
  expect(cream.every((item) => !noCream.has(item.recipe.id))).toBe(true);
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

test('measures card indexing, search and filters with 50,000 fixture records', () => {
  const fixture = builtinRecipes.slice(0, 12);
  const size = 50_000;
  function* rows() {
    for (let i = 0; i < size; i++) {
      const recipe = fixture[i % fixture.length];
      yield {
        ...recipe,
        id: `library:benchmark-${i}`,
        name: `${recipe.name} ${i}`,
      };
    }
  }
  global.gc?.();
  const memory = process.memoryUsage().heapUsed;
  const start = performance.now();
  const index = buildRecipeIndex(rows(), builtinFoods, emptyFoodState());
  const indexed = performance.now();
  const search = findRecipes(index, {
    query: fixture[0].name,
    required: [fixture[0].ingredients[0].productId],
    maxTime: fixture[0].preparationTime,
  });
  const firstQuery = performance.now();
  const filtered = findRecipes(index, {
    required: [fixture[0].ingredients[0].productId],
    maxCalories: 1000,
    sort: 'calories',
  });
  const finished = performance.now();
  expect(index).toHaveLength(size);
  expect(search.some(({ recipe }) => recipe.id === 'library:benchmark-0')).toBe(
    true,
  );
  expect(filtered.length).toBeGreaterThan(0);
  global.gc?.();
  const heap = global.gc
    ? `, retained heap delta ${Math.round((process.memoryUsage().heapUsed - memory) / 1024 ** 2)} MiB`
    : '';
  process.stdout.write(
    `Recipe benchmark (50,000, Node): index ${Math.round(indexed - start)} ms, first query ${Math.round(firstQuery - indexed)} ms, filters ${Math.round(finished - firstQuery)} ms${heap}\n`,
  );
});

test('summary search and lazy detail agree for Wikibooks recipes and filter them by cuisine', () => {
  const index = buildRecipeIndex(
    builtinRecipeSearchInputs(),
    builtinFoods,
    emptyFoodState(),
  );
  const result = findRecipes(index, {
    cuisines: ['Итальянская кухня'],
    query: 'полента',
    required: ['fdc-169697'],
    maxTime: 60,
    sort: 'time',
  })[0];
  expect(result.recipe.id).toBe('library:wikibooks-pl-31729');
  expect(result.recipe).not.toHaveProperty('ingredients');
  const recipe = getBuiltinRecipe(result.recipe.id);
  expect(recipe?.metadata?.difficulty).toBeUndefined();
  expect(recipe?.metadata?.provenance).toContain('CC BY-SA 4.0');
  expect(recipe && calculateRecipe(recipe).perServing).toEqual(
    result.nutrition,
  );
  const pizza = getBuiltinRecipe('library:wikibooks-pl-4585');
  expect(pizza?.ingredients.at(-1)?.sourceQuantity).toBe('400–500 г');
});

test('pantry and ingredient filters use confirmed equivalents and preserve raw/cooked differences', () => {
  const index = buildRecipeIndex(
    builtinRecipeSearchInputs(),
    builtinFoods,
    emptyFoodState(),
  );
  expect(recipeIngredientKey('builtin-70')).toBe(
    recipeIngredientKey('fdc-170393'),
  );
  expect(recipeIngredientKey('builtin-37')).not.toBe(
    recipeIngredientKey('builtin-38'),
  );
  const recipe = index.find((item) => item.ingredientIds.has('fdc-170393'));
  expect(
    recipe && pantryMatch(recipe, new Set(['builtin-70']), false).matched,
  ).toBe(1);
  expect(
    findRecipes(index, { required: ['builtin-70'] }).some(
      (row) => row.recipe.id === recipe?.recipe.id,
    ),
  ).toBe(true);
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
