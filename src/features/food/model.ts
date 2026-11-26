import type { NutritionTargets } from '@/features/nutrition/engine';

export const meals = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекусы',
} as const;
export type MealType = keyof typeof meals;
export type FoodUnit = 'g' | 'ml' | 'piece' | 'serving';
export const unitLabels: Record<FoodUnit, string> = {
  g: 'г',
  ml: 'мл',
  piece: 'шт.',
  serving: 'порция',
};
export const categories = [
  'Мясо и птица',
  'Рыба',
  'Яйца',
  'Молочные продукты',
  'Крупы',
  'Макаронные изделия',
  'Хлебобулочные изделия',
  'Овощи',
  'Фрукты',
  'Орехи',
  'Масла',
  'Напитки',
  'Сладости',
  'Спортивное питание',
  'Готовые продукты',
] as const;
export interface FoodProduct {
  id: string;
  name: string;
  category: string;
  brand?: string;
  barcode?: string;
  per100: NutritionTargets;
  source: string;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
  gramsPerMl?: number;
  pieceGrams?: number;
  servingGrams?: number;
}
export interface FoodDiaryEntry {
  id: string;
  date: string;
  meal: MealType;
  product: FoodProduct;
  amount: number;
  unit: FoodUnit;
  grams: number;
  createdAt: string;
}
export interface FavoriteFood {
  productId: string;
}
export interface RecentFood {
  productId: string;
  usedAt: string;
}
export interface FoodState {
  version: 1;
  products: FoodProduct[];
  entries: FoodDiaryEntry[];
  favorites: FavoriteFood[];
  recent: RecentFood[];
}
export const emptyFoodState = (): FoodState => ({
  version: 1,
  products: [],
  entries: [],
  favorites: [],
  recent: [],
});
