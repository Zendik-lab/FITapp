import type { NutritionTargets } from './engine';

export interface DailyNutrition {
  calorieGoal: number;
  calories: number;
  macros: readonly {
    label: string;
    value: number;
    goal: number;
    tone: 'protein' | 'fat' | 'carbs';
  }[];
}

/** Shared target/consumption display boundary; the diary supplies the selected day's totals. */
export function getDailyNutrition(
  targets: NutritionTargets,
  consumed: NutritionTargets = { calories: 0, protein: 0, fat: 0, carbs: 0 },
): DailyNutrition {
  return {
    calorieGoal: targets.calories,
    calories: consumed.calories,
    macros: [
      {
        label: 'Белки',
        value: consumed.protein,
        goal: targets.protein,
        tone: 'protein' as const,
      },
      {
        label: 'Жиры',
        value: consumed.fat,
        goal: targets.fat,
        tone: 'fat' as const,
      },
      {
        label: 'Углеводы',
        value: consumed.carbs,
        goal: targets.carbs,
        tone: 'carbs' as const,
      },
    ],
  };
}
