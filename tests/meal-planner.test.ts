import { IDBFactory } from 'fake-indexeddb';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { createFoodRepository } from '@/database/repositories/food';
import { builtinFoods } from '@/features/food/catalog';
import { entryNutrition } from '@/features/food/domain';
import { emptyFoodState } from '@/features/food/model';
import { editEntry } from '@/features/food/operations';
import { defaultGeneration } from '@/features/planner/model';
import {
  copyMeals,
  createPlanDay,
  createPlanMeal,
  markPlanMeal,
  planItemFromProduct,
  planStats,
  readPlanner,
  resizePlanItem,
  savePlanDays,
  savePlanTemplate,
  undoPlanItem,
} from '@/features/planner/operations';

const date = '2026-11-27';
const product = builtinFoods.find(
  (p) => p.per100.calories > 100 && p.baseUnit !== 'ml',
)!;
function fixture() {
  const meal = createPlanMeal('postWorkout');
  const item = planItemFromProduct(product, 100, 'g', date, meal.kind);
  return {
    item,
    day: { ...createPlanDay(date), meals: [{ ...meal, items: [item] }] },
  };
}

test('редактирует порцию, копирует дни и сохраняет снимок через шаблон', () => {
  const { day, item } = fixture();
  const updated = resizePlanItem(item, 150, 'g');
  expect(entryNutrition(updated.entry).calories).toBeCloseTo(
    product.per100.calories * 1.5,
  );
  const state = savePlanDays(emptyFoodState(), [day]);
  expect(() => savePlanDays(state, [day])).toThrow(/изменился/);
  const template = {
    id: 'template',
    name: 'Тренировочный день',
    meals: day.meals,
  };
  const saved = savePlanTemplate(state, template);
  const copy = copyMeals(readPlanner(saved).templates[0].meals, '2026-11-28');
  expect(copy[0].items[0].entry.id).not.toBe(item.entry.id);
  expect(copy[0].items[0].entry.product).toEqual(item.entry.product);
  expect(copy[0].items[0].entry.date).toBe('2026-11-28');
});

test('переносит фактическую порцию один раз и отменяет отметку', () => {
  const { day, item } = fixture();
  const state = savePlanDays(emptyFoodState(), [day]);
  expect(planStats(day, state.entries).actual.calories).toBe(0);
  const marked = markPlanMeal(
    state,
    day,
    day.meals[0],
    resizePlanItem(item, 80, 'g'),
  );
  const duplicate = markPlanMeal(marked, day, day.meals[0]);
  expect(duplicate.entries).toHaveLength(1);
  expect(duplicate.entries[0].amount).toBe(80);
  expect(planStats(day, duplicate.entries)).toMatchObject({
    completed: true,
    percent: 100,
  });
  const undone = undoPlanItem(duplicate, item.entry.id);
  expect(undone.entries).toHaveLength(0);
  expect(planStats(day, undone.entries)).toMatchObject({
    completed: false,
    percent: 0,
  });
});

test('при правке записи в дневнике сохраняет связь и защищает недавно подтверждённое блюдо', () => {
  const { day, item } = fixture();
  const state = savePlanDays(emptyFoodState(), [day]);
  const marked = markPlanMeal(state, day, day.meals[0]);
  const moved = editEntry(
    marked,
    item.entry.id,
    120,
    'g',
    'snack',
    '2026-11-28',
  );
  expect(markPlanMeal(moved, day, day.meals[0])).toBe(moved);
  expect(planStats(day, moved.entries)).toMatchObject({
    actual: { calories: 0 },
    percent: 100,
  });
  const replacement = { ...day, meals: [] };
  expect(() =>
    savePlanDays(moved, [replacement], { [date]: day }, defaultGeneration),
  ).toThrow(/Отметки дневника изменились/);
  expect(undoPlanItem(moved, item.entry.id, moved.entries[0]).entries).toEqual(
    [],
  );
});

test('мигрирует IndexedDB v5 и восстанавливает план и дневник из новой сессии', async () => {
  const factory = new IDBFactory();
  const original = {
    ...emptyFoodState(),
    favorites: [{ productId: product.id }],
  };
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('masstracker', 5);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('app_settings', { keyPath: 'key' }).put({
        key: 'food_diary_state',
        value: JSON.stringify(original),
        updatedAt: '2026-11-26',
      });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  const storage = await openIndexedDbSettings(factory);
  expect(await storage.get('meal_planner_schema')).toBe('1');
  const repository = createFoodRepository(storage);
  expect(await repository.load()).toEqual(original);
  const { day } = fixture();
  await repository.change((state) => savePlanDays(state, [day]));
  await repository.change((state) => markPlanMeal(state, day, day.meals[0]));
  const reopened = await createFoodRepository(
    await openIndexedDbSettings(factory),
  ).load();
  expect(readPlanner(reopened).days[date]).toEqual(day);
  expect(reopened.favorites).toEqual(original.favorites);
  expect(reopened.entries).toHaveLength(1);
});
