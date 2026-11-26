import { Platform } from 'react-native';
import { validBarcode } from './domain';
import type { FoodProduct } from './model';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
const fields =
  'code,product_name,product_name_ru,brands,categories,categories_tags,nutriments,nutrition_data_per,no_nutrition_data,serving_size,quantity,product_quantity_unit,image_front_small_url';
export function createOffClient(
  request: Request = (input, init) => fetch(input, init),
) {
  let lastSearch = 0;
  async function get(url: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort);
    const timer = setTimeout(abort, 10000);
    try {
      const response = await request(url, {
        signal: controller.signal,
        headers:
          Platform.OS === 'web'
            ? {}
            : { 'User-Agent': 'MassTracker/0.1 (personal nutrition diary)' },
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Лимит Open Food Facts. Подождите минуту.'
            : 'Open Food Facts временно недоступен.',
        );
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted)
        throw new Error('Время ожидания истекло. Повторите поиск.');
      if (error instanceof TypeError)
        throw new Error(
          'Нет связи с Open Food Facts. Проверьте интернет; локальные продукты доступны.',
        );
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    async search(query: string, signal?: AbortSignal) {
      if (query.trim().length < 3)
        throw new Error('Введите не менее трёх символов.');
      if (Date.now() - lastSearch < 6500)
        throw new Error(
          'Подождите несколько секунд перед следующим онлайн-поиском.',
        );
      lastSearch = Date.now();
      // Browser cannot override User-Agent; OFF supports identification through the app query.
      const json = await get(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query.trim())}&search_simple=1&action=process&json=1&page_size=20&fields=${fields}&app_name=MassTracker`,
        signal,
      );
      if (!record(json) || !Array.isArray(json.products))
        throw new Error('Не удалось прочитать ответ Open Food Facts.');
      const products = json.products
        .map(parseOffProduct)
        .filter((p): p is FoodProduct => p !== null);
      return { products, incomplete: json.products.length - products.length };
    },
    async barcode(code: string, signal?: AbortSignal) {
      if (!validBarcode(code))
        throw new Error('Проверьте штрихкод и контрольную цифру.');
      const json = await get(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}&app_name=MassTracker`,
        signal,
      );
      if (!record(json))
        throw new Error('Не удалось прочитать ответ Open Food Facts.');
      return parseOffProduct(json.product);
    },
  };
}
export const offClient = createOffClient();
