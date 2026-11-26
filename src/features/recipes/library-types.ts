import type { Recipe, RecipeCategory } from './model';

export interface LibraryRecipeData {
  id: string;
  name: string;
  description: string;
  category: RecipeCategory;
  tags: readonly string[];
  ingredients: readonly (readonly [productNameOrId: string, grams: number])[];
  servings: number;
  prep: number;
  cook: number;
  difficulty: NonNullable<Recipe['metadata']>['difficulty'];
  steps: readonly string[];
  weight?: number;
}
