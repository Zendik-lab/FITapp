import type { FoodDiaryEntry, MealType } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';

export const planMealKinds = {
  breakfast: { title: 'Завтрак', time: '08:00', diary: 'breakfast' },
  secondBreakfast: { title: 'Второй завтрак', time: '10:30', diary: 'snack' },
  lunch: { title: 'Обед', time: '13:00', diary: 'lunch' },
  afternoon: { title: 'Полдник', time: '16:00', diary: 'snack' },
  dinner: { title: 'Ужин', time: '19:00', diary: 'dinner' },
  snack: { title: 'Дополнительный перекус', time: '21:00', diary: 'snack' },
  preWorkout: { title: 'Питание до тренировки', time: '16:30', diary: 'snack' },
  postWorkout: {
    title: 'Питание после тренировки',
    time: '18:00',
    diary: 'snack',
  },
} as const satisfies Record<
  string,
  { title: string; time: string; diary: MealType }
>;

export type PlanMealKind = keyof typeof planMealKinds;

export const generationModes = {
  balanced: 'Сбалансированный',
  quick: 'Быстрое приготовление',
  simple: 'Простые блюда',
  protein: 'Высокобелковый',
  variety: 'Максимум разнообразия',
  budget: 'Бюджетный',
} as const;

export interface GenerationSettings {
  days: number;
  meals: number;
  mode: keyof typeof generationModes;
  maxMinutes: number;
  excludes: string;
  allergies: string;
  preferences: string;
  diet: 'any' | 'vegetarian' | 'vegan';
  repeats: boolean;
  sport: boolean;
  stockOnly: boolean;
}

export const defaultGeneration: GenerationSettings = {
  days: 7,
  meals: 4,
  mode: 'balanced',
  maxMinutes: 0,
  excludes: '',
  allergies: '',
  preferences: '',
  diet: 'any',
  repeats: true,
  sport: false,
  stockOnly: false,
};

export interface PlanItem {
  entry: FoodDiaryEntry;
  locked: boolean;
}

export interface PlanMeal {
  id: string;
  kind: PlanMealKind;
  title: string;
  time: string;
  items: PlanItem[];
}

export interface PlanDay {
  date: string;
  meals: PlanMeal[];
  target?: NutritionTargets;
}

export interface PlanTemplate {
  id: string;
  name: string;
  meals: PlanMeal[];
}

export interface PlannerState {
  version: 1;
  days: Record<string, PlanDay>;
  templates: PlanTemplate[];
  generation?: GenerationSettings;
}

export const emptyPlanner: PlannerState = {
  version: 1,
  days: {},
  templates: [],
};
