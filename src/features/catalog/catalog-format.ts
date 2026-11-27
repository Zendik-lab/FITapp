import { barcodeKey } from '@/features/food/domain';
import { categories, type FoodProduct } from '@/features/food/model';

type ProductDetails = {
  basis?: 'ml';
  fdcId?: number;
  created?: string;
  updated?: string;
  aliases?: readonly string[];
  countries?: readonly string[];
  manufacturer?: string;
  sourceCategory?: string;
  ingredients?: string;
  allergens?: string;
  packageText?: string;
  package?: readonly [number, 'g' | 'ml'];
  serving?: number;
  sugar?: number;
  fiber?: number;
  saturatedFat?: number;
  salt?: number;
};

export type PackedProduct = readonly [
  barcode: string,
  name: string,
  category: number,
  brand: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  details: ProductDetails,
];

export type CatalogSource = 'off' | 'usda';
export type CatalogChunk = {
  path: string;
  bytes: number;
  rawBytes: number;
  count: number;
  sha256: string;
};
export type CatalogPack = {
  id: string;
  title: string;
  source: CatalogSource;
  sourceUrl: string;
  license: 'ODbL-1.0' | 'CC0-1.0';
  version: string;
  count: number;
  bytes: number;
  rawBytes: number;
  files: CatalogChunk[];
};

const sources = {
  off: {
    name: 'Open Food Facts · ODbL · данные сообщества',
    origin: 'https://static.openfoodfacts.org/',
    license: 'ODbL-1.0',
  },
  usda: {
    name: 'USDA FoodData Central · CC0',
    origin: 'https://fdc.nal.usda.gov/',
    license: 'CC0-1.0',
  },
} as const;
const regions: Record<string, string> = {
  kazakhstan: 'Казахстан',
  russia: 'Россия',
  belarus: 'Беларусь',
  kyrgyzstan: 'Кыргызстан',
  uzbekistan: 'Узбекистан',
  ukraine: 'Украина',
  armenia: 'Армения',
  azerbaijan: 'Азербайджан',
  tajikistan: 'Таджикистан',
  turkmenistan: 'Туркменистан',
  moldova: 'Молдова',
  georgia: 'Грузия',
  'united-states': 'США',
  france: 'Франция',
  germany: 'Германия',
};
export const catalogCountryName = (key: string) => regions[key] ?? key;

const brandNames = [
  ['foodmaster', 'фудмастер', 'food master'],
  ['snickers', 'сникерс'],
  ['rakhat', 'рахат', 'rakhat'],
  ['bayan sulu', 'баян сулу'],
  ['shin-line', 'шин-лайн', 'шинлайн'],
  ['prostokvashino', 'простоквашино'],
  ['nestlé', 'нестле', 'nestle'],
  ['coca-cola', 'кока кола', 'кока-кола'],
  ['pepsi', 'пепси'],
  ['danone', 'данон'],
  ['activia', 'активиа'],
  ['barilla', 'барилла'],
  ['makfa', 'макфа'],
  ['rollton', 'роллтон'],
  ['doshirak', 'доширак'],
  ['oreo', 'орео'],
  ['milka', 'милка'],
  ['kinder', 'киндер'],
  ['pringles', 'принглс'],
  ['alpen gold', 'альпен гольд'],
  ['twix', 'твикс'],
  ['bounty', 'баунти'],
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positiveInteger(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}
function nutrient(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
  );
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}
function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 300 &&
    value.every((item) => text(item, 640))
  );
}
export function invalid(): never {
  throw new Error('Каталог повреждён или несовместим с этой версией FITapp.');
}
function isChunk(value: unknown, id: string): value is CatalogChunk {
  return (
    record(value) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    value.path === `${id}/${value.sha256}.json.gz` &&
    positiveInteger(value.bytes, 2 * 1024 * 1024) &&
    positiveInteger(value.rawBytes, 4 * 1024 * 1024) &&
    positiveInteger(value.count, 500)
  );
}
function parsePack(value: unknown): CatalogPack {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[a-z][a-z0-9-]{0,39}$/.test(value.id) ||
    !text(value.title, 160) ||
    !value.title.trim() ||
    (value.source !== 'off' && value.source !== 'usda') ||
    typeof value.sourceUrl !== 'string' ||
    !value.sourceUrl.startsWith(sources[value.source].origin) ||
    value.license !== sources[value.source].license ||
    typeof value.version !== 'string' ||
    !/^[0-9a-f]{24}$/.test(value.version) ||
    !Array.isArray(value.files) ||
    value.files.length === 0 ||
    value.files.length > 1200
  )
    return invalid();
  const id = value.id;
  const files = value.files.map((file: unknown) =>
    isChunk(file, id) ? file : invalid(),
  );
  const count = files.reduce((sum, file) => sum + file.count, 0);
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const rawBytes = files.reduce((sum, file) => sum + file.rawBytes, 0);
  if (
    count !== value.count ||
    bytes !== value.bytes ||
    rawBytes !== value.rawBytes ||
    new Set(files.map((file) => file.path)).size !== files.length
  )
    return invalid();
  return {
    id,
    title: value.title,
    source: value.source,
    sourceUrl: value.sourceUrl,
    license: sources[value.source].license,
    version: value.version,
    count,
    bytes,
    rawBytes,
    files,
  };
}

export function parseCatalogManifest(value: unknown): CatalogPack[] {
  if (
    !record(value) ||
    value.schema !== 1 ||
    !Array.isArray(value.packages) ||
    value.packages.length > 40
  )
    return invalid();
  const packages = value.packages.map(parsePack);
  if (new Set(packages.map((pack) => pack.id)).size !== packages.length)
    return invalid();
  return packages;
}

export function isPackedProduct(value: unknown): value is PackedProduct {
  if (!Array.isArray(value) || value.length !== 9) return false;
  const [code, name, category, brand, calories, protein, fat, carbs, details] =
    value as unknown[];
  return (
    typeof code === 'string' &&
    !!barcodeKey(code) &&
    text(name, 640) &&
    !!name.trim() &&
    text(brand, 640) &&
    typeof category === 'number' &&
    Number.isInteger(category) &&
    category >= 0 &&
    category < categories.length &&
    nutrient(calories, 950) &&
    nutrient(protein, 100) &&
    nutrient(fat, 100) &&
    nutrient(carbs, 100) &&
    protein + fat + carbs <= 105.00002 &&
    record(details) &&
    (details.basis === undefined || details.basis === 'ml') &&
    (details.fdcId === undefined ||
      positiveInteger(details.fdcId, Number.MAX_SAFE_INTEGER)) &&
    (details.aliases === undefined || stringArray(details.aliases)) &&
    (details.countries === undefined || stringArray(details.countries)) &&
    (details.serving === undefined ||
      (nutrient(details.serving, 100000) && details.serving > 0)) &&
    (details.package === undefined ||
      (Array.isArray(details.package) &&
        details.package.length === 2 &&
        nutrient(details.package[0], 1000000) &&
        details.package[0] > 0 &&
        (details.package[1] === 'g' || details.package[1] === 'ml'))) &&
    [
      'manufacturer',
      'sourceCategory',
      'ingredients',
      'allergens',
      'packageText',
      'created',
      'updated',
    ].every((key) => details[key] === undefined || text(details[key], 4800)) &&
    ['sugar', 'fiber', 'saturatedFat', 'salt'].every(
      (key) => details[key] === undefined || nutrient(details[key], 100),
    )
  );
}

export function unpackCatalogProduct(
  row: PackedProduct,
  source: CatalogSource,
): FoodProduct {
  const [
    barcode,
    name,
    category,
    brand,
    calories,
    protein,
    fat,
    carbs,
    details,
  ] = row;
  const baseUnit = details.basis ?? 'g';
  const brandText = `${name} ${brand}`.toLocaleLowerCase('ru');
  const aliases = new Set(details.aliases);
  for (const names of brandNames) {
    if (names.some((alias) => brandText.includes(alias))) {
      for (const alias of names) aliases.add(alias);
    }
  }
  const date = details.created || details.updated || '2026-11-27T00:00:00.000Z';
  return {
    id: source === 'off' ? `off-${barcode}` : `branded-${barcodeKey(barcode)}`,
    name,
    category: categories[category],
    brand: brand || undefined,
    barcode,
    baseUnit,
    servingGrams: baseUnit === 'g' ? details.serving : undefined,
    servingMl: baseUnit === 'ml' ? details.serving : undefined,
    fdcId: details.fdcId,
    aliases: aliases.size ? [...aliases] : undefined,
    per100: { calories, protein, fat, carbs },
    source: sources[source].name,
    isCustom: false,
    createdAt: date,
    updatedAt: details.updated || date,
    catalogDetails: {
      originalName: name,
      russianName: /[а-яё]/iu.test(name) ? name : undefined,
      manufacturer: details.manufacturer,
      sourceCategory: details.sourceCategory,
      countries: details.countries,
      ingredients: details.ingredients,
      allergens: details.allergens,
      packageText: details.packageText,
      packageAmount: details.package?.[0],
      packageUnit: details.package?.[1],
      sugar: details.sugar,
      fiber: details.fiber,
      saturatedFat: details.saturatedFat,
      salt: details.salt,
      completeness: [
        details.sugar,
        details.fiber,
        details.saturatedFat,
        details.salt,
      ].every((value) => value !== undefined)
        ? 'extended'
        : 'macros',
      license: sources[source].license,
      url:
        source === 'off'
          ? `https://world.openfoodfacts.org/product/${barcode}`
          : `https://fdc.nal.usda.gov/food-details/${details.fdcId}/nutrients`,
    },
  };
}
