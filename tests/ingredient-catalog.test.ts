import {
  builtinFoodCatalogVersion,
  builtinFoods,
} from '@/features/food/catalog';
import { portion, searchFoods, unitsFor } from '@/features/food/domain';
import { categories } from '@/features/food/model';

test('справочник содержит не менее 1871 разных записей USDA с устойчивыми ключами', () => {
  const sourced = builtinFoods.filter((food) => food.fdcId !== undefined);
  const ingredients = builtinFoods.filter((food) => !food.barcode);
  expect(builtinFoodCatalogVersion).toBe(4);
  expect(sourced.length).toBeGreaterThanOrEqual(1871);
  expect(new Set(builtinFoods.map(({ id }) => id)).size).toBe(
    builtinFoods.length,
  );
  expect(new Set(ingredients.map(({ name }) => name)).size).toBe(
    ingredients.length,
  );
  expect(new Set(sourced.map(({ fdcId }) => fdcId)).size).toBe(sourced.length);
  expect(
    builtinFoods.filter((food) => food.id.startsWith('builtin-')),
  ).toHaveLength(129);
  for (const { id, fdcId, source } of sourced) {
    expect(id).toBe(`fdc-${fdcId}`);
    expect(source).toContain(`SR Legacy (04.2018), FDC ${fdcId}`);
  }
  for (const food of ingredients) {
    const { calories, protein, fat, carbs } = food.per100;
    expect(categories).toContain(food.category);
    expect(food.aliases?.length).toBeGreaterThan(0);
    expect(food.approximate).toBe(true);
    expect(food.baseUnit).toBe('g');
    expect(unitsFor(food)).toContain('g');
    expect(
      [calories, protein, fat, carbs].every(
        (value) => Number.isFinite(value) && value >= 0,
      ),
    ).toBe(true);
  }
});

test('поиск находит сухую красную чечевицу по синониму и учитывает её исходные значения', () => {
  const [red] = searchFoods(builtinFoods, 'КРАСНАЯ    чечевица');
  const cooked = builtinFoods.find(({ name }) => name === 'Чечевица варёная');
  expect(red?.id).toBe('fdc-174284');
  expect(red?.per100).toEqual({
    calories: 358,
    protein: 23.91,
    fat: 2.17,
    carbs: 63.1,
  });
  expect(cooked?.per100.calories).toBe(116);
  expect(portion(red, 50, 'g').calories).toBe(179);
});

test('меры порций доступны только при известной массе', () => {
  const syrup = builtinFoods.find(({ id }) => id === 'fdc-169661');
  const lentils = builtinFoods.find(({ id }) => id === 'fdc-174284');
  const quailEgg = builtinFoods.find(({ id }) => id === 'fdc-172191');
  expect(syrup?.servingGrams).toBe(83);
  expect(syrup && unitsFor(syrup)).toContain('serving');
  expect(quailEgg?.pieceGrams).toBe(9);
  expect(quailEgg && unitsFor(quailEgg)).toContain('piece');
  expect(lentils && unitsFor(lentils)).toEqual(['g']);
});
