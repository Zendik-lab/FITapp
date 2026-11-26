import type { NutritionTargets } from '@/features/nutrition/engine';
import type { Recipe, RecipeNutritionSnapshot } from '@/features/recipes/model';
import type { FoodUnit } from './units';

export { unitLabels, type FoodUnit } from './units';

export const meals = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекусы',
} as const;
export type MealType = keyof typeof meals;
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
interface EntryBase {
  id: string;
  date: string;
  meal: MealType;
  amount: number;
  createdAt: string;
}
export type ProductDiaryEntry = EntryBase & {
  product: FoodProduct;
  unit: FoodUnit;
  grams: number;
  recipe?: undefined;
};
export type RecipeDiaryEntry = EntryBase & {
  product: Pick<FoodProduct, 'id' | 'name'>;
  unit: 'g' | 'serving';
  grams: number | null;
  recipe: RecipeNutritionSnapshot;
};
export type FoodDiaryEntry = ProductDiaryEntry | RecipeDiaryEntry;
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
  recipes: Recipe[];
}
export const emptyFoodState = (): FoodState => ({
  version: 1,
  products: [],
  entries: [],
  favorites: [],
  recent: [],
  recipes: [],
});
