import { emptyFoodState, type FoodProduct } from '@/features/food/model';
import { makeEntry } from '@/features/food/domain';
import { copyDay, restoreEntry } from '@/features/food/operations';
import { activityReport } from '@/features/smart/activity';
import {
  mergeShopping,
  portionCost,
  recipeCoverage,
  diaryCost,
} from '@/features/smart/planning';
import { createFoodRepository } from '@/database/repositories/food';
import { buildRecipeIndex } from '@/features/recipes/recipe-search';
import { builtinRecipeSearchInputs } from '@/features/recipes/library';
import { builtinFoods } from '@/features/food/catalog';
import { addRecipeEntry } from '@/features/recipes/operations';
import { suggestMeals } from '@/features/smart/recommend';
import {
  decodePersonalization,
  defaultPersonalization,
} from '@/features/settings/personalization';
import { memoryStorage } from './fixtures/profile';

const product: FoodProduct = {
  id: 'oats',
  name: 'Овёс',
  category: 'Крупы',
  source: 'test',
  per100: { calories: 370, protein: 13, fat: 7, carbs: 64 },
  isCustom: true,
  createdAt: '',
  updatedAt: '',
};
const entry = makeEntry(product, 50, 'g', 'breakfast', '2026-11-24');

test('day and meal copies share duplicate protection and preserve original snapshots', () => {
  const day = copyDay(
    { ...emptyFoodState(), entries: [entry] },
    entry.date,
    '2026-11-25',
  );
  expect(day.entries).toHaveLength(2);
  expect(copyDay(day, entry.date, '2026-11-25', 'breakfast').entries).toEqual(
    day.entries,
  );
  expect(copyDay(day, '2026-11-25', '2026-11-25')).toEqual(day);
  expect(restoreEntry(day, entry)).toEqual(day);
  expect(
    restoreEntry({ ...day, entries: day.entries.slice(1) }, entry).entries,
  ).toContain(entry);
});

test('shopping merges quantities without reusing purchased positions', () => {
  const item = {
    id: product.id,
    name: product.name,
    category: product.category,
    grams: 100,
  };
  const first = mergeShopping([], [item]);
  expect(mergeShopping(first, [item])[0].grams).toBe(200);
  const purchased = first.map((row) => ({ ...row, bought: true }));
  expect(mergeShopping(purchased, [item]).map((row) => row.grams)).toEqual([
    100, 100,
  ]);
  expect(portionCost({ amount: 1200, grams: 600 }, 50)).toBe(100);
  expect(portionCost(undefined, 50)).toBeNull();
});

test('fridge groups duplicate ingredients and compares gram quantities', () => {
  const ingredient = {
    productId: 'oats',
    productName: 'Овёс',
    normalizedQuantity: 50,
  };
  expect(recipeCoverage([ingredient, ingredient], { oats: 60 })).toMatchObject({
    percent: 60,
    missing: [{ id: 'oats', grams: 40 }],
  });
});

test('weekly averages use logged days, with a streak ending yesterday', () => {
  const copy = copyDay(
    { ...emptyFoodState(), entries: [entry] },
    entry.date,
    '2026-11-25',
  );
  expect(activityReport(copy.entries, '2026-11-26', 7)).toMatchObject({
    activeDays: 2,
    current: 2,
    longest: 2,
    average: { calories: 185 },
  });
});

test('pantry and recipe cost additions round trip through legacy diary storage', async () => {
  const storage = await memoryStorage();
  const legacy = { ...emptyFoodState(), entries: [entry] };
  await storage.apply([
    { key: 'food_diary_state', value: JSON.stringify(legacy) },
  ]);
  const repository = createFoodRepository(storage);
  expect(await repository.load()).toEqual(legacy);
  const [recipe] = builtinRecipeSearchInputs();
  await repository.change((state) =>
    addRecipeEntry(
      state,
      recipe.id,
      2,
      'serving',
      'lunch',
      entry.date,
      'lunch',
    ),
  );
  const prices = Object.fromEntries(
    recipe.ingredients.map((ingredient) => [
      ingredient.productId,
      { amount: 100, grams: 100 },
    ]),
  );
  const written = await repository.change((state) => ({
    ...state,
    pantry: { stock: [], shopping: [], prices, dailyBudget: 1700 },
  }));
  expect(await repository.load()).toEqual(JSON.parse(JSON.stringify(written)));
  expect(diaryCost(written.entries, prices)).toMatchObject({ unknown: 1 });
  expect(diaryCost(written.entries, prices).amount).toBeCloseTo(
    (recipe.ingredients.reduce(
      (sum, item) => sum + item.normalizedQuantity,
      0,
    ) *
      2) /
      recipe.servings,
  );
});

test('Smart Meal includes real catalog values and stops for unverified allergies', () => {
  const state = emptyFoodState();
  const index = buildRecipeIndex(
    builtinRecipeSearchInputs(),
    builtinFoods,
    state,
  );
  const rest = { calories: 800, protein: 40, fat: 25, carbs: 100 };
  const settings = {
    mealsPerDay: null,
    diet: '',
    excludedFoods: '',
    allergies: '',
    restrictions: '',
  };
  const options = suggestMeals(
    rest,
    index,
    builtinFoods,
    state,
    settings,
    'gain',
    8,
  );
  expect(options.length).toBeGreaterThan(1);
  expect(options.some((option) => option.parts.length === 2)).toBe(true);
  for (const option of options)
    expect(option.values.calories).toBeGreaterThan(0);
  expect(
    suggestMeals(
      rest,
      index,
      builtinFoods,
      state,
      { ...settings, allergies: 'арахис' },
      'gain',
      8,
    ),
  ).toEqual([]);
});

test('Smart Meal keeps the milliliter basis when recommending a dairy product', () => {
  const drink = {
    ...product,
    id: 'milk',
    name: 'Молоко',
    category: 'Молочные продукты',
    baseUnit: 'ml' as const,
  };
  const [suggestion] = suggestMeals(
    { calories: 800, protein: 40, fat: 25, carbs: 100 },
    [],
    [drink],
    emptyFoodState(),
    {
      mealsPerDay: null,
      diet: '',
      excludedFoods: '',
      allergies: '',
      restrictions: '',
    },
    'gain',
    8,
  );
  expect(suggestion.parts[0]).toMatchObject({
    id: drink.id,
    kind: 'product',
    unit: 'ml',
  });
});

test('personalization preserves a custom order and validates typed fields', () => {
  const initial = JSON.stringify(defaultPersonalization);
  expect(JSON.stringify(decodePersonalization(initial))).toBe(initial);
  const prefs = {
    ...defaultPersonalization,
    order: ['actions', 'recent'],
    hidden: ['training'],
    motion: 'off',
  };
  expect(decodePersonalization(JSON.stringify(prefs))).toMatchObject({
    order: ['actions', 'recent', 'stats', 'goal', 'training'],
    hidden: ['training'],
    motion: 'off',
  });
  expect(() =>
    decodePersonalization(
      JSON.stringify({ ...prefs, order: ['actions', 'actions'] }),
    ),
  ).toThrow();
});
