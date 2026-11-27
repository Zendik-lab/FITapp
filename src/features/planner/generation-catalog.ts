import { searchCatalog } from '@/features/catalog/catalog-service';
import { isMassBased, scaleNutrition } from '@/features/food/domain';
import { normalizeSearch } from '@/features/food/local-search';
import type { FoodProduct, FoodState } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';
import { calculateRecipe } from '@/features/recipes/domain';
import {
  builtinRecipeSearchInputs,
  getBuiltinRecipe,
} from '@/features/recipes/library';
import type { Recipe } from '@/features/recipes/model';
import {
  isPantryBasic,
  recipeIngredientKey,
} from '@/features/recipes/recipe-search';
import type { GenerationSettings, PlanMealKind } from './model';

type Role = 'breakfast' | 'main' | 'snack' | 'side';
type Pair = 'sweet' | 'savory' | 'neutral';
type Group =
  | 'protein'
  | 'starch'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'nuts'
  | 'sport'
  | 'mixed';
export type Requirement = { id: string; amount: number };

export interface PlanCandidate {
  id: string;
  label: string;
  product?: FoodProduct;
  nutrition: NutritionTargets;
  requirements: Requirement[];
  roles: readonly Role[];
  pair: Pair;
  group: Group;
  min: number;
  max: number;
  step: number;
  time?: number;
  complexity: number;
  cost: number | null;
  preferred: number;
}

export const preferenceTerms = (value: string) =>
  value
    .split(/[,;\n]+/)
    .map(normalizeSearch)
    .filter(Boolean);

const allergyGroups = [
  [
    /молок|молоч|лактоз|dairy|lactose|milk/,
    /молок|молоч|лактоз|казеин|сыворот|творог|йогурт|кефир|сливк|сливоч|сметан|ряжен|пахт|сыр( |$)|моцарелл|пармезан|фет(а|ы)|milk|dairy|whey|cheese|cream/,
  ],
  [/яйц|яич|egg/, /яйц|яич|желток|альбумин|egg/],
  [/арахис|peanut/, /арахис|peanut/],
  [
    /орех|nuts?/,
    /орех|арахис|миндал|фундук|пекан|кешью|фисташ|макадами|nuts?|almond|cashew/,
  ],
  [
    /глютен|пшениц|wheat|gluten/,
    /глютен|пшен|рожь|ржан|ячмен|перлов|булгур|кускус|овес|овся|спельт|манн|wheat|barley|rye|oats|gluten/,
  ],
  [
    /рыб|fish/,
    /рыб|лосос|тун(ец|ц)|треск|сел(едь|ьд)|анчоус|скумбр|сардин|форел|минта|рыб|fish|salmon|tuna|anchov/,
  ],
  [
    /морепродукт|ракообр|моллюск|shellfish/,
    /морепродукт|ракообр|моллюск|кревет|краб|мид|кальмар|устриц|омар|лангуст|shellfish|shrimp|crab/,
  ],
  [/со(я|ев)|soy/, /со(я|ев)|тофу|темпе|edamame|soy/],
  [/кунжут|sesame/, /кунжут|тахин|sesame|tahini/],
  [/горчиц|mustard/, /горчиц|mustard/],
  [/сельдер|celery/, /сельдер|celery/],
  [/люпин|lupin/, /люпин|lupin/],
  [
    /сульфит|sulph?fit|sulfite/,
    /сульфит|диоксид серы|metabisulfite|sulfite|sulphite|e22[0-8]/,
  ],
] as const;

function matchesTerm(term: string, value: string) {
  return term.length < 4
    ? ` ${value} `.includes(` ${term} `)
    : value.includes(term);
}

function productText(product: FoodProduct) {
  const details = product.catalogDetails;
  return normalizeSearch(
    [
      product.name,
      product.category,
      ...(product.aliases ?? []),
      details?.originalName,
      details?.sourceCategory,
      details?.ingredients,
      details?.allergens,
    ].join(' '),
  );
}

const meat =
  /мясо|птица|рыба|морепродукт|бульон мяс|бульон кур|курин|куриц|говяж|говядин|свинин|свиное|индейк|баранин|бекон|колбас|желатин|смалец|анчоус|устриц|кревет|краб|кальмар|мидии|лосос|тунец|fish|chicken|beef|pork|gelatin/;
const animal =
  /молок|молоч|яйц|яич|желток|казеин|сыворот|творог|йогурт|сливоч|сливк|сметан|сыр( |$)|мед( |$)|milk|dairy|egg|whey|cheese|honey/;
const plantCategory = /^(крупы|овощи|фрукты|орехи|масла|специи и добавки)$/;
const ambiguousCategory =
  /^(хлебобулочные изделия|макаронные изделия|готовые продукты|сладости|напитки|спортивное питание|соусы и заправки)$/;
const raw =
  /сыр(ой|ая|ое|ые)|неготов|raw|сух(ая|ое|ой|ие)|dry|порош|мука|концентрат|неприготов/;
const cooked =
  /варен|запеч|тушен|жарен|готов|консерв|в собственном соку|cooked|roast|boiled/;

function productType(
  product: FoodProduct,
): { group: Group; pair: Pair; max: number } | undefined {
  const category = normalizeSearch(product.category);
  const name = normalizeSearch(product.name);
  if (product.per100.calories < 8) return;
  if (category === 'спортивное питание') {
    if (/батончик|напиток|готов|йогурт/.test(name))
      return {
        group: 'sport',
        pair: 'sweet',
        max: product.baseUnit === 'ml' ? 300 : 70,
      };
    return;
  }
  if (
    /^(мясо и птица|рыба|яйца)$/.test(category) &&
    !raw.test(name) &&
    cooked.test(name)
  )
    return { group: 'protein', pair: 'savory', max: 185 };
  if (
    /^(крупы|макаронные изделия)$/.test(category) &&
    cooked.test(name) &&
    !raw.test(name)
  )
    return { group: 'starch', pair: 'neutral', max: 230 };
  if (
    category === 'хлебобулочные изделия' &&
    /^(хлеб|лаваш|багет|хлебц|булочка цельн)/.test(name)
  )
    return { group: 'starch', pair: 'neutral', max: 100 };
  if (
    category === 'фрукты' &&
    !/сок|сироп|сушен|порош|консерв|цукат/.test(name)
  )
    return { group: 'fruit', pair: 'sweet', max: 180 };
  if (
    category === 'овощи' &&
    (/варен|запеч|тушен/.test(name) ||
      /^(огур|помидор|томат|морков|капуст|салат|перец сладкий|авокадо)/.test(
        name,
      ))
  )
    return { group: 'vegetable', pair: 'savory', max: 170 };
  if (
    category === 'молочные продукты' &&
    /^(творог|йогурт|кефир|ряженка|молоко)/.test(name) &&
    !/сух|сыр(ое|ой)|сгущен/.test(name)
  )
    return { group: 'dairy', pair: 'sweet', max: 225 };
  if (category === 'орехи' && !/масло|мука|порош|молоко|сироп/.test(name))
    return { group: 'nuts', pair: 'neutral', max: 35 };
  if (/^тофу/.test(name)) return { group: 'protein', pair: 'savory', max: 160 };
}

function recipeType(
  category: string,
  tags?: readonly string[],
): { roles: readonly Role[]; pair: Pair } {
  if (category === 'Завтраки')
    return {
      roles: ['breakfast', 'snack'],
      pair: tags?.some((tag) => /слад|фрукт/.test(normalizeSearch(tag)))
        ? 'sweet'
        : 'neutral',
    };
  if (
    [
      'Протеиновые коктейли',
      'Высококалорийные коктейли',
      'Десерты',
      'Напитки',
      'Выпечка',
    ].includes(category)
  )
    return { roles: ['snack', 'breakfast'], pair: 'sweet' };
  if (category === 'Перекусы')
    return { roles: ['snack', 'breakfast'], pair: 'neutral' };
  if (['Салаты', 'Гарниры'].includes(category))
    return { roles: ['side', 'main'], pair: 'savory' };
  if (category === 'Блюда без приготовления')
    return { roles: ['snack', 'main', 'breakfast'], pair: 'neutral' };
  return { roles: ['main'], pair: 'savory' };
}

export const roleOf = (kind: PlanMealKind): Role =>
  kind === 'breakfast'
    ? 'breakfast'
    : kind === 'lunch' || kind === 'dinner'
      ? 'main'
      : 'snack';

function combineRequirements(requirements: Iterable<Requirement>) {
  const byId = new Map<string, number>();
  for (const { id, amount } of requirements) {
    const key = recipeIngredientKey(id);
    byId.set(key, (byId.get(key) ?? 0) + amount);
  }
  return Array.from(byId, ([id, amount]) => ({ id, amount }));
}

export async function generationCatalog(
  products: readonly FoodProduct[],
  state: FoodState,
  settings: GenerationSettings,
  yieldControl: () => Promise<void>,
  lookupInstalled: boolean,
): Promise<PlanCandidate[]> {
  const pantry = state.pantry;
  const excludes = preferenceTerms(settings.excludes);
  const allergies = preferenceTerms(settings.allergies);
  const favorites = preferenceTerms(settings.preferences);
  const allergyPatterns = allergyGroups
    .filter(([input]) => allergies.some((term) => input.test(term)))
    .map(([, pattern]) => pattern);
  const forbidden = (text: string) =>
    [...excludes, ...allergies].some((term) => matchesTerm(term, text)) ||
    allergyPatterns.some((pattern) => pattern.test(text));
  const plantOnly = settings.diet === 'vegan';
  const dietRestricted = settings.diet !== 'any';
  const mode = settings.mode;
  const prices = new Map(
    Object.entries(pantry?.prices ?? {}).map(([id, price]) => [
      recipeIngredientKey(id),
      price,
    ]),
  );
  if (mode === 'budget' && !prices.size)
    throw new Error('Добавьте цены упаковок в разделе бюджета питания.');
  const costOf = (needs: Requirement[]) => {
    let total = 0;
    for (const { id, amount } of needs) {
      const price = prices.get(id);
      if (!price) return null;
      total += (price.amount / price.grams) * amount;
    }
    return needs.length ? total : null;
  };

  const catalog = new Map(products.map((product) => [product.id, product]));
  if (lookupInstalled) {
    const queries = new Set(
      [
        ...favorites,
        ...(pantry?.stock ?? []).map((row) => row.name),
        ...(!settings.stockOnly && mode !== 'budget'
          ? [
              'хлеб цельнозерновой',
              'тунец в собственном соку',
              'йогурт натуральный',
              'тофу',
              'банан',
            ]
          : []),
      ].slice(0, 18),
    );
    for (const query of queries) {
      const result = await searchCatalog({
        query,
        accept: (product) => productType(product) !== undefined,
      });
      for (const product of result.rows)
        if (!catalog.has(product.id)) catalog.set(product.id, product);
    }
  }

  const allowed = new Map<string, boolean>();
  function productAllowed(product: FoodProduct) {
    const cached = allowed.get(product.id);
    if (cached !== undefined) return cached;
    const text = productText(product);
    const category = normalizeSearch(product.category);
    const opaque =
      ambiguousCategory.test(category) &&
      (product.isCustom || product.catalogDetails !== undefined) &&
      !product.catalogDetails?.ingredients &&
      !product.catalogDetails?.allergens;
    const eligible =
      !forbidden(text) &&
      (settings.sport || category !== 'спортивное питание') &&
      (!dietRestricted || !meat.test(text)) &&
      (!plantOnly ||
        (!animal.test(text) &&
          (plantCategory.test(category) ||
            /^(тофу|темпе|паста из|вода|крахмал)/.test(
              normalizeSearch(product.name),
            ) ||
            !!product.catalogDetails?.ingredients))) &&
      (!(allergies.length || dietRestricted) || !opaque);
    allowed.set(product.id, eligible);
    return eligible;
  }

  const result: PlanCandidate[] = [];
  const favoriteFood = new Set(state.favorites.map((item) => item.productId));
  const favoriteRecipe = new Set(state.favoriteRecipeIds);
  const prefer = (text: string, favorite: boolean) =>
    (favorite ? 0.045 : 0) +
    (favorites.some((term) => matchesTerm(term, text)) ? 0.07 : 0);
  let inspected = 0;

  for (const product of catalog.values()) {
    if (++inspected % 100 === 0) await yieldControl();
    const type = productType(product);
    if (!type || !productAllowed(product)) continue;
    if (!isMassBased(product) && (mode === 'budget' || settings.stockOnly))
      continue;
    const requirements = [{ id: recipeIngredientKey(product.id), amount: 1 }];
    const cost = costOf(requirements);
    if (mode === 'budget' && cost === null) continue;
    const roles: Role[] =
      type.group === 'protein' || type.group === 'vegetable'
        ? ['main', 'side']
        : type.group === 'starch'
          ? ['main', 'breakfast', 'side']
          : ['snack', 'breakfast'];
    result.push({
      id: product.id,
      label: normalizeSearch(product.name),
      product,
      roles,
      ...type,
      nutrition: scaleNutrition(product.per100, 0.01),
      requirements,
      min: type.group === 'nuts' ? 10 : 30,
      step: 5,
      time: 0,
      complexity: 1,
      cost,
      preferred: prefer(productText(product), favoriteFood.has(product.id)),
    });
  }

  function* allRecipes() {
    yield* state.recipes;
    yield* builtinRecipeSearchInputs();
  }
  const recipes = allRecipes();
  for (const recipe of recipes) {
    if (++inspected % 50 === 0) await yieldControl();
    if (
      recipe.metadata?.unresolvedIngredients?.length ||
      (settings.maxMinutes &&
        (recipe.preparationTime === undefined ||
          recipe.preparationTime > settings.maxMinutes))
    )
      continue;
    const label = normalizeSearch(recipe.name);
    if (
      forbidden(label) ||
      (dietRestricted && meat.test(label)) ||
      (plantOnly && animal.test(label))
    )
      continue;
    const text = normalizeSearch(
      [
        label,
        ...recipe.ingredients.map((ingredient) => ingredient.productName),
        ...(recipe.metadata?.tags ?? []),
      ].join(' '),
    );
    if (
      forbidden(text) ||
      (!settings.sport &&
        /протеин( не|ов| |$)|гейнер/.test(text) &&
        recipe.ingredients.some((ingredient) =>
          /протеин|гейнер/.test(normalizeSearch(ingredient.productName)),
        ))
    )
      continue;
    if (
      recipe.ingredients.some((ingredient) => {
        const product = catalog.get(ingredient.productId);
        return product
          ? !productAllowed(product)
          : allergies.length > 0 || dietRestricted;
      })
    )
      continue;
    const calculated = calculateRecipe(recipe);
    if (calculated.perServing.calories < 35) continue;
    const requirements = combineRequirements(
      recipe.ingredients
        .filter(
          (ingredient) =>
            !settings.stockOnly ||
            !isPantryBasic(ingredient.productName) ||
            mode === 'budget',
        )
        .map((ingredient) => ({
          id: ingredient.productId,
          amount: ingredient.normalizedQuantity / recipe.servings,
        })),
    );
    const actualCost = costOf(requirements);
    if (mode === 'budget' && actualCost === null) continue;
    const rawWeight = recipe.ingredients.reduce(
      (sum, ingredient) => sum + ingredient.normalizedQuantity,
      0,
    );
    const grams = (recipe.cookedWeightGrams ?? rawWeight) / recipe.servings;
    const max = Math.min(2, Math.floor((700 / grams) * 4) / 4);
    if (max < 0.5) continue;
    result.push({
      id: recipe.id,
      label,
      nutrition: calculated.perServing,
      requirements,
      ...recipeType(recipe.category, recipe.metadata?.tags),
      group: 'mixed',
      time: recipe.preparationTime,
      complexity: recipe.ingredients.length,
      min: 0.5,
      step: 0.25,
      max,
      cost: actualCost,
      preferred: prefer(
        text,
        recipe.isFavorite || favoriteRecipe.has(recipe.id),
      ),
    });
  }
  return result;
}

export function candidateRecipe(
  candidate: PlanCandidate,
  recipes: readonly Recipe[],
) {
  return (
    recipes.find((recipe) => recipe.id === candidate.id) ??
    getBuiltinRecipe(candidate.id)
  );
}
