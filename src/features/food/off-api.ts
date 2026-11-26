import { Platform } from 'react-native';
import { sameBarcode, validBarcode } from './domain';
import type { FoodProduct } from './model';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
export function parseOffProduct(value: unknown): FoodProduct | null {
  if (!record(value) || !record(value.nutriments)) return null;
  // OFF's _100g fields may actually describe 100 ml: no density is inferred.
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
    value.nutrition_data_per === '100ml' ||
    volume.test(text(value.serving_size)) ||
    volume.test(text(value.quantity)) ||
    ['ml', 'cl', 'dl', 'l', 'мл', 'л'].includes(
      text(value.product_quantity_unit).toLowerCase(),
    ) ||
    (Array.isArray(value.categories_tags) &&
      value.categories_tags.some((tag) =>
        liquidCategories.includes(String(tag)),
      ))
  )
    return null;
  const n = value.nutriments;
  const calories =
    n['energy-kcal_100g'] ??
    (typeof n.energy_100g === 'number' ? n.energy_100g / 4.184 : undefined);
  const numbers = [calories, n.proteins_100g, n.fat_100g, n.carbohydrates_100g];
  if (
    !numbers.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
  )
    return null;
  const name = text(value.product_name_ru) || text(value.product_name);
  const code = text(value.code);
  if (!name || !validBarcode(code)) return null;
  const [energy, protein, fat, carbs] = numbers as number[];
  const now = new Date().toISOString();
  const image = text(value.image_front_small_url);
  return {
    id: `off-${code}`,
    name,
    brand: text(value.brands) || undefined,
    barcode: code,
    category: text(value.categories) || 'Готовые продукты',
    per100: { calories: energy, protein, fat, carbs },
    source: 'Open Food Facts · ODbL · данные сообщества, сверьте с этикеткой',
    isCustom: false,
    createdAt: now,
    updatedAt: now,
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

const origin = 'https://world.openfoodfacts.org';
const fields =
  'code,product_name,product_name_ru,brands,categories,categories_tags,nutriments,nutrition_data_per,no_nutrition_data,serving_size,quantity,product_quantity_unit,image_front_small_url';
export function createOffClient(
  request: Request = (input, init) => fetch(input, init),
) {
  let lastSearch = -Infinity;
  let recentBarcodes: number[] = [];
  async function get(path: string, signal?: AbortSignal, allowMissing = false) {
    if (signal?.aborted) throw new Error('Запрос отменён.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timer = setTimeout(abort, 10000);
    try {
      const response = await request(
        `${origin}${path}&fields=${fields}&app_name=MassTracker`,
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
        `/cgi/search.pl?search_terms=${encodeURIComponent(normalized)}&search_simple=1&action=process&json=1&page_size=20`,
        signal,
      );
      if (!record(json) || !Array.isArray(json.products))
        throw invalidResponse();
      const products = json.products
        .map(parseOffProduct)
        .filter((p): p is FoodProduct => p !== null);
      return { products, incomplete: json.products.length - products.length };
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
        `/api/v2/product/${code}.json?lc=ru`,
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
          'Продукт найден. Полных данных о пищевой ценности на 100 г нет.',
        );
      return product;
    },
  };
}
export const offClient = createOffClient();
