import { addDays } from '@/features/calendar/calendar';
import {
  addNutrition,
  checkDayNutrition,
  dateKey,
  entryNutrition,
  makeEntry,
  newId,
  parseDateKey,
  recipePortion,
  sumEntries,
  zeroNutrition,
} from '@/features/food/domain';
import type {
  FoodDiaryEntry,
  FoodProduct,
  FoodState,
  FoodUnit,
  RecipeDiaryEntry,
} from '@/features/food/model';
import { addEntry, removeEntry } from '@/features/food/operations';
import type { NutritionTargets } from '@/features/nutrition/engine';
import { validateRecipe } from '@/features/recipes/domain';
import type { Recipe } from '@/features/recipes/model';
import { makeRecipeEntry } from '@/features/recipes/operations';
import { ingredientQuantities } from '@/features/smart/planning';
import {
  emptyPlanner,
  planMealKinds,
  type PlanDay,
  type PlanItem,
  type PlanMeal,
  type PlanMealKind,
  type PlanTemplate,
  type GenerationSettings,
} from './model';

export const readPlanner = (state: FoodState) => state.planner ?? emptyPlanner;

export function planDates(start: string, count: number) {
  const first = parseDateKey(start);
  return Array.from({ length: count }, (_, index) =>
    dateKey(addDays(first, index)),
  );
}

export function createPlanDay(
  date: string,
  target?: NutritionTargets,
): PlanDay {
  parseDateKey(date);
  return { date, meals: [], ...(target && { target }) };
}

export function createPlanMeal(kind: PlanMealKind): PlanMeal {
  const { title, time } = planMealKinds[kind];
  return { id: newId(), kind, title, time, items: [] };
}

export function planItemFromProduct(
  product: FoodProduct,
  amount: number,
  unit: FoodUnit,
  date: string,
  kind: PlanMealKind,
): PlanItem {
  return {
    entry: makeEntry(product, amount, unit, planMealKinds[kind].diary, date),
    locked: false,
  };
}

export function planItemFromRecipe(
  recipe: Recipe,
  amount: number,
  date: string,
  kind: PlanMealKind,
): PlanItem {
  const nutrition = validateRecipe(recipe);
  if (!nutrition.complete) throw new Error('Уточните состав и КБЖУ рецепта.');
  const snapshot: RecipeDiaryEntry['recipe'] = {
    total: nutrition.total,
    servings: recipe.servings,
    cookedWeightGrams: recipe.cookedWeightGrams,
    ingredients: ingredientQuantities(recipe.ingredients).map(
      ({ id, grams }) => ({ id, grams }),
    ),
  };
  return {
    entry: makeRecipeEntry(
      { id: recipe.id, name: recipe.name },
      snapshot,
      amount,
      'serving',
      planMealKinds[kind].diary,
      date,
      newId(),
    ),
    locked: false,
  };
}

function resizeEntry(
  entry: FoodDiaryEntry,
  amount: number,
  unit: FoodUnit,
): FoodDiaryEntry {
  if (!entry.recipe) {
    const resized = makeEntry(
      entry.product,
      amount,
      unit,
      entry.meal,
      entry.date,
    );
    return { ...resized, id: entry.id, createdAt: entry.createdAt };
  }
  if (unit !== 'g' && unit !== 'serving')
    throw new Error('Выберите порции или граммы.');
  return {
    ...entry,
    amount,
    unit,
    grams: recipePortion(entry.recipe, amount, unit).grams,
  };
}

export function resizePlanItem(
  item: PlanItem,
  amount: number,
  unit: FoodUnit,
): PlanItem {
  return { ...item, entry: resizeEntry(item.entry, amount, unit) };
}

export function copyMeals(meals: readonly PlanMeal[], date: string) {
  parseDateKey(date);
  return meals.map((meal) => ({
    ...meal,
    id: newId(),
    items: meal.items.map((item) => ({
      ...item,
      entry: {
        ...item.entry,
        date,
        id: newId(),
        createdAt: new Date().toISOString(),
      },
    })),
  }));
}

function requireCurrent(state: FoodState, date: string, expected?: PlanDay) {
  if (
    JSON.stringify(readPlanner(state).days[date]) !== JSON.stringify(expected)
  )
    throw new Error('План на эту дату изменился. Откройте актуальный план.');
}

export function savePlanDays(
  state: FoodState,
  days: readonly PlanDay[],
  expected: Readonly<Record<string, PlanDay>> = {},
  generation?: GenerationSettings,
): FoodState {
  const planner = readPlanner(state);
  const next = { ...planner.days };
  for (const day of days) {
    requireCurrent(state, day.date, expected[day.date]);
    const entries = day.meals.flatMap((meal) =>
      meal.items.map((item) => item.entry),
    );
    if (generation && expected[day.date]) {
      const retained = new Set(entries.map((entry) => entry.id));
      const previous = expected[day.date].meals.flatMap((meal) => meal.items);
      const consumed = new Set(state.entries.map((entry) => entry.id));
      if (
        previous.some(
          ({ entry, locked }) =>
            (locked || consumed.has(entry.id)) && !retained.has(entry.id),
        )
      )
        throw new Error(
          'Отметки дневника изменились. Повторите подбор рациона.',
        );
    }
    checkDayNutrition(entries, day.date);
    next[day.date] = day;
  }
  return {
    ...state,
    planner: { ...planner, days: next, ...(generation && { generation }) },
  };
}

export function removePlanDay(state: FoodState, day: PlanDay): FoodState {
  requireCurrent(state, day.date, day);
  const planner = readPlanner(state);
  const days = { ...planner.days };
  delete days[day.date];
  return { ...state, planner: { ...planner, days } };
}

export function savePlanTemplate(
  state: FoodState,
  template: PlanTemplate,
): FoodState {
  const planner = readPlanner(state);
  if (
    !template.name.trim() ||
    !template.meals.some((meal) => meal.items.length)
  )
    throw new Error('Укажите название и добавьте хотя бы одно блюдо.');
  const existing = planner.templates.find((row) => row.id === template.id);
  const templates = existing
    ? planner.templates.map((row) => (row.id === template.id ? template : row))
    : [...planner.templates, template];
  return { ...state, planner: { ...planner, templates } };
}

export function removePlanTemplate(state: FoodState, id: string): FoodState {
  const planner = readPlanner(state);
  return {
    ...state,
    planner: {
      ...planner,
      templates: planner.templates.filter((row) => row.id !== id),
    },
  };
}

export function markPlanMeal(
  state: FoodState,
  day: PlanDay,
  meal: PlanMeal,
  actual?: PlanItem,
): FoodState {
  requireCurrent(state, day.date, day);
  const current = day.meals.find((row) => row.id === meal.id);
  if (!current) throw new Error('Приём пищи удалён.');
  const marked = new Set(state.entries.map((entry) => entry.id));
  const items = current.items.filter(
    (item) => !actual || item.entry.id === actual.entry.id,
  );
  if (actual && items.length === 0) throw new Error('Блюдо удалено из плана.');
  const next = items.reduce((result, { entry }) => {
    if (marked.has(entry.id)) return result;
    const eaten = actual
      ? resizeEntry(entry, actual.entry.amount, actual.entry.unit)
      : entry;
    return addEntry(result, {
      ...eaten,
      meal: planMealKinds[current.kind].diary,
      createdAt: new Date().toISOString(),
    });
  }, state);
  checkDayNutrition(next.entries, day.date);
  return next;
}

export function undoPlanItem(
  state: FoodState,
  id: string,
  expected?: FoodDiaryEntry,
): FoodState {
  if (
    !Object.values(readPlanner(state).days).some((day) =>
      day.meals.some((meal) => meal.items.some(({ entry }) => entry.id === id)),
    )
  )
    throw new Error('Связанная позиция удалена из плана.');
  return removeEntry(state, id, expected);
}

export function plannedNutrition(meals: readonly PlanMeal[]): NutritionTargets {
  return meals.reduce(
    (totals, meal) =>
      meal.items.reduce(
        (sum, item) => addNutrition(sum, entryNutrition(item.entry)),
        totals,
      ),
    zeroNutrition,
  );
}

export function mealProgress(
  meal: PlanMeal,
  logged: Pick<ReadonlySet<string>, 'has'>,
) {
  const total = meal.items.length;
  const count = meal.items.filter(({ entry }) => logged.has(entry.id)).length;
  return { count, total, completed: total > 0 && count === total };
}

export function planStats(
  day: PlanDay,
  entries: readonly FoodDiaryEntry[],
  fallback?: NutritionTargets,
) {
  const logged = new Set(entries.map((entry) => entry.id));
  const meals = day.meals.map((meal) => mealProgress(meal, logged));
  const count = meals.reduce((sum, meal) => sum + meal.count, 0);
  const total = meals.reduce((sum, meal) => sum + Math.max(1, meal.total), 0);
  const planned = plannedNutrition(day.meals);
  const target = day.target ?? fallback;
  const delta = target
    ? {
        calories: planned.calories - target.calories,
        protein: planned.protein - target.protein,
        fat: planned.fat - target.fat,
        carbs: planned.carbs - target.carbs,
      }
    : undefined;
  return {
    planned,
    target,
    delta,
    actual: sumEntries(entries, day.date),
    completed: total > 0 && count === total,
    percent: total ? Math.round((100 * count) / total) : 0,
  };
}

export function replacePlanMeal(day: PlanDay, meal: PlanMeal): PlanDay {
  const found = day.meals.some((row) => row.id === meal.id);
  return {
    ...day,
    meals: found
      ? day.meals.map((row) => (row.id === meal.id ? meal : row))
      : [...day.meals, meal],
  };
}
