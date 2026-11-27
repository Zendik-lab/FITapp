import { builtinFoods } from '@/features/food/catalog';
import { emptyFoodState } from '@/features/food/model';
import { generatePlans } from '@/features/planner/generator';
import { defaultGeneration } from '@/features/planner/model';
import { planStats } from '@/features/planner/operations';

const targets = { calories: 2700, protein: 155, fat: 82, carbs: 335 };
const week = [
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
  '2026-11-26',
  '2026-11-27',
  '2026-11-28',
  '2026-11-29',
];
const generate = (options: Partial<Parameters<typeof generatePlans>[0]> = {}) =>
  generatePlans({
    dates: week.slice(0, 1),
    state: emptyFoodState(),
    products: builtinFoods,
    settings: defaultGeneration,
    target: targets,
    yieldControl: async () => {},
    ...options,
  });

test('подбирает реалистичный рацион на семь дней без повторов и с отклонением до 5%', async () => {
  const days = await generate({
    dates: week,
    settings: { ...defaultGeneration, repeats: false },
  });
  expect(days.map((day) => day.date)).toEqual(week);
  const recipes = new Set<string>();
  for (const day of days) {
    const stats = planStats(day, []);
    expect(Math.abs(stats.delta!.calories)).toBeLessThanOrEqual(
      targets.calories * 0.05,
    );
    expect(stats.planned.protein).toBeGreaterThan(100);
    expect(day.meals).toHaveLength(4);
    for (const { entry } of day.meals.flatMap((meal) => meal.items)) {
      if (!entry.recipe) continue;
      expect(recipes.has(entry.product.id)).toBe(false);
      recipes.add(entry.product.id);
      expect(entry.amount).toBeLessThanOrEqual(2);
    }
  }
  expect(recipes.size).toBeGreaterThan(10);
});

test('проверяет исключения по ингредиентам, сохраняет фиксацию и показывает недобор при пустых запасах', async () => {
  const [original] = await generate();
  const meal = original.meals[0];
  const locked = { ...meal.items[0], locked: true };
  const [revised] = await generate({
    existing: {
      [original.date]: {
        ...original,
        meals: [{ ...meal, items: [locked] }, ...original.meals.slice(1)],
      },
    },
    settings: {
      ...defaultGeneration,
      allergies: 'молоко',
      excludes: 'рис, банан',
      stockOnly: true,
    },
  });
  const items = revised.meals.flatMap((row) => row.items);
  expect(items).toEqual([locked]);
  expect(planStats(revised, []).delta!.calories).toBeLessThan(-500);

  const [filtered] = await generate({
    settings: {
      ...defaultGeneration,
      allergies: 'молоко',
      excludes: 'рис, банан',
    },
  });
  const products = new Map(
    builtinFoods.map((product) => [product.id, product]),
  );
  for (const { entry } of filtered.meals.flatMap((row) => row.items)) {
    const names = entry.recipe
      ? entry.recipe.ingredients!.map(({ id }) => products.get(id)?.name ?? '')
      : [entry.product.name];
    expect(names.join(' ')).not.toMatch(
      /молок|молоч|сыр\b|творог|йогурт|кефир|рис\b|банан/i,
    );
  }
  expect(planStats(filtered, []).planned.calories).toBeGreaterThan(1400);
});

test('соблюдает совокупный лимит запасов на все дни и требует фактических цен для бюджета', async () => {
  const product = builtinFoods.find((row) => row.name === 'Хлеб пшеничный')!;
  const state = {
    ...emptyFoodState(),
    pantry: {
      shopping: [],
      prices: {},
      stock: [
        {
          id: product.id,
          name: product.name,
          category: product.category,
          grams: 100,
        },
      ],
    },
  };
  const days = await generate({
    state,
    dates: week,
    settings: { ...defaultGeneration, stockOnly: true },
  });
  const entries = days.flatMap((day) =>
    day.meals.flatMap((meal) => meal.items.map((item) => item.entry)),
  );
  expect(entries.length).toBeGreaterThan(0);
  expect(
    entries.reduce((sum, entry) => sum + (entry.grams ?? 0), 0),
  ).toBeLessThanOrEqual(100);
  await expect(
    generate({ settings: { ...defaultGeneration, mode: 'budget' } }),
  ).rejects.toThrow(/цен/);
});

test('меняет один приём и сохраняет остальной день с его размерами порций', async () => {
  const [old] = await generate();
  const meal = old.meals[0];
  const [next] = await generate({
    existing: { [old.date]: old },
    mealId: meal.id,
    settings: { ...defaultGeneration, maxMinutes: 10, mode: 'quick' },
  });
  expect(next.meals[0].id).toBe(meal.id);
  expect(next.meals[0].items).not.toEqual(meal.items);
  expect(next.meals.slice(1)).toEqual(old.meals.slice(1));
});
