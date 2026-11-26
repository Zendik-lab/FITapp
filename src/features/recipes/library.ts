import { builtinFoods } from '@/features/food/catalog';
import { validateRecipe } from './domain';
import { libraryData } from './library-data';
import type { LibraryRecipeData } from './library-types';
import type { Recipe } from './model';

export const recipeLibraryVersion = 1;
const releaseDate = '2026-11-27T00:00:00.000Z';
const productsByName = new Map(builtinFoods.map((food) => [food.name, food]));
const productsById = new Map(builtinFoods.map((food) => [food.id, food]));

function buildRecipe(row: LibraryRecipeData): Recipe {
  const id = `library:${row.id}`;
  const sources = new Set<string>();
  const ingredients = row.ingredients.map(([key, grams], index) => {
    const product = productsById.get(key) ?? productsByName.get(key);
    if (!product)
      throw new Error(`В рецепте ${id} отсутствует продукт «${key}».`);
    sources.add(product.source);
    return {
      id: `${id}:${index + 1}`,
      productId: product.id,
      productName: product.name,
      quantity: grams,
      unit: 'g' as const,
      gramsPerUnit: 1,
      normalizedQuantity: grams,
      nutritionSnapshot: { ...product.per100 },
    };
  });
  const recipe: Recipe = {
    id,
    name: row.name,
    description: row.description,
    category: row.category,
    preparationTime: row.prep + row.cook,
    servings: row.servings,
    cookedWeightGrams: row.weight,
    instructions: row.steps.join('\n'),
    isFavorite: false,
    createdAt: releaseDate,
    updatedAt: releaseDate,
    ingredients,
    metadata: {
      prep: row.prep,
      cook: row.cook,
      difficulty: row.difficulty,
      steps: row.steps,
      tags: row.tags,
      sources: [...sources],
    },
  };
  validateRecipe(recipe);
  return recipe;
}

export const builtinRecipes: readonly Recipe[] = libraryData.map(buildRecipe);
const recipesById = new Map(
  builtinRecipes.map((recipe) => [recipe.id, recipe]),
);
export const getBuiltinRecipe = (id: string) => recipesById.get(id);
export const isBuiltinRecipe = (id: string) => id.startsWith('library:');
