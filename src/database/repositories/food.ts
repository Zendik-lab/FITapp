import type { SettingsStorage } from '../settings-contract';
import {
  emptyFoodState,
  meals,
  type FoodProduct,
  type FoodState,
} from '@/features/food/model';
import {
  dateKey,
  gramsFor,
  parseDateKey,
  validateProduct,
} from '@/features/food/domain';

const key = 'food_diary_state';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function product(value: unknown): value is FoodProduct {
  if (!record(value) || !record(value.per100)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.isCustom !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    return false;
  for (const k of ['brand', 'barcode', 'imageUrl'])
    if (value[k] !== undefined && typeof value[k] !== 'string') return false;
  for (const k of ['gramsPerMl', 'pieceGrams', 'servingGrams'])
    if (
      value[k] !== undefined &&
      (typeof value[k] !== 'number' ||
        !Number.isFinite(value[k]) ||
        value[k] <= 0)
    )
      return false;
  return validateProduct(value as unknown as FoodProduct).errors.length === 0;
}
function valid(value: unknown): value is FoodState {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.products) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.favorites) ||
    !Array.isArray(value.recent)
  )
    return false;
  if (!value.products.every(product)) return false;
  if (
    !value.entries.every((e) => {
      if (
        !record(e) ||
        typeof e.id !== 'string' ||
        typeof e.date !== 'string' ||
        typeof e.meal !== 'string' ||
        !(e.meal in meals) ||
        !product(e.product) ||
        typeof e.amount !== 'number' ||
        !['g', 'ml', 'piece', 'serving'].includes(String(e.unit)) ||
        typeof e.createdAt !== 'string'
      )
        return false;
      try {
        return (
          dateKey(parseDateKey(e.date)) === e.date &&
          gramsFor(
            e.product,
            e.amount,
            e.unit as 'g' | 'ml' | 'piece' | 'serving',
          ) === e.grams
        );
      } catch {
        return false;
      }
    })
  )
    return false;
  return (
    value.favorites.every(
      (f) => record(f) && typeof f.productId === 'string',
    ) &&
    value.recent.every(
      (f) =>
        record(f) &&
        typeof f.productId === 'string' &&
        typeof f.usedAt === 'string',
    )
  );
}
export function createFoodRepository(storage: SettingsStorage) {
  async function read() {
    const raw = await storage.get(key);
    if (raw === null) return { raw, state: emptyFoodState() };
    try {
      const state: unknown = JSON.parse(raw);
      if (!valid(state)) throw new Error('schema');
      return { raw, state };
    } catch (cause) {
      throw new Error(
        'Дневник повреждён или имеет неподдерживаемую версию. Данные сохранены без изменений.',
        { cause },
      );
    }
  }
  return {
    load: async () => (await read()).state,
    async change(
      operation: (state: FoodState) => FoodState,
    ): Promise<FoodState> {
      const { raw, state } = await read();
      const next = operation(state);
      if (!valid(next)) throw new Error('Проверьте данные дневника.');
      await storage.apply([{ key, value: JSON.stringify(next) }], {
        key,
        value: raw,
      });
      return next;
    },
  };
}
