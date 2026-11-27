import { builtinFoods } from '@/features/food/catalog';
import { validateRecipe } from './domain';
import { libraryData } from './library-data';
import type { LibraryRecipeData } from './library-types';
import { unitoolsRecipes } from './library-unitools';
import { wikibooksRecipes } from './library-wikibooks';
import type { Recipe } from './model';

export const recipeLibraryVersion = 3;
const releaseDate = '2026-11-27T00:00:00.000Z';
const productsByName = new Map(builtinFoods.map((food) => [food.name, food]));
const productsById = new Map(builtinFoods.map((food) => [food.id, food]));

function buildIngredients(row: LibraryRecipeData): Recipe['ingredients'] {
  const id = `library:${row.id}`;
  return row.ingredients.map(
    ([key, grams, displayName, sourceQuantity], index) => {
      const product = productsById.get(key) ?? productsByName.get(key);
      if (!product)
        throw new Error(`В рецепте ${id} отсутствует продукт «${key}».`);
      return {
        id: `${id}:${index + 1}`,
        productId: product.id,
        productName: displayName ?? product.name,
        quantity: grams,
        unit: 'g' as const,
        gramsPerUnit: 1,
        normalizedQuantity: grams,
        ...(sourceQuantity ? { sourceQuantity } : {}),
        nutritionSnapshot: { ...product.per100 },
      };
    },
  );
}

function recipeCard(row: LibraryRecipeData) {
  const cuisine = row.cuisine ?? row.tags.find((tag) => tag.endsWith(' кухня'));
  return {
    id: `library:${row.id}`,
    name: row.name,
    description: row.description,
    category: row.category,
    preparationTime:
      row.prep === undefined || row.cook === undefined
        ? undefined
        : row.prep + row.cook || undefined,
    servings: row.servings,
    cookedWeightGrams: row.weight,
    isFavorite: false,
    createdAt: releaseDate,
    updatedAt: releaseDate,
    metadata: {
      prep: row.prep,
      cook: row.cook,
      difficulty: row.difficulty,
      cuisine,
      tags: row.tags,
    },
  };
}

function buildRecipe(row: LibraryRecipeData): Recipe {
  const card = recipeCard(row);
  const ingredients = buildIngredients(row);
  const sources = new Set(
    ingredients.flatMap(
      ({ productId }) => productsById.get(productId)?.source ?? [],
    ),
  );
  const recipe: Recipe = {
    ...card,
    instructions: row.steps.join('\n'),
    ingredients,
    metadata: {
      ...card.metadata,
      steps: row.steps,
      sources: [...sources],
      ...(row.source ? { provenance: row.source } : {}),
      ...(row.seasoningNote ? { seasoningNote: row.seasoningNote } : {}),
    },
  };
  validateRecipe(recipe);
  return recipe;
}

const rows: readonly LibraryRecipeData[] = [
  ...libraryData,
  ...unitoolsRecipes,
  ...wikibooksRecipes,
];
const rowsById = new Map(rows.map((row) => [`library:${row.id}`, row]));
export const builtinRecipeIds = [...rowsById.keys()];
export const builtinRecipeCuisines = [
  ...new Set(
    rows.flatMap((row) => {
      const cuisine =
        row.cuisine ?? row.tags.find((tag) => tag.endsWith(' кухня'));
      return cuisine ? [cuisine] : [];
    }),
  ),
].sort((a, b) => a.localeCompare(b, 'ru'));
export function* builtinRecipeSearchInputs() {
  for (const row of rows)
    yield {
      ...recipeCard(row),
      searchNames: row.searchNames,
      ingredients: buildIngredients(row),
    };
}
export const getBuiltinRecipe = (id: string) => {
  const row = rowsById.get(id);
  return row ? buildRecipe(row) : undefined;
};
export const hasBuiltinRecipe = (id: string) => rowsById.has(id);
export const isBuiltinRecipe = (id: string) => id.startsWith('library:');
