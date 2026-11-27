import { builtinFoods } from '@/features/food/catalog';
import { isMassBased } from '@/features/food/domain';
import { validateRecipe } from './domain';
import { libraryData } from './library-data';
import type { LibraryRecipeData } from './library-types';
import { unitoolsRecipes } from './library-unitools';
import { wikibooksRecipes } from './library-wikibooks';
import type { Recipe } from './model';

export const recipeLibraryVersion = 4;
const releaseDate = '2026-11-27T00:00:00.000Z';
const referenceFoods = builtinFoods.filter(
  (food) => isMassBased(food) && /^(builtin|fdc)-\d+$/.test(food.id),
);
const productsByName = new Map(referenceFoods.map((food) => [food.name, food]));
const productsById = new Map(referenceFoods.map((food) => [food.id, food]));

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
      ...(row.unresolvedIngredients
        ? { unresolvedIngredients: row.unresolvedIngredients }
        : {}),
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
      ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
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
let expandedRows: ReadonlyMap<string, LibraryRecipeData> | undefined;
export const builtinRecipeIds = [...rowsById.keys()];

export function setRecipeExpansion(
  expansion: readonly LibraryRecipeData[] = [],
) {
  expandedRows = new Map(
    expansion
      .map((row) => [`library:${row.id}`, row] as const)
      .filter(([id]) => !rowsById.has(id)),
  );
}

export function validateRecipeExpansion(
  expansion: readonly LibraryRecipeData[],
) {
  const ids = new Set<string>();
  for (const row of expansion) {
    const local = buildRecipe(row);
    if (ids.has(local.id) || !local.metadata?.unresolvedIngredients?.length)
      throw new Error('В пакете есть повторяющийся или неполный рецепт.');
    ids.add(local.id);
  }
}

function* libraryRows(includeExpansion: boolean) {
  yield* rows;
  if (includeExpansion && expandedRows) yield* expandedRows.values();
}

export function recipeCuisines(includeExpansion = false) {
  const cuisines = new Set<string>();
  for (const row of libraryRows(includeExpansion)) {
    const cuisine =
      row.cuisine ?? row.tags.find((tag) => tag.endsWith(' кухня'));
    if (cuisine) cuisines.add(cuisine);
  }
  return [...cuisines].sort((a, b) => a.localeCompare(b, 'ru'));
}

export const builtinRecipeCuisines = recipeCuisines();

export function* builtinRecipeSearchInputs(includeExpansion = false) {
  for (const row of libraryRows(includeExpansion))
    yield {
      ...recipeCard(row),
      searchNames: row.searchNames,
      ingredients: buildIngredients(row),
    };
}
export const getBuiltinRecipe = (id: string) => {
  const row = rowsById.get(id) ?? expandedRows?.get(id);
  return row ? buildRecipe(row) : undefined;
};
export const hasBuiltinRecipe = (id: string) =>
  rowsById.has(id) || (expandedRows?.has(id) ?? false);
export const isBuiltinRecipe = (id: string) => id.startsWith('library:');
