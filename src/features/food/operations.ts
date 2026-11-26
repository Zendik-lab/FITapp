import {
  checkDayNutrition,
  makeEntry,
  newId,
  parseDateKey,
  validateProduct,
  sameBarcode,
} from './domain';
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
  if (
    product.barcode &&
    state.products.some(
      (p) => p.id !== product.id && sameBarcode(p.barcode, product.barcode),
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
      e.id === id ? { ...updated, id, createdAt: entry.createdAt } : e,
    ),
  };
}
export function removeEntry(state: FoodState, id: string): FoodState {
  return { ...state, entries: state.entries.filter((e) => e.id !== id) };
}
export function copyMeal(
  state: FoodState,
  from: string,
  meal: MealType,
  to: string,
): FoodState {
  parseDateKey(to);
  return state.entries
    .filter((e) => e.date === from && e.meal === meal)
    .reduce(
      (s, e) =>
        addEntry(s, {
          ...e,
          id: newId(),
          date: to,
          createdAt: new Date().toISOString(),
        }),
      state,
    );
}
export function toggleFavorite(state: FoodState, productId: string): FoodState {
  return {
    ...state,
    favorites: state.favorites.some((f) => f.productId === productId)
      ? state.favorites.filter((f) => f.productId !== productId)
      : [...state.favorites, { productId }],
  };
}
