import {
  addNutrition,
  scaleNutrition,
  validNutrition,
  zeroNutrition,
} from '@/features/food/domain';
import type { FoodProduct, FoodState } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';
import { recipeIngredientKey } from '@/features/recipes/recipe-search';
import {
  candidateRecipe,
  generationCatalog,
  roleOf,
  type PlanCandidate,
  type Requirement,
} from './generation-catalog';
import type {
  GenerationSettings,
  PlanDay,
  PlanItem,
  PlanMeal,
  PlanMealKind,
} from './model';
import {
  createPlanDay,
  createPlanMeal,
  planItemFromProduct,
  planItemFromRecipe,
  plannedNutrition,
} from './operations';
import { validGeneration } from './validation';

const nutrients = ['calories', 'protein', 'fat', 'carbs'] as const;
type Selection = { candidate: PlanCandidate; amount: number };
type Slot = { meal: PlanMeal; fixed: boolean; selections: Selection[] };

export interface GenerateOptions {
  dates: readonly string[];
  products: readonly FoodProduct[];
  state: FoodState;
  settings: GenerationSettings;
  target: NutritionTargets;
  existing?: Readonly<Record<string, PlanDay>>;
  mealId?: string;
  lookupInstalled?: boolean;
  yieldControl?: () => Promise<void>;
  onProgress?: (done: number) => void;
}

const layouts: readonly (readonly PlanMealKind[])[] = [
  ['lunch'],
  ['breakfast', 'dinner'],
  ['breakfast', 'lunch', 'dinner'],
  ['breakfast', 'lunch', 'afternoon', 'dinner'],
  ['breakfast', 'secondBreakfast', 'lunch', 'afternoon', 'dinner'],
  ['breakfast', 'secondBreakfast', 'lunch', 'afternoon', 'dinner', 'snack'],
  [
    'breakfast',
    'secondBreakfast',
    'lunch',
    'afternoon',
    'preWorkout',
    'dinner',
    'snack',
  ],
  [
    'breakfast',
    'secondBreakfast',
    'lunch',
    'afternoon',
    'preWorkout',
    'postWorkout',
    'dinner',
    'snack',
  ],
];

function weightOf(kind: PlanMealKind) {
  const role = roleOf(kind);
  return role === 'main' ? 1.4 : role === 'breakfast' ? 1.15 : 0.72;
}

function currentRequirements(item: PlanItem): Requirement[] {
  const { entry } = item;
  if (!entry.recipe)
    return [
      { id: recipeIngredientKey(entry.product.id), amount: entry.grams ?? 0 },
    ];
  const ratio =
    entry.unit === 'serving'
      ? entry.amount / entry.recipe.servings
      : entry.amount / (entry.recipe.cookedWeightGrams ?? 1);
  return (entry.recipe.ingredients ?? []).map(({ id, grams }) => ({
    id: recipeIngredientKey(id),
    amount: grams * ratio,
  }));
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function generatePlans({
  dates,
  products,
  state,
  settings,
  target,
  existing = {},
  mealId,
  lookupInstalled = false,
  yieldControl = pause,
  onProgress,
}: GenerateOptions): Promise<PlanDay[]> {
  if (
    !validGeneration(settings) ||
    !dates.length ||
    dates.length > 14 ||
    new Set(dates).size !== dates.length
  )
    throw new Error('Проверьте даты и настройки генерации.');
  if (!validNutrition(target) || target.calories <= 0)
    throw new Error('Сначала задайте цели калорий и БЖУ.');
  if (
    mealId &&
    (dates.length !== 1 ||
      !existing[dates[0]]?.meals.some((meal) => meal.id === mealId))
  )
    throw new Error('Приём пищи изменился или был удалён.');

  await yieldControl();
  const candidates = await generationCatalog(
    products,
    state,
    settings,
    yieldControl,
    lookupInstalled,
  );
  const logged = new Set(state.entries.map((entry) => entry.id));
  const stock = new Map<string, number>();
  for (const item of state.pantry?.stock ?? []) {
    const id = recipeIngredientKey(item.id);
    stock.set(id, (stock.get(id) ?? 0) + item.grams);
  }
  const uses = new Map<string, number>();
  const rolePools = new Map(
    (['main', 'breakfast', 'snack'] as const).map(
      (role) =>
        [
          role,
          candidates.filter(
            (candidate) =>
              candidate.roles.includes(role) ||
              (role !== 'main' && candidate.group === 'nuts'),
          ),
        ] as const,
    ),
  );
  const labels = new Map(candidates.map(({ id, label }) => [id, label]));
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const adjustStock = (
    requirements: readonly Requirement[],
    amount: number,
  ) => {
    if (!settings.stockOnly) return;
    for (const row of requirements)
      stock.set(row.id, (stock.get(row.id) ?? 0) - amount * row.amount);
  };
  const changeUse = (label: string, factor: number) =>
    uses.set(label, (uses.get(label) ?? 0) + factor);
  const weight = {
    calories: 6 / target.calories ** 2,
    protein:
      (settings.mode === 'protein' ? 4 : 1.7) /
      Math.max(25, target.protein) ** 2,
    fat: 0.9 / Math.max(20, target.fat) ** 2,
    carbs: 0.85 / Math.max(35, target.carbs) ** 2,
  };
  function loss(
    goal: NutritionTargets,
    sum: NutritionTargets,
    candidate?: PlanCandidate,
    amount = 0,
  ) {
    let score = 0;
    for (const key of nutrients)
      score +=
        weight[key] *
        (goal[key] - sum[key] - (candidate?.nutrition[key] ?? 0) * amount) ** 2;
    return score;
  }
  function bestAmount(
    candidate: PlanCandidate,
    goal: NutritionTargets,
    sum: NutritionTargets,
  ) {
    const { step, min, nutrition, requirements } = candidate;
    let max = candidate.max;
    if (settings.stockOnly) {
      for (const row of requirements)
        max = Math.min(max, (stock.get(row.id) ?? 0) / row.amount);
    }
    max = Math.floor((max + 1e-8) / step) * step;
    if (max < min) return 0;
    let weightedDot = 0;
    let norm = 0;
    for (const key of nutrients) {
      weightedDot += weight[key] * (goal[key] - sum[key]) * nutrition[key];
      norm += weight[key] * nutrition[key] ** 2;
    }
    return Math.min(
      max,
      Math.max(min, Math.round(weightedDot / norm / step) * step),
    );
  }
  function addSelection(slot: Slot, candidate: PlanCandidate, amount: number) {
    slot.selections.push({ candidate, amount });
    adjustStock(candidate.requirements, amount);
    changeUse(candidate.label, 1);
  }

  const schedule = dates.map((date) => {
    const old = existing[date];
    const saved =
      old?.meals.map((meal): Slot => {
        const fixed = !!mealId && meal.id !== mealId;
        const items = fixed
          ? meal.items
          : meal.items.filter(
              (item) => item.locked || logged.has(item.entry.id),
            );
        return { meal: { ...meal, items }, fixed, selections: [] };
      }) ?? [];
    const layoutsForDay = layouts[Math.min(settings.meals, layouts.length) - 1];
    const slots = mealId
      ? saved
      : saved.filter(
          (slot, index) => index < settings.meals || slot.meal.items.length > 0,
        );
    for (let index = slots.length; !mealId && index < settings.meals; index++) {
      const kind = layoutsForDay[index] ?? 'snack';
      const meal = createPlanMeal(kind);
      slots.push({ meal, fixed: false, selections: [] });
    }
    for (const { meal } of slots) {
      for (const item of meal.items) {
        adjustStock(currentRequirements(item), 1);
        changeUse(
          labels.get(item.entry.product.id) ?? item.entry.product.name,
          1,
        );
      }
    }
    return { date, old, slots };
  });

  const output: PlanDay[] = [];
  for (const { date, old, slots } of schedule) {
    const editable = slots.filter((slot) => !slot.fixed);
    const todayUsed = new Set(
      slots.flatMap(({ meal }) =>
        meal.items.map(
          ({ entry }) => labels.get(entry.product.id) ?? entry.product.name,
        ),
      ),
    );
    const prior = new Set(
      old?.meals
        .filter((meal) => !mealId || meal.id === mealId)
        .flatMap((meal) => meal.items.map(({ entry }) => entry.product.id)),
    );
    const sumWeights = editable.reduce(
      (sum, slot) => sum + weightOf(slot.meal.kind),
      0,
    );
    let total = plannedNutrition(slots.map(({ meal }) => meal));
    const fixedNutrition = plannedNutrition(
      slots.filter(({ fixed }) => fixed).map(({ meal }) => meal),
    );

    function choose(
      slot: Slot,
      goal: NutritionTargets,
      base: NutritionTargets,
      refinement: boolean,
    ) {
      const { meal, selections } = slot;
      const role = roleOf(meal.kind);
      const pool = rolePools.get(role === 'side' ? 'main' : role) ?? [];
      const companions = [
        ...selections.map(({ candidate }) => candidate),
        ...meal.items.flatMap(({ entry }) => byId.get(entry.product.id) ?? []),
      ];
      const groups = new Set(companions.map(({ group }) => group));
      const pairs = new Set(companions.map(({ pair }) => pair));
      const occupied = meal.items.length + selections.length;
      let selected: Selection | undefined;
      let best = loss(goal, base) - (refinement ? 0.00005 : 0);
      for (const candidate of pool) {
        const used = uses.get(candidate.label) ?? 0;
        if (!settings.repeats && used > 0) continue;
        if (
          selections.some((choice) => choice.candidate.id === candidate.id) ||
          meal.items.some(({ entry }) => entry.product.id === candidate.id)
        )
          continue;
        if (occupied) {
          if (
            !candidate.product ||
            groups.has(candidate.group) ||
            (candidate.pair === 'sweet' && pairs.has('savory')) ||
            (candidate.pair === 'savory' && pairs.has('sweet'))
          )
            continue;
        } else if (
          candidate.group === 'vegetable' ||
          candidate.group === 'nuts'
        )
          continue;
        const amount = bestAmount(candidate, goal, base);
        if (!amount) continue;
        let score = loss(goal, base, candidate, amount);
        if (!refinement) {
          const share = weightOf(meal.kind) / Math.max(1, sumWeights);
          score -= candidate.preferred * share;
          if (!occupied && !candidate.product) score -= 0.016 * share;
          if (settings.mode === 'quick')
            score += (candidate.time ?? 90) * 0.00016 * share;
          if (settings.mode === 'simple')
            score += candidate.complexity * 0.0019 * share;
          if (settings.mode === 'budget')
            score += Math.log1p((candidate.cost ?? 0) * amount) * 0.009 * share;
        } else if (settings.mode === 'budget') {
          score += Math.log1p((candidate.cost ?? 0) * amount) * 0.0003;
        }
        score += used * (settings.mode === 'variety' ? 0.013 : 0.003);
        if (todayUsed.has(candidate.label)) score += 0.035;
        if (prior.has(candidate.id)) score += refinement ? 0.0015 : 0.012;
        if (score < best) {
          best = score;
          selected = { candidate, amount };
        }
      }
      return selected;
    }

    // First choose a meal-sized anchor and a compatible side.
    for (const slot of editable) {
      const ratio = weightOf(slot.meal.kind) / sumWeights;
      const goal = { ...zeroNutrition };
      for (const key of nutrients)
        goal[key] = Math.max(0, target[key] - fixedNutrition[key]) * ratio;
      let subtotal = plannedNutrition([slot.meal]);
      for (let step = 0; step < 2; step++) {
        const choice = choose(slot, goal, subtotal, false);
        if (!choice) break;
        addSelection(slot, choice.candidate, choice.amount);
        todayUsed.add(choice.candidate.label);
        const values = scaleNutrition(
          choice.candidate.nutrition,
          choice.amount,
        );
        subtotal = addNutrition(subtotal, values);
        total = addNutrition(total, values);
      }
      await yieldControl();
    }

    // Fit the whole day's goals by sizing selected items and adding small sides.
    for (let pass = 0; pass < 4; pass++) {
      for (const slot of editable) {
        for (const choice of slot.selections) {
          adjustStock(choice.candidate.requirements, -choice.amount);
          const base = { ...total };
          for (const key of nutrients)
            base[key] -= choice.candidate.nutrition[key] * choice.amount;
          const amount = bestAmount(choice.candidate, target, base);
          if (
            amount &&
            loss(target, base, choice.candidate, amount) < loss(target, total)
          )
            choice.amount = amount;
          adjustStock(choice.candidate.requirements, choice.amount);
          total = addNutrition(
            base,
            scaleNutrition(choice.candidate.nutrition, choice.amount),
          );
        }
        if (
          pass < 2 &&
          slot.meal.items.length + slot.selections.length < 3 &&
          total.calories < target.calories * 0.97
        ) {
          const extra = choose(slot, target, total, true);
          if (extra) {
            const mealCalories =
              plannedNutrition([slot.meal]).calories +
              slot.selections.reduce(
                (sum, choice) =>
                  sum + choice.candidate.nutrition.calories * choice.amount,
                0,
              );
            if (
              mealCalories +
                extra.candidate.nutrition.calories * extra.amount <=
              Math.max(
                1100,
                (target.calories / Math.max(1, editable.length)) * 1.3,
              )
            ) {
              addSelection(slot, extra.candidate, extra.amount);
              todayUsed.add(extra.candidate.label);
              total = addNutrition(
                total,
                scaleNutrition(extra.candidate.nutrition, extra.amount),
              );
            }
          }
        }
      }
      await yieldControl();
    }

    const meals = slots.map(({ meal, selections }) => ({
      ...meal,
      items: [
        ...meal.items,
        ...selections.map(({ candidate, amount }) => {
          if (candidate.product)
            return planItemFromProduct(
              candidate.product,
              amount,
              candidate.product.baseUnit ?? 'g',
              date,
              meal.kind,
            );
          const recipe = candidateRecipe(candidate, state.recipes);
          if (!recipe) throw new Error('Рецепт из каталога недоступен.');
          return planItemFromRecipe(recipe, amount, date, meal.kind);
        }),
      ],
    }));
    output.push({ ...createPlanDay(date, target), meals });
    onProgress?.(output.length);
    await yieldControl();
  }
  return output;
}
