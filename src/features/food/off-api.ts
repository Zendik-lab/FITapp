import { Platform } from 'react-native';
import { sameBarcode, validBarcode } from './domain';
import type { FoodProduct } from './model';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
function nutrient(value: unknown, limit: number) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= limit
    ? value
    : undefined;
}
const quantityUnits = {
  g: ['g', 1],
  г: ['g', 1],
  kg: ['g', 1000],
  кг: ['g', 1000],
  ml: ['ml', 1],
  мл: ['ml', 1],
  cl: ['ml', 10],
  dl: ['ml', 100],
  l: ['ml', 1000],
  л: ['ml', 1000],
} as const;
function measure(value: string) {
  const match =
    /^(\d+(?:[.,]\d+)?)\s*(g|г|kg|кг|ml|мл|cl|dl|l|л)(?:\s*℮)?$/iu.exec(value);
  if (!match) return undefined;
  const [unit, factor] =
    quantityUnits[match[2].toLowerCase() as keyof typeof quantityUnits];
  const amount = Number(match[1].replace(',', '.')) * factor;
  return Number.isFinite(amount) && amount > 0 ? { unit, amount } : undefined;
}

const origin = 'https://world.openfoodfacts.org';
const searchOrigin = 'https://search.openfoodfacts.org';

export function parseOffProduct(value: unknown): FoodProduct | null {
  if (!record(value) || !record(value.nutriments)) return null;
  // OFF's _100g fields may describe 100 ml. Package volume alone cannot establish the nutrition basis.
  const perVolume = value.nutrition_data_per === '100ml';
  const servingText = text(value.serving_size);
  const packageText = text(value.quantity);
  const volume = /\d\s*(?:ml|cl|dl|l|мл|л|fl\s*oz)(?![\p{L}\p{N}])/iu;
  const liquidCategories = [
    'en:beverages',
    'en:milks',
    'en:plant-milks',
    'en:vegetable-oils',
    'en:soups',
  ];
  if (
    value.no_nutrition_data === 'on' ||
    (!perVolume &&
      (volume.test(servingText) ||
        volume.test(packageText) ||
        ['ml', 'cl', 'dl', 'l', 'мл', 'л'].includes(
          text(value.product_quantity_unit).toLowerCase(),
        ) ||
        (Array.isArray(value.categories_tags) &&
          value.categories_tags.some((tag) =>
            liquidCategories.includes(String(tag)),
          ))))
  )
    return null;
  const n = value.nutriments;
  const limit = perVolume ? 150 : 105;
  const energyKj = n['energy-kj_100g'] ?? n.energy_100g;
  const calories = nutrient(
    n['energy-kcal_100g'] ??
      (typeof energyKj === 'number' ? energyKj / 4.184 : undefined),
    perVolume ? 1350 : 950,
  );
  const protein = nutrient(n.proteins_100g, limit);
  const fat = nutrient(n.fat_100g, limit);
  const carbs = nutrient(n.carbohydrates_100g, limit);
  if (
    calories === undefined ||
    protein === undefined ||
    fat === undefined ||
    carbs === undefined ||
    protein + fat + carbs > limit
  )
    return null;
  const russianName = text(value.product_name_ru);
  const originalName = text(value.product_name);
  const name = russianName || originalName;
  const code = text(value.code);
  if (!name || !validBarcode(code)) return null;
  const now = new Date().toISOString();
  const updatedAt =
    typeof value.last_modified_t === 'number' &&
    value.last_modified_t > 0 &&
    value.last_modified_t <= 8.64e12
      ? new Date(value.last_modified_t * 1000).toISOString()
      : now;
  const image = text(value.image_front_small_url);
  const serving = measure(servingText);
  const pack =
    measure(packageText) ??
    measure(
      `${text(String(value.product_quantity ?? ''))} ${text(value.product_quantity_unit)}`,
    );
  const countries = Array.isArray(value.countries_tags)
    ? [
        ...new Set(
          value.countries_tags
            .map((country) =>
              text(country)
                .toLowerCase()
                .replace(/^[a-z]{2}:/, ''),
            )
            .filter(Boolean),
        ),
      ]
    : [];
  const aliases = [
    ...new Set(
      [
        originalName,
        russianName,
        text(value.generic_name_ru),
        text(value.generic_name),
      ].filter((alias) => alias && alias !== name),
    ),
  ];
  const sugar = nutrient(n.sugars_100g, limit);
  const fiber = nutrient(n.fiber_100g, limit);
  const saturatedFat = nutrient(n['saturated-fat_100g'], limit);
  const salt = nutrient(n.salt_100g, limit);
  const manufacturer = text(value.manufacturer);
  const sourceCategory = text(value.categories);
  return {
    id: `off-${code}`,
    name,
    brand:
      (Array.isArray(value.brands)
        ? value.brands
            .map(text)
            .map((brand) => brand.replace(/^xx:/i, ''))
            .filter(Boolean)
            .join(', ')
        : text(value.brands)) || undefined,
    barcode: code,
    category: sourceCategory || 'Готовые продукты',
    baseUnit: perVolume ? 'ml' : 'g',
    aliases: aliases.length ? aliases : undefined,
    per100: { calories, protein, fat, carbs },
    source: 'Open Food Facts · ODbL · данные сообщества, сверьте с этикеткой',
    isCustom: false,
    createdAt: now,
    updatedAt,
    servingMl: perVolume && serving?.unit === 'ml' ? serving.amount : undefined,
    servingGrams:
      !perVolume && serving?.unit === 'g' ? serving.amount : undefined,
    catalogDetails: {
      originalName: originalName || undefined,
      russianName: russianName || undefined,
      manufacturer: manufacturer || undefined,
      sourceCategory: sourceCategory || undefined,
      ingredients:
        text(value.ingredients_text_ru) ||
        text(value.ingredients_text) ||
        undefined,
      allergens: text(value.allergens) || undefined,
      countries: countries.length ? countries : undefined,
      packageText: packageText || undefined,
      packageAmount: pack?.amount,
      packageUnit: pack?.unit,
      sugar,
      fiber,
      saturatedFat,
      salt,
      completeness: [sugar, fiber, saturatedFat, salt].every(
        (amount) => amount !== undefined,
      )
        ? 'extended'
        : 'macros',
      url: `${origin}/product/${code}`,
      license: 'ODbL',
    },
    imageUrl: image.startsWith('https://images.openfoodfacts.org/')
      ? image
      : undefined,
  };
}
type Request = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

type OffErrorKind =
  | 'invalid-request'
  | 'access-denied'
  | 'rate-limit'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'invalid-response'
  | 'incomplete';

class OffError extends Error {
  constructor(
    readonly kind: OffErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OffError';
  }
}

function httpError(status: number) {
  if (status === 429)
    return new OffError(
      'rate-limit',
      'Лимит Open Food Facts. Подождите минуту.',
      status,
    );
  if (status === 401 || status === 403)
    return new OffError(
      'access-denied',
      `Open Food Facts отклонил доступ (HTTP ${status}).`,
      status,
    );
  if (status >= 400 && status < 500)
    return new OffError(
      'invalid-request',
      `Open Food Facts отклонил запрос (HTTP ${status}).`,
      status,
    );
  return new OffError(
    'unavailable',
    `Open Food Facts временно недоступен (HTTP ${status}).`,
    status,
  );
}

function invalidResponse() {
  return new OffError(
    'invalid-response',
    'Open Food Facts вернул некорректный ответ.',
  );
}

const fields =
  'code,product_name,product_name_ru,generic_name,generic_name_ru,brands,manufacturer,categories,categories_tags,countries_tags,nutriments,nutrition_data_per,no_nutrition_data,serving_size,quantity,product_quantity,product_quantity_unit,ingredients_text,ingredients_text_ru,allergens,last_modified_t,image_front_small_url';
export function createOffClient(
  request: Request = (input, init) => fetch(input, init),
) {
  let lastSearch = -Infinity;
  let recentBarcodes: number[] = [];
  async function get(url: string, signal?: AbortSignal, allowMissing = false) {
    if (signal?.aborted) throw new Error('Запрос отменён.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timer = setTimeout(abort, 10000);
    try {
      const response = await request(
        `${url}&fields=${fields}&app_name=MassTracker`,
        {
          signal: controller.signal,
          headers:
            Platform.OS === 'web'
              ? undefined
              : {
                  'User-Agent':
                    'MassTracker/0.1 (https://fitapp-epj.pages.dev)',
                },
        },
      );
      if (!response.ok && !(allowMissing && response.status === 404)) {
        throw httpError(response.status);
      }
      const json: unknown = await response.json();
      if (controller.signal.aborted) throw new Error('Запрос отменён.');
      return { json, status: response.status };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted)
        throw new OffError(
          'timeout',
          'Время ожидания истекло. Повторите поиск.',
        );
      if (error instanceof SyntaxError) throw invalidResponse();
      if (error instanceof TypeError)
        throw new OffError(
          'network',
          'Сетевой запрос к Open Food Facts завершился ошибкой. Локальные продукты доступны.',
        );
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    async search(query: string, signal?: AbortSignal) {
      const normalized = query.trim().replace(/\s+/g, ' ');
      if (normalized.length < 3)
        throw new OffError(
          'invalid-request',
          'Введите не менее трёх символов.',
        );
      if (Date.now() - lastSearch < 6500)
        throw new OffError(
          'rate-limit',
          'Подождите несколько секунд перед следующим онлайн-поиском.',
        );
      lastSearch = Date.now();
      const { json } = await get(
        `${searchOrigin}/search?q=${encodeURIComponent(normalized)}&langs=ru,en&page_size=20`,
        signal,
      );
      if (!record(json) || !Array.isArray(json.hits)) throw invalidResponse();
      const products = json.hits
        .map(parseOffProduct)
        .filter((p): p is FoodProduct => p !== null);
      return { products, incomplete: json.hits.length - products.length };
    },
    async barcode(code: string, signal?: AbortSignal) {
      if (!validBarcode(code))
        throw new OffError(
          'invalid-request',
          'Проверьте штрихкод и контрольную цифру.',
        );
      const now = Date.now();
      recentBarcodes = recentBarcodes.filter((time) => now - time < 60000);
      if (recentBarcodes.length >= 15)
        throw new OffError(
          'rate-limit',
          'Лимит проверки штрихкодов. Подождите минуту.',
        );
      recentBarcodes.push(now);
      const { json, status } = await get(
        `${origin}/api/v2/product/${code}.json?lc=ru`,
        signal,
        true,
      );
      if (!record(json)) throw invalidResponse();
      if (json.status === 0 && sameBarcode(text(json.code), code)) return null;
      if (status === 404 || json.status !== 1 || !record(json.product))
        throw invalidResponse();
      if (!sameBarcode(text(json.product.code), code)) throw invalidResponse();
      const product = parseOffProduct(json.product);
      if (!product)
        throw new OffError(
          'incomplete',
          'Товар найден. Для расчёта нужны полные КБЖУ на 100 г или 100 мл с этикетки.',
        );
      return product;
    },
  };
}
export const offClient = createOffClient();
