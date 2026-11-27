import {
  normalizeSearch,
  searchTerms,
  wordScore,
} from '@/features/food/local-search';
import type { FoodProduct, FoodState } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';
import { calculateRecipe } from './domain';
import { isBuiltinRecipe } from './library';
import type { Recipe } from './model';
import { recipeIsFavorite } from './operations';

export const collections = [
  'Для набора массы',
  'Высокобелковые',
  'Высококалорийные',
  'Бюджетные',
  'Быстрые рецепты',
  'Простые блюда',
  'Для приготовления на несколько дней',
  'До пяти ингредиентов',
] as const;

export const recommendations = [
  'Подходит под оставшиеся калории',
  'Поможет добрать белок',
  'Высококалорийный перекус',
  'Быстрый завтрак',
  'Подходит для набора массы',
] as const;
export type Recommendation = (typeof recommendations)[number];

export const sortOptions = [
  { value: 'relevance', label: 'По релевантности' },
  { value: 'calories', label: 'По калорийности' },
  { value: 'protein', label: 'По количеству белка' },
  { value: 'time', label: 'По времени приготовления' },
  { value: 'ingredients', label: 'По количеству ингредиентов' },
  { value: 'name', label: 'По названию' },
  { value: 'usage', label: 'По частоте использования' },
  { value: 'created', label: 'По дате добавления' },
  { value: 'pantry', label: 'По совпадению ингредиентов' },
] as const;
export type RecipeSort = (typeof sortOptions)[number]['value'];

export const numericFilters = [
  { key: 'minCalories', label: 'Калории от, ккал' },
  { key: 'maxCalories', label: 'Калории до, ккал' },
  { key: 'minProtein', label: 'Белки от, г' },
  { key: 'minFat', label: 'Жиры от, г' },
  { key: 'maxFat', label: 'Жиры до, г' },
  { key: 'minCarbs', label: 'Углеводы от, г' },
  { key: 'maxCarbs', label: 'Углеводы до, г' },
  { key: 'maxTime', label: 'Время до, мин' },
  { key: 'maxIngredients', label: 'Ингредиентов не более' },
] as const;
export type NumericFilter = (typeof numericFilters)[number]['key'];

export interface RecipeFilters extends Partial<Record<NumericFilter, number>> {
  query?: string;
  sort?: RecipeSort;
  section?: 'all' | 'own' | 'favorite' | 'recent';
  origin?: 'own' | 'builtin';
  favorite?: boolean;
  categories?: readonly string[];
  tags?: readonly string[];
  difficulty?: string;
  noCook?: boolean;
  required?: readonly string[];
  excluded?: readonly string[];
  pantry?: readonly string[];
  ignoreBasics?: boolean;
  recommendation?: Recommendation;
  remaining?: Pick<NutritionTargets, 'calories' | 'protein'>;
}

export function recipeTime(recipe: Recipe) {
  return recipe.preparationTime;
}

const basics =
  /^(вода( питьевая)?|соль( поваренная| морская)?|перец черный( молотый| горошком)?|черный перец молотый)$/;
export function isPantryBasic(name: string) {
  return basics.test(normalizeSearch(name));
}

export interface IndexedRecipe {
  recipe: Recipe;
  title: string;
  titleWords: string[];
  words: string[];
  tags: Set<string>;
  ingredientIds: Set<string>;
  basicIds: Set<string>;
  nutrition: NutritionTargets;
  time?: number;
  favorite: boolean;
  builtin: boolean;
  usage: number;
  lastUsed: string;
}

const recipeWords = new WeakMap<
  readonly IndexedRecipe[],
  ReadonlyMap<string, readonly IndexedRecipe[]>
>();

function searchCandidates(index: readonly IndexedRecipe[], terms: string[]) {
  if (!terms.length) return index;
  let postings = recipeWords.get(index);
  if (!postings) {
    const words = new Map<string, IndexedRecipe[]>();
    for (const item of index) {
      for (const word of new Set([...item.titleWords, ...item.words])) {
        const matches = words.get(word);
        if (matches) matches.push(item);
        else words.set(word, [item]);
      }
    }
    postings = words;
    recipeWords.set(index, words);
  }
  // The same scorer covers exact, prefix, synonym and typo matches.
  const candidates = terms.map((term) => {
    const matches = new Set<IndexedRecipe>();
    for (const [word, recipes] of postings) {
      if (wordScore(term, [word])) {
        for (const recipe of recipes) matches.add(recipe);
      }
    }
    return matches;
  });
  candidates.sort((a, b) => a.size - b.size);
  return [...candidates[0]].filter((item) =>
    candidates.every((matches) => matches.has(item)),
  );
}

export function buildRecipeIndex(
  recipes: readonly Recipe[],
  products: readonly FoodProduct[],
  state: FoodState,
): IndexedRecipe[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const stats = new Map<string, { count: number; last: string }>();
  for (const entry of state.entries) {
    if (!entry.recipe) continue;
    const id = entry.product.id;
    const previous = stats.get(id);
    stats.set(id, {
      count: (previous?.count ?? 0) + 1,
      last:
        previous && previous.last > entry.createdAt
          ? previous.last
          : entry.createdAt,
    });
  }
  return recipes.map((recipe) => {
    const nutrition = calculateRecipe(recipe).perServing;
    const time = recipeTime(recipe);
    const tags = new Set(recipe.metadata?.tags);
    const ingredientIds = new Set(
      recipe.ingredients.map((item) => item.productId),
    );
    if (nutrition.protein >= 25) tags.add('Высокобелковые');
    if (nutrition.calories >= 550) tags.add('Высококалорийные');
    if (time !== undefined && time <= 20) tags.add('Быстрые рецепты');
    if (recipe.metadata?.difficulty === 'Простой') tags.add('Простые блюда');
    if (ingredientIds.size <= 5) tags.add('До пяти ингредиентов');
    const ingredientNames = recipe.ingredients.flatMap((item) => [
      item.productName,
      ...(byId.get(item.productId)?.aliases ?? []),
    ]);
    return {
      recipe,
      title: normalizeSearch(recipe.name),
      titleWords: searchTerms(recipe.name),
      words: searchTerms(
        [recipe.category, recipe.description, ...tags, ...ingredientNames].join(
          ' ',
        ),
      ),
      tags,
      ingredientIds,
      basicIds: new Set(
        recipe.ingredients
          .filter((item) => isPantryBasic(item.productName))
          .map((item) => item.productId),
      ),
      nutrition,
      time,
      favorite: recipeIsFavorite(state, recipe),
      builtin: isBuiltinRecipe(recipe.id),
      usage: stats.get(recipe.id)?.count ?? 0,
      lastUsed: stats.get(recipe.id)?.last ?? '',
    };
  });
}

export function pantryMatch(
  item: IndexedRecipe,
  available: ReadonlySet<string>,
  ignoreBasics: boolean,
) {
  const relevant = [...item.ingredientIds].filter(
    (id) => !ignoreBasics || !item.basicIds.has(id),
  );
  const matched = relevant.filter((id) => available.has(id)).length;
  return {
    matched,
    total: relevant.length,
    missing: relevant.length - matched,
    percent: relevant.length
      ? Math.round((100 * matched) / relevant.length)
      : 100,
  };
}

function matchesRecommendation(item: IndexedRecipe, filters: RecipeFilters) {
  const { nutrition, recipe, time, tags } = item;
  const { remaining, recommendation } = filters;
  switch (recommendation) {
    case 'Подходит под оставшиеся калории':
      return (
        !!remaining &&
        nutrition.calories <= remaining.calories &&
        remaining.calories > 0
      );
    case 'Поможет добрать белок':
      return (
        !!remaining &&
        remaining.protein > 0 &&
        nutrition.calories <= remaining.calories &&
        nutrition.protein >= Math.min(20, remaining.protein)
      );
    case 'Высококалорийный перекус':
      return (
        [
          'Перекусы',
          'Высококалорийные коктейли',
          'Протеиновые коктейли',
        ].includes(recipe.category) && nutrition.calories >= 350
      );
    case 'Быстрый завтрак':
      return recipe.category === 'Завтраки' && time !== undefined && time <= 20;
    case 'Подходит для набора массы':
      return tags.has('Для набора массы');
    default:
      return true;
  }
}

function matchesFilters(item: IndexedRecipe, f: RecipeFilters) {
  const { nutrition: n, recipe, tags, time, ingredientIds } = item;
  return (
    (f.section !== 'own' || !item.builtin) &&
    (f.section !== 'recent' || item.usage > 0) &&
    (!(f.section === 'favorite' || f.favorite) || item.favorite) &&
    (!f.origin || (f.origin === 'builtin') === item.builtin) &&
    (!f.categories?.length || f.categories.includes(recipe.category)) &&
    (!f.tags?.length || f.tags.every((tag) => tags.has(tag))) &&
    (!f.difficulty || recipe.metadata?.difficulty === f.difficulty) &&
    (!f.noCook ||
      (recipe.metadata?.cook === 0 && recipe.metadata.prep > 0) ||
      recipe.category === 'Блюда без приготовления') &&
    (f.minCalories === undefined || n.calories >= f.minCalories) &&
    (f.maxCalories === undefined || n.calories <= f.maxCalories) &&
    (f.minProtein === undefined || n.protein >= f.minProtein) &&
    (f.minFat === undefined || n.fat >= f.minFat) &&
    (f.maxFat === undefined || n.fat <= f.maxFat) &&
    (f.minCarbs === undefined || n.carbs >= f.minCarbs) &&
    (f.maxCarbs === undefined || n.carbs <= f.maxCarbs) &&
    (f.maxTime === undefined || (time !== undefined && time <= f.maxTime)) &&
    (f.maxIngredients === undefined ||
      ingredientIds.size <= f.maxIngredients) &&
    (f.required?.every((id) => ingredientIds.has(id)) ?? true) &&
    !f.excluded?.some((id) => ingredientIds.has(id)) &&
    matchesRecommendation(item, f)
  );
}

export function findRecipes(
  index: readonly IndexedRecipe[],
  f: RecipeFilters = {},
) {
  const terms = searchTerms(f.query ?? '');
  const phrase = normalizeSearch(f.query ?? '');
  const pantry = new Set(f.pantry);
  const results = searchCandidates(index, terms).flatMap((item) => {
    if (!matchesFilters(item, f)) return [];
    let score = phrase && item.title === phrase ? 1000 : 0;
    for (const term of terms) {
      const match = Math.max(
        wordScore(term, item.titleWords) * 3,
        wordScore(term, item.words) * 2,
      );
      if (!match) return [];
      score += match;
    }
    return [
      {
        ...item,
        score,
        match: f.pantry
          ? pantryMatch(item, pantry, !!f.ignoreBasics)
          : undefined,
      },
    ];
  });
  type Result = (typeof results)[number];
  const compareName = (a: Result, b: Result) =>
    a.recipe.name.localeCompare(b.recipe.name, 'ru');
  const compareRelevance = (a: Result, b: Result) =>
    b.score - a.score ||
    (f.recommendation === 'Поможет добрать белок'
      ? b.nutrition.protein - a.nutrition.protein
      : 0) ||
    Number(a.builtin) - Number(b.builtin);
  const comparePantry = (a: Result, b: Result) =>
    (a.match?.missing ?? 0) - (b.match?.missing ?? 0);
  const time = (item: IndexedRecipe) => item.time ?? Number.MAX_SAFE_INTEGER;
  const comparisons: Record<RecipeSort, (a: Result, b: Result) => number> = {
    relevance: compareRelevance,
    calories: (a, b) => b.nutrition.calories - a.nutrition.calories,
    protein: (a, b) => b.nutrition.protein - a.nutrition.protein,
    time: (a, b) => time(a) - time(b),
    ingredients: (a, b) => a.ingredientIds.size - b.ingredientIds.size,
    name: compareName,
    usage: (a, b) => b.usage - a.usage,
    created: (a, b) => b.recipe.createdAt.localeCompare(a.recipe.createdAt),
    pantry: (a, b) =>
      compareRelevance(a, b) ||
      (b.match?.percent ?? 0) - (a.match?.percent ?? 0),
  };
  const compare = comparisons[f.sort ?? (f.pantry ? 'pantry' : 'relevance')];
  return results.sort(
    (a, b) =>
      (f.pantry ? comparePantry(a, b) : 0) ||
      (f.section === 'recent' ? b.lastUsed.localeCompare(a.lastUsed) : 0) ||
      compare(a, b) ||
      compareRelevance(a, b) ||
      compareName(a, b),
  );
}
