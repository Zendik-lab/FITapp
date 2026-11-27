import {
  addNutrition,
  nutrientKeys,
  portion,
  scaleNutrition,
} from '@/features/food/domain';
import { searchTerms, wordScore } from '@/features/food/local-search';
import type { FoodProduct, FoodState, MealType } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';
import type { UserProfile } from '@/features/profile/model';
import type { IndexedRecipe } from '@/features/recipes/recipe-search';

type MealPart = {
  id: string;
  name: string;
  amount: number;
} & ({ kind: 'recipe' } | { kind: 'product'; unit: 'g' | 'ml' });
export interface MealSuggestion {
  parts: MealPart[];
  values: NutritionTargets;
  reason: string;
  score: number;
}

export function mealAt(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export function remainingTargets(
  targets: NutritionTargets,
  totals: NutritionTargets,
): NutritionTargets {
  return {
    calories: Math.max(0, targets.calories - totals.calories),
    protein: Math.max(0, targets.protein - totals.protein),
    fat: Math.max(0, targets.fat - totals.fat),
    carbs: Math.max(0, targets.carbs - totals.carbs),
  };
}

export function suggestMeals(
  remaining: NutritionTargets,
  recipes: readonly IndexedRecipe[],
  products: readonly FoodProduct[],
  state: Pick<FoodState, 'favorites' | 'entries'>,
  nutrition: UserProfile['nutrition'],
  goal: UserProfile['goals']['kind'],
  hour: number,
): MealSuggestion[] {
  // Free-text allergies and restrictions cannot be reliably checked against
  // ingredient names or catalog nutrition alone.
  if (
    nutrition.allergies.trim() ||
    nutrition.restrictions.trim() ||
    remaining.calories < 20
  )
    return [];
  const excluded = searchTerms(nutrition.excludedFoods);
  const preferences = searchTerms(nutrition.diet);
  const matches = (terms: string[], words: readonly string[]) =>
    terms.some((term) => wordScore(term, words) >= 2);
  const diet = nutrition.diet.trim();
  const vegetarian = /^вегетариан/i.test(diet);
  const vegan = /^веган/i.test(diet);
  if (
    diet &&
    !vegetarian &&
    !vegan &&
    !/^(обычное|смешанное|всеядное)( питание)?$/i.test(diet)
  )
    return [];
  const animal =
    /мясо|рыба|птица|морепродукт|яйца|молочн|мед|желатин|говя|свини|курин|лосос|тунец/;
  const flesh =
    /мясо|рыба|птица|морепродукт|желатин|говя|свини|курин|лосос|тунец/;
  function compatible(words: readonly string[]) {
    return (
      !matches(excluded, words) &&
      (!(vegetarian || vegan) ||
        !words.some((word) => (vegan ? animal : flesh).test(word)))
    );
  }
  const favorite = new Set(state.favorites.map((item) => item.productId));
  const uses = new Map<string, number>();
  for (const { product } of state.entries)
    uses.set(product.id, (uses.get(product.id) ?? 0) + 1);
  const rank = (values: NutritionTargets) =>
    nutrientKeys.reduce((score, key) => {
      const delta =
        (values[key] - remaining[key]) /
        Math.max(remaining[key], key === 'calories' ? 100 : 10);
      const weight =
        key === 'calories' ? 2 : key === 'protein' && goal === 'gain' ? 1.5 : 1;
      return score + Math.abs(delta) * weight * (delta > 0 ? 1.4 : 1);
    }, 0);
  const options: MealSuggestion[] = [];
  const flags = {
    breakfast: 'Завтраки',
    lunch: 'Обеды',
    dinner: 'Ужины',
    snack: 'Перекусы',
  };
  for (const row of recipes) {
    if (!compatible(row.words) || row.nutrition.calories <= 0) continue;
    const amount = Math.max(
      0.5,
      Math.min(
        2,
        Math.round((remaining.calories / row.nutrition.calories) * 2) / 2,
      ),
    );
    const values = scaleNutrition(row.nutrition, amount);
    const bonus =
      (row.favorite ? 0.15 : 0) +
      (row.recipe.category === flags[mealAt(hour)] ? 0.07 : 0) +
      Math.min(row.usage, 6) * 0.01 +
      (row.time !== undefined && row.time <= 20 ? 0.05 : 0);
    options.push({
      parts: [
        { id: row.recipe.id, name: row.recipe.name, amount, kind: 'recipe' },
      ],
      values,
      score: rank(values) - bonus,
      reason: [
        row.favorite && 'В избранном',
        row.time && `${row.time} мин`,
        'Подбор порции по остатку КБЖУ',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  const productOptions: MealSuggestion[] = [];
  for (const product of products) {
    if (
      product.per100.calories <= 0 ||
      ![
        'Молочные продукты',
        'Фрукты',
        'Орехи',
        'Хлебобулочные изделия',
      ].includes(product.category) ||
      /сухой|порошок|сырой|дрожжи|мука/.test(
        product.name.toLocaleLowerCase('ru'),
      )
    )
      continue;
    const words = searchTerms(
      [product.name, product.category, ...(product.aliases ?? [])].join(' '),
    );
    if (!compatible(words)) continue;
    const amount = Math.max(
      15,
      Math.min(
        product.category === 'Орехи' ? 50 : 250,
        Math.round(
          ((remaining.calories * 0.45) / product.per100.calories) * 20,
        ) * 5,
      ),
    );
    const unit = product.baseUnit ?? 'g';
    const values = portion(product, amount, unit);
    productOptions.push({
      parts: [
        { id: product.id, name: product.name, amount, kind: 'product', unit },
      ],
      values,
      score:
        rank(values) -
        (favorite.has(product.id) ? 0.15 : 0) -
        Math.min(uses.get(product.id) ?? 0, 6) * 0.01 -
        (matches(preferences, words) ? 0.04 : 0),
      reason: product.approximate
        ? 'Количество подобрано по справочным КБЖУ продукта'
        : 'Количество подобрано под остаток КБЖУ',
    });
  }
  const top = productOptions.sort((a, b) => a.score - b.score).slice(0, 16);
  const combinations = top.flatMap((a, index) =>
    top.slice(index + 1).map((b) => {
      const values = addNutrition(a.values, b.values);
      return {
        parts: [...a.parts, ...b.parts],
        values,
        score: rank(values),
        reason:
          'Сумма КБЖУ двух порций по данным каталога сопоставлена с остатком дня',
      };
    }),
  );
  const bestRecipes = options.sort((a, b) => a.score - b.score).slice(0, 4);
  const bestCombo = combinations.sort((a, b) => a.score - b.score)[0];
  return [...bestRecipes, ...(bestCombo ? [bestCombo] : top.slice(0, 1))].sort(
    (a, b) => a.score - b.score,
  );
}
