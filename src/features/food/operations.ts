import {
  checkDayNutrition,
  makeEntry,
  newId,
  parseDateKey,
  validateProduct,
  productMatchesBarcode,
} from './domain';
import { normalizeSearch } from './local-search';
import type {
  FoodState,
  FoodProduct,
  FoodDiaryEntry,
  FoodUnit,
  MealType,
} from './model';

export function saveProduct(state: FoodState, product: FoodProduct): FoodState {
  const errors = validateProduct(product).errors;
  if (errors.length) throw new Error(errors.join(' '));
  const codes = [
    ...(product.barcode ? [product.barcode] : []),
    ...(product.barcodes ?? []),
  ];
  if (
    state.products.some(
      (p) =>
        p.id !== product.id &&
        codes.some((code) => productMatchesBarcode(p, code)),
    )
  )
    throw new Error('Продукт с таким штрихкодом уже сохранён.');
  return {
    ...state,
    products: [...state.products.filter((p) => p.id !== product.id), product],
  };
}
export function deleteProduct(state: FoodState, id: string): FoodState {
  if (!state.products.find((p) => p.id === id)?.isCustom)
    throw new Error('Удалить можно только собственный продукт.');
  return {
    ...state,
    products: state.products.filter((p) => p.id !== id),
    favorites: state.favorites.filter((f) => f.productId !== id),
    recent: state.recent.filter((f) => f.productId !== id),
  };
}
export function addEntry(state: FoodState, entry: FoodDiaryEntry): FoodState {
  const entries = [...state.entries, entry];
  if (entry.recipe) {
    checkDayNutrition(entries, entry.date);
    return { ...state, entries };
  }
  return {
    ...state,
    entries,
    recent: [
      { productId: entry.product.id, usedAt: new Date().toISOString() },
      ...state.recent.filter((r) => r.productId !== entry.product.id),
    ].slice(0, 50),
  };
}
export function editEntry(
  state: FoodState,
  id: string,
  amount: number,
  unit: FoodUnit,
  meal: MealType,
  date: string,
): FoodState {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry || entry.recipe)
    throw new Error('Запись уже удалена. Обновите дневник.');
  const updated = makeEntry(entry.product, amount, unit, meal, date);
  return {
    ...state,
    entries: state.entries.map((e) =>
      e.id === id
        ? {
            ...updated,
            id,
            createdAt: entry.createdAt,
            copiedFrom: entry.copiedFrom,
          }
        : e,
    ),
  };
}
export function removeEntry(
  state: FoodState,
  id: string,
  expected?: FoodDiaryEntry,
): FoodState {
  if (
    expected &&
    JSON.stringify(state.entries.find((row) => row.id === id)) !==
      JSON.stringify(expected)
  )
    throw new Error('Запись изменилась. Откройте её заново.');
  return { ...state, entries: state.entries.filter((e) => e.id !== id) };
}
export function copyMeal(
  state: FoodState,
  from: string,
  meal: MealType,
  to: string,
): FoodState {
  return copyDay(state, from, to, meal);
}

export function restoreEntry(
  state: FoodState,
  entry: FoodDiaryEntry,
): FoodState {
  if (state.entries.some((row) => row.id === entry.id)) return state;
  return addEntry(state, entry);
}

export function copyDay(
  state: FoodState,
  from: string,
  to: string,
  meal?: MealType,
): FoodState {
  parseDateKey(from);
  parseDateKey(to);
  if (from === to) return state;
  const origins = new Set(
    state.entries
      .filter((entry) => entry.date === to)
      .map((entry) => entry.copiedFrom ?? entry.id),
  );
  return state.entries
    .filter((entry) => entry.date === from && (!meal || entry.meal === meal))
    .reduce((current, entry) => {
      const origin = entry.copiedFrom ?? entry.id;
      if (origins.has(origin)) return current;
      origins.add(origin);
      return addEntry(current, {
        ...entry,
        id: newId(),
        date: to,
        copiedFrom: origin,
        createdAt: new Date().toISOString(),
      });
    }, state);
}
export function toggleFavorite(state: FoodState, productId: string): FoodState {
  return {
    ...state,
    favorites: state.favorites.some((f) => f.productId === productId)
      ? state.favorites.filter((f) => f.productId !== productId)
      : [...state.favorites, { productId }],
  };
}

export function rememberProductQuery(
  state: FoodState,
  input: string,
): FoodState {
  const query = input.trim().replace(/\s+/g, ' ').slice(0, 120);
  const normalized = normalizeSearch(query);
  if (!normalized) return state;
  return {
    ...state,
    productSearchHistory: [
      query,
      ...(state.productSearchHistory ?? []).filter(
        (previous) => normalizeSearch(previous) !== normalized,
      ),
    ].slice(0, 8),
  };
}
