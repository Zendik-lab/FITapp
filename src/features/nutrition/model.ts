import type { GoalKind, UserProfile } from '@/features/profile/model';
import { ageFromBirthDate } from '@/features/profile/validation';
import {
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculateMacros,
  calorieAdjustment,
  roundGrams,
  validateNutritionTargets,
  type GainMode,
  type Macros,
  type NutritionTargets,
} from './engine';

export type CalculationMode = 'auto' | 'manual';
export interface NutritionPreferences {
  gainMode: GainMode;
  calorieMode: CalculationMode;
  macroMode: CalculationMode;
  manualCalories: number | null;
  manualMacros: Macros | null;
}
export interface NutritionRecommendation {
  bmr: number;
  tdee: number;
  adjustment: number;
  calories: number;
  targets: NutritionTargets | null;
}
export interface NutritionSnapshot {
  version: 1;
  algorithmVersion: 'mifflin-1';
  calculatedAt: string;
  profileSignature: string;
  goal: GoalKind;
  surplus: number;
  recommendedCalories: number;
  preferences: NutritionPreferences;
  targets: NutritionTargets;
}
export interface NutritionResolution {
  recommendation: NutritionRecommendation | null;
  snapshot: NutritionSnapshot | null;
  issues: string[];
}

export function defaultPreferences(): NutritionPreferences {
  return {
    gainMode: 'standard',
    calorieMode: 'auto',
    macroMode: 'auto',
    manualCalories: null,
    manualMacros: null,
  };
}

export function resolveNutrition(
  profile: UserProfile | null,
  preferences: NutritionPreferences,
  now = new Date(),
): NutritionResolution {
  let recommendation: NutritionRecommendation | null = null;
  try {
    if (!profile)
      throw new Error('Заполните личные данные и параметры тела в профиле.');
    const age = ageFromBirthDate(profile.personal.birthDate, now);
    if (age === null)
      throw new Error('Укажите корректную дату рождения в профиле.');
    const bmr = calculateBMR({
      age,
      sex: profile.personal.sex,
      weightKg: profile.body.currentWeightKg,
      heightCm: profile.body.heightCm,
    });
    const tdee = calculateTDEE(bmr, profile.activity.level);
    const calories = calculateCalorieTarget(
      tdee,
      profile.goals.kind,
      preferences.gainMode,
    );
    recommendation = {
      bmr,
      tdee,
      adjustment: calorieAdjustment(profile.goals.kind, preferences.gainMode),
      calories,
      targets: null,
    };
    try {
      recommendation.targets = {
        calories,
        ...calculateMacros(profile.body.currentWeightKg, calories),
      };
    } catch {
      // Calorie recommendations still exist when default macros exceed them.
      // Resolve the chosen manual settings below; auto mode reports its error.
    }
    const targetCalories =
      preferences.calorieMode === 'manual'
        ? preferences.manualCalories
        : calories;
    if (targetCalories === null)
      throw new Error('Укажите ручную калорийность.');
    if (
      !Number.isFinite(targetCalories) ||
      targetCalories < 1 ||
      targetCalories > 20000
    )
      throw new Error('Калории: укажите число от 1 до 20000.');
    const roundedCalories = Math.round(targetCalories);
    const macros =
      preferences.macroMode === 'manual'
        ? preferences.manualMacros
        : calculateMacros(profile.body.currentWeightKg, roundedCalories);
    if (!macros) throw new Error('Укажите ручные значения БЖУ.');
    const targets = {
      calories: roundedCalories,
      protein: roundGrams(macros.protein),
      fat: roundGrams(macros.fat),
      carbs: roundGrams(macros.carbs),
    };
    // Validate original values too: tiny negative numbers must not become valid -0 after rounding.
    const issues = [
      ...new Set([
        ...validateNutritionTargets({
          calories: roundedCalories,
          ...macros,
        }),
        ...validateNutritionTargets(targets),
      ]),
    ];
    const signature = JSON.stringify([
      age,
      profile.personal.sex,
      profile.body.currentWeightKg,
      profile.body.heightCm,
      profile.activity.level,
      profile.goals.kind,
      preferences,
    ]);
    return {
      recommendation,
      issues,
      snapshot: {
        version: 1,
        algorithmVersion: 'mifflin-1',
        calculatedAt: now.toISOString(),
        profileSignature: signature,
        goal: profile.goals.kind,
        surplus: recommendation.adjustment,
        recommendedCalories: calories,
        preferences,
        targets,
      },
    };
  } catch (error) {
    return {
      recommendation,
      snapshot: null,
      issues: [
        error instanceof Error ? error.message : 'Проверьте данные профиля.',
      ],
    };
  }
}
