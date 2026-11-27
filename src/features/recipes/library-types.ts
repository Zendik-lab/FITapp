import type { Recipe, RecipeCategory } from './model';

export interface LibraryRecipeData {
  id: string;
  name: string;
  description: string;
  searchNames?: readonly string[];
  category: RecipeCategory;
  tags: readonly string[];
  ingredients: readonly (readonly [
    productNameOrId: string,
    grams: number,
    displayName?: string,
    sourceQuantity?: string,
  ])[];
  servings: number;
  prep?: number;
  cook?: number;
  difficulty?: NonNullable<Recipe['metadata']>['difficulty'];
  cuisine?: string;
  steps: readonly string[];
  weight?: number;
  source?: string;
  seasoningNote?: string;
}
