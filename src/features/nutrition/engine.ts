import type { ActivityLevel, GoalKind } from '@/features/profile/model';

export interface Macros {
  protein: number;
  fat: number;
  carbs: number;
}
export interface NutritionTargets extends Macros {
  calories: number;
}
export type GainMode = 'gentle' | 'standard' | 'accelerated';
export const activityFactors: Record<ActivityLevel, number> = {
  minimal: 1.2,
  low: 1.375,
  moderate: 1.55,
  high: 1.725,
  veryHigh: 1.9,
};
export const gainSurpluses: Record<GainMode, number> = {
  gentle: 200,
  standard: 350,
  accelerated: 500,
};
export const roundGrams = (value: number) => Math.round(value * 10) / 10;

function requireRange(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label}: укажите число от ${min} до ${max}.`);
}

export function calculateBMR(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: string;
}): number {
  requireRange(input.weightKg, 20, 400, 'Вес, кг');
  requireRange(input.heightCm, 80, 250, 'Рост, см');
  requireRange(input.age, 18, 120, 'Возраст (формула для взрослых)');
  if (!Number.isInteger(input.age))
    throw new Error('Укажите возраст в полных годах.');
  if (input.sex !== 'male' && input.sex !== 'female')
    throw new Error('Укажите в профиле пол для формулы BMR.');
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    (input.sex === 'male' ? 5 : -161);
  requireRange(bmr, 1, 10000, 'BMR: проверьте параметры профиля');
  return bmr;
}

export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  requireRange(bmr, 1, 10000, 'BMR');
  if (!Object.hasOwn(activityFactors, activity))
    throw new Error('Выберите уровень активности в профиле.');
  return bmr * activityFactors[activity];
}

export function calorieAdjustment(
  goal: GoalKind,
  mode: GainMode = 'standard',
): number {
  if (!Object.hasOwn(gainSurpluses, mode))
    throw new Error('Выберите режим набора массы.');
  if (goal === 'gain') return gainSurpluses[mode];
  if (goal === 'maintain') return 0;
  if (goal === 'lose') return -350;
  throw new Error('Выберите цель в профиле.');
}

export function calculateCalorieTarget(
  tdee: number,
  goal: GoalKind,
  mode: GainMode = 'standard',
): number {
  requireRange(tdee, 1, 19000, 'TDEE');
  const target = Math.round(tdee + calorieAdjustment(goal, mode));
  requireRange(target, 1, 20000, 'Целевая калорийность');
  return target;
}

export function calculateMacros(weightKg: number, calories: number): Macros {
  requireRange(weightKg, 20, 400, 'Вес, кг');
  requireRange(calories, 1, 20000, 'Калории');
  const protein = roundGrams(weightKg * 1.8);
  const fat = roundGrams(weightKg);
  const remaining = calories - protein * 4 - fat * 9;
  if (remaining < 0)
    throw new Error(
      'Калорий недостаточно для рекомендованных белков и жиров. Увеличьте калории или настройте БЖУ вручную.',
    );
  return { protein, fat, carbs: roundGrams(remaining / 4) };
}

export function calculateMacroCalories(macros: Macros): number {
  for (const key of ['protein', 'fat', 'carbs'] as const)
    requireRange(macros[key], 0, 5000, 'БЖУ, г');
  return macros.protein * 4 + macros.fat * 9 + macros.carbs * 4;
}

export function calculateMacroDistribution(macros: Macros): Macros {
  const energy = calculateMacroCalories(macros);
  if (energy === 0) return { protein: 0, fat: 0, carbs: 0 };
  // Allocate 1000 tenths by largest remainder: nonnegative and exactly 100%.
  const shares = [macros.protein * 4, macros.fat * 9, macros.carbs * 4].map(
    (value) => (value / energy) * 1000,
  );
  const tenths = shares.map(Math.floor);
  const order = [0, 1, 2].sort(
    (a, b) => shares[b] - tenths[b] - (shares[a] - tenths[a]),
  );
  const remaining = 1000 - tenths.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++) tenths[order[index]]++;
  return {
    protein: tenths[0] / 10,
    fat: tenths[1] / 10,
    carbs: tenths[2] / 10,
  };
}

export function validateNutritionTargets(targets: NutritionTargets): string[] {
  const issues: string[] = [];
  try {
    requireRange(targets.calories, 1, 20000, 'Калории');
    const energy = calculateMacroCalories(targets);
    if (Math.abs(energy - targets.calories) > 2)
      issues.push(
        `Энергия БЖУ (${Math.round(energy)} ккал) не совпадает с целью (${targets.calories} ккал). Допустимое расхождение — 2 ккал.`,
      );
  } catch (error) {
    issues.push(
      error instanceof Error ? error.message : 'Проверьте числовые значения.',
    );
  }
  return issues;
}
