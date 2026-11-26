/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { createFoodRepository } from '@/database/repositories/food';
import { builtinFoods } from '@/features/food/catalog';
import { entryNutrition, makeEntry, sumEntries } from '@/features/food/domain';
import { deleteProduct, saveProduct } from '@/features/food/operations';
import {
  calculateRecipe,
  makeIngredient,
  scaleRecipe,
} from '@/features/recipes/domain';
import {
  addRecipeEntry,
  deleteRecipeEntry,
  duplicateRecipe,
  editRecipeEntry,
  saveRecipe,
  deleteRecipe,
} from '@/features/recipes/operations';
import type { Recipe } from '@/features/recipes/model';
import { emptyFoodState } from '@/features/food/model';
import { formatFoodQuantity } from '@/features/food/units';

const product = {
  ...builtinFoods[0],
  id: 'custom-milk',
  name: 'Молоко',
  isCustom: true,
  gramsPerMl: 1.03,
  pieceGrams: 55,
  servingGrams: 125,
  per100: { calories: 100, protein: 10, fat: 4, carbs: 6 },
};
const stamp = '2026-11-27T00:00:00.000Z';
function recipe(): Recipe {
  return {
    id: 'recipe',
    name: 'Блюдо',
    category: 'Другое',
    servings: 2,
    cookedWeightGrams: 200,
    isFavorite: false,
    createdAt: stamp,
    updatedAt: stamp,
    ingredients: [
      makeIngredient(product, 0.2, 'kg'),
      makeIngredient(product, 0.1, 'l'),
    ],
  };
}

test('сумма, порция, 100 г, исходная масса и масштабирование', () => {
  const original = recipe();
  const result = calculateRecipe(original);
  expect(result.total.calories).toBeCloseTo(303);
  expect(result.total.protein).toBeCloseTo(30.3);
  expect(result.total.fat).toBeCloseTo(12.12);
  expect(result.total.carbs).toBeCloseTo(18.18);
  expect(result.perServing.calories).toBeCloseTo(151.5);
  expect(result.per100.calories).toBeCloseTo(151.5);
  expect(
    calculateRecipe({ ...original, cookedWeightGrams: undefined }).per100
      .calories,
  ).toBeCloseTo(100);
  const scaled = scaleRecipe(original, 4);
  expect(scaled.ingredients.map((i) => i.quantity)).toEqual([0.4, 0.2]);
  expect(scaled.cookedWeightGrams).toBe(400);
  expect(calculateRecipe(scaled).total.calories).toBeCloseTo(606);
  expect(original.ingredients[0].quantity).toBe(0.2);
});

test('единицы и невалидные исходные данные', () => {
  expect(formatFoodQuantity(0.04)).toBe('0,04');
  expect(makeIngredient(product, 2, 'piece').normalizedQuantity).toBe(110);
  expect(makeIngredient(product, 0.5, 'serving').normalizedQuantity).toBe(62.5);
  expect(makeIngredient(product, 700, 'ml').normalizedQuantity).toBeCloseTo(
    721,
  );
  expect(() =>
    makeIngredient({ ...product, gramsPerMl: undefined }, 1, 'ml'),
  ).toThrow();
  expect(() =>
    makeIngredient(
      { ...product, per100: { ...product.per100, fat: NaN } },
      1,
      'g',
    ),
  ).toThrow();
  for (const bad of [NaN, Infinity, -1, 0]) {
    expect(() => makeIngredient(product, bad, 'g')).toThrow();
    expect(() => calculateRecipe({ ...recipe(), servings: bad })).toThrow();
  }
});

test('рецепты и снимки переживают правки, удаление продукта и повторное открытие', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  const repo = createFoodRepository(storage);
  await repo.change((s) => saveProduct(s, product));
  const original = recipe();
  await repo.change((s) => saveRecipe(s, original));
  const duplicate = duplicateRecipe(original);
  await repo.change((s) => saveRecipe(s, duplicate));
  await repo.change((s) =>
    addRecipeEntry(
      s,
      original.id,
      0.5,
      'serving',
      'lunch',
      '2026-11-27',
      'idempotent',
    ),
  );
  await repo.change((s) =>
    addRecipeEntry(s, original.id, 50, 'g', 'dinner', '2026-11-27', 'weight'),
  );
  await repo.change((s) =>
    addRecipeEntry(
      s,
      original.id,
      0.5,
      'serving',
      'lunch',
      '2026-11-27',
      'idempotent',
    ),
  );
  await repo.change((s) =>
    saveRecipe(s, { ...original, name: 'После правки', servings: 4 }, original),
  );
  await repo.change((s) => deleteProduct(s, product.id));
  await repo.change((s) => deleteRecipe(s, original.id));
  const reopened = createFoodRepository(await openIndexedDbSettings(factory));
  const state = await reopened.load();
  expect(state.recipes).toEqual([duplicate]);
  expect(state.entries).toHaveLength(2);
  expect(state.entries[0].product.name).toBe('Блюдо');
  expect(entryNutrition(state.entries[0]).calories).toBeCloseTo(75.75);
  expect(sumEntries(state.entries, '2026-11-27').calories).toBeCloseTo(151.5);
  expect(await storage.get('recipes_schema')).toBe('1');
});

test('миграция IndexedDB v3 оставляет дневник и профиль прежней версии', async () => {
  const factory = new IDBFactory();
  const entry = makeEntry(product, 100, 'g', 'snack', '2026-11-27');
  const { version, favorites, recent } = emptyFoodState();
  const saved = JSON.stringify({
    version,
    favorites,
    recent,
    products: [product],
    entries: [entry],
  });
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('masstracker', 3);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('app_settings', {
        keyPath: 'key',
      });
      for (const [key, value] of [
        ['food_diary_state', saved],
        ['user_state', 'original'],
        ['food_diary_schema', '1'],
      ])
        store.put({ key, value, updatedAt: stamp });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  const storage = await openIndexedDbSettings(factory);
  const repository = createFoodRepository(storage);
  expect(await repository.load()).toMatchObject({
    entries: [entry],
    recipes: [],
  });
  expect(await storage.get('food_diary_state')).toBe(saved);
  expect(await storage.get('user_state')).toBe('original');
  await repository.change((s) => saveRecipe(s, recipe()));
  expect((await repository.load()).entries).toEqual([entry]);
});

test('изменённая в другом окне запись защищена от удаления по старому снимку', async () => {
  const store = await openIndexedDbSettings(new IDBFactory());
  const first = createFoodRepository(store);
  const second = createFoodRepository(store);
  const original = recipe();
  await first.change((s) => saveRecipe(s, original));
  const state = await first.change((s) =>
    addRecipeEntry(
      s,
      original.id,
      1,
      'serving',
      'lunch',
      '2026-11-27',
      'entry',
    ),
  );
  const stale = state.entries[0];
  if (!stale.recipe) throw new Error('Expected recipe entry');
  await second.change((s) =>
    editRecipeEntry(s, stale, 0.5, 'serving', 'lunch', stale.date),
  );
  await expect(
    first.change((s) => deleteRecipeEntry(s, stale)),
  ).rejects.toThrow(/Запись изменилась/);
  expect((await first.load()).entries[0].amount).toBe(0.5);
});

test('переполнение отклоняется при новой записи, прежнюю запись можно загрузить', async () => {
  const extreme = {
    ...product,
    per100: { ...product.per100, calories: 9e307 },
  };
  expect(() => makeEntry(extreme, 300, 'g', 'lunch', '2026-11-27')).toThrow(
    /пределы/,
  );
  const initial = makeEntry(extreme, 100, 'g', 'lunch', '2026-11-27');
  const storage = await openIndexedDbSettings(new IDBFactory());
  const legacy = { ...initial, amount: 300, grams: 300 };
  const state = { ...emptyFoodState(), entries: [legacy] };
  await storage.apply([
    { key: 'food_diary_state', value: JSON.stringify(state) },
  ]);
  const repo = createFoodRepository(storage);
  expect((await repo.load()).entries[0]).toEqual(legacy);
  expect(() => entryNutrition(legacy)).not.toThrow();

  const large = {
    ...recipe(),
    servings: 1,
    ingredients: [makeIngredient(extreme, 100, 'g')],
  };
  const saved = saveRecipe(emptyFoodState(), large);
  const added = addRecipeEntry(
    saved,
    large.id,
    1,
    'serving',
    'lunch',
    '2026-11-27',
    'entry-1',
  );
  expect(() =>
    addRecipeEntry(
      added,
      large.id,
      1,
      'serving',
      'lunch',
      '2026-11-27',
      'entry-2',
    ),
  ).toThrow(/за день/);
});
