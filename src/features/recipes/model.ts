import type { FoodUnit } from '@/features/food/units';
import type { NutritionTargets } from '@/features/nutrition/engine';

export const recipeCategories = [
  'Завтраки',
  'Основные блюда',
  'Салаты',
  'Супы',
  'Перекусы',
  'Десерты',
  'Напитки',
  'Протеиновые коктейли',
  'Обеды',
  'Ужины',
  'Мясные блюда',
  'Рыбные блюда',
  'Гарниры',
  'Паста',
  'Выпечка',
  'Высококалорийные коктейли',
  'Блюда без приготовления',
  'Другое',
] as const;
export type RecipeCategory = (typeof recipeCategories)[number];
export type IngredientUnit = FoodUnit | 'kg' | 'l';
export const extraUnitLabels = { kg: 'кг', l: 'л' } as const;

export interface RecipeIngredient {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: IngredientUnit;
  gramsPerUnit: number;
  normalizedQuantity: number;
  nutritionSnapshot: NutritionTargets;
}

export interface RecipeNutritionSnapshot {
  total: NutritionTargets;
  servings: number;
  cookedWeightGrams?: number;
}

export interface Recipe extends Omit<RecipeNutritionSnapshot, 'total'> {
  id: string;
  name: string;
  description?: string;
  category: RecipeCategory;
  preparationTime?: number;
  instructions?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
  metadata?: {
    prep: number;
    cook: number;
    difficulty: 'Простой' | 'Средний' | 'Сложный';
    tags: readonly string[];
    steps: readonly string[];
    sources: readonly string[];
  };
}
