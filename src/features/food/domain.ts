import { normalizeSearch, searchTerms, wordScore } from './local-search';
import type { NutritionTargets } from '@/features/nutrition/engine';
import {
  meals,
  type FoodDiaryEntry,
  type FoodProduct,
  type FoodUnit,
  type MealType,
  type ProductDiaryEntry,
  type RecipeDiaryEntry,
} from './model';
import type { RecipeNutritionSnapshot } from '@/features/recipes/model';

export const nutrientKeys = ['calories', 'protein', 'fat', 'carbs'] as const;
export const zeroNutrition: NutritionTargets = {
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
};
export function validNutrition(value: unknown): value is NutritionTargets {
  return (
    typeof value === 'object' &&
    value !== null &&
    nutrientKeys.every((key) => {
      const amount = (value as Partial<NutritionTargets>)[key];
      return (
        typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
      );
    })
  );
}
function multiplyNutrition(
  values: NutritionTargets,
  factor: number,
): NutritionTargets {
  return {
    calories: values.calories * factor,
    protein: values.protein * factor,
    fat: values.fat * factor,
    carbs: values.carbs * factor,
  };
}
export function scaleNutrition(
  values: NutritionTargets,
  factor: number,
): NutritionTargets {
  const result = multiplyNutrition(values, factor);
  if (!validNutrition(result))
    throw new Error('Значение КБЖУ выходит за пределы допустимого.');
  return result;
}
export function addNutrition(
  a: NutritionTargets,
  b: NutritionTargets,
): NutritionTargets {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
  };
}
export function parseDecimal(value: string): number {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim())
    ? Number(value.trim().replace(',', '.'))
    : NaN;
}
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDateKey(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Укажите дату ГГГГ-ММ-ДД.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (dateKey(date) !== value) throw new Error('Такой даты нет в календаре.');
  return date;
}
export function validBarcode(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(value)) return false;
  function checksum(code: string) {
    const digits = [...code].map(Number);
    const check = digits.pop();
    return (
      (10 -
        (digits
          .reverse()
          .reduce((sum, n, i) => sum + n * (i % 2 === 0 ? 3 : 1), 0) %
          10)) %
        10 ===
      check
    );
  }
  if (checksum(value)) return true;
  if (value.length !== 8 || !/^[01]/.test(value)) return false;
  const [ns, a, b, c, d, e, f, check] = value;
  const expanded = /[012]/.test(f)
    ? `${ns}${a}${b}${f}0000${c}${d}${e}${check}`
    : f === '3'
      ? `${ns}${a}${b}${c}00000${d}${e}${check}`
      : f === '4'
        ? `${ns}${a}${b}${c}${d}00000${e}${check}`
        : `${ns}${a}${b}${c}${d}${e}0000${f}${check}`;
  return checksum(expanded);
}
/** iOS can report UPC-A as EAN-13 with a leading zero. */
export function sameBarcode(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) return false;
  const canonical = (code: string) => (code.length === 12 ? `0${code}` : code);
  return canonical(left) === canonical(right);
}
export function validateProduct(product: FoodProduct) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!product.name.trim()) errors.push('Укажите название продукта.');
  if (!product.category.trim()) errors.push('Выберите категорию.');
  if (product.barcode && !validBarcode(product.barcode))
    errors.push('Проверьте штрихкод и контрольную цифру.');
  if (
    nutrientKeys.some(
      (key) => !Number.isFinite(product.per100[key]) || product.per100[key] < 0,
    )
  )
    errors.push('Пищевая ценность должна содержать неотрицательные числа.');
  const { calories, protein, fat, carbs } = product.per100;
  if (
    calories > 950 ||
    protein + fat + carbs > 105 ||
    Math.abs(calories - (protein * 4 + fat * 9 + carbs * 4)) >
      Math.max(50, calories * 0.3)
  )
    warnings.push(
      'Значения выглядят необычно. Сверьте их с этикеткой: энергия и БЖУ могут отличаться из-за клетчатки и округления.',
    );
  return { errors, warnings };
}
export function unitsFor(food: FoodProduct): FoodUnit[] {
  return [
    'g' as const,
    ...(food.gramsPerMl ? ['ml' as const] : []),
    ...(food.pieceGrams ? ['piece' as const] : []),
    ...(food.servingGrams ? ['serving' as const] : []),
  ];
}
export function gramsFor(
  food: FoodProduct,
  amount: number,
  unit: FoodUnit,
): number {
  const factor = {
    g: 1,
    ml: food.gramsPerMl,
    piece: food.pieceGrams,
    serving: food.servingGrams,
  }[unit];
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100000 ||
    !factor ||
    !Number.isFinite(amount * factor)
  )
    throw new Error('Укажите количество от 0 до 100 000 в доступной единице.');
  return amount * factor;
}
export function portion(
  food: FoodProduct,
  amount: number,
  unit: FoodUnit,
): NutritionTargets {
  const factor = gramsFor(food, amount, unit) / 100;
  return scaleNutrition(food.per100, factor);
}
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function makeEntry(
  product: FoodProduct,
  amount: number,
  unit: FoodUnit,
  meal: MealType,
  date: string,
): ProductDiaryEntry {
  parseDateKey(date);
  if (!(meal in meals)) throw new Error('Выберите приём пищи.');
  if (validateProduct(product).errors.length)
    throw new Error('Проверьте продукт.');
  const grams = gramsFor(product, amount, unit);
  scaleNutrition(product.per100, grams / 100);
  return {
    id: newId(),
    product: { ...product, per100: { ...product.per100 } },
    amount,
    unit,
    grams,
    meal,
    date,
    createdAt: new Date().toISOString(),
  };
}
export function recipePortion(
  recipe: RecipeNutritionSnapshot,
  amount: number,
  unit: RecipeDiaryEntry['unit'],
) {
  const weight = recipe.cookedWeightGrams;
  const denominator = unit === 'g' ? weight : recipe.servings;
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !denominator ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  )
    throw new Error('Введите положительное количество в доступной единице.');
  const factor = amount / denominator;
  const grams =
    unit === 'g' ? amount : weight === undefined ? null : weight * factor;
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0))
    throw new Error('Проверьте вес блюда.');
  return { grams, values: scaleNutrition(recipe.total, factor) };
}
export function entryNutrition(entry: FoodDiaryEntry) {
  return entry.recipe
    ? recipePortion(entry.recipe, entry.amount, entry.unit).values
    : // Older versions could store portions with an overflowing result.
      multiplyNutrition(entry.product.per100, entry.grams / 100);
}
export function sumEntries(
  entries: readonly FoodDiaryEntry[],
  date: string,
  meal?: MealType,
): NutritionTargets {
  return entries
    .filter((e) => e.date === date && (!meal || e.meal === meal))
    .reduce(
      (total, e) => addNutrition(total, entryNutrition(e)),
      zeroNutrition,
    );
}
export function checkDayNutrition(
  entries: readonly FoodDiaryEntry[],
  date: string,
) {
  if (!validNutrition(sumEntries(entries, date)))
    throw new Error('Итоговое КБЖУ за день выходит за пределы допустимого.');
}
export function progress(consumed: number, goal: number) {
  return {
    remaining: Math.max(0, goal - consumed),
    over: Math.max(0, consumed - goal),
    percent: goal > 0 ? (consumed / goal) * 100 : 0,
  };
}
const foodSearchTerms = new WeakMap<
  FoodProduct,
  {
    title: string;
    name: string[];
    descriptors: string[];
  }
>();

export function searchFoods(
  foods: readonly FoodProduct[],
  query: string,
): FoodProduct[] {
  const terms = searchTerms(query);
  if (!terms.length) return [...foods];
  const phrase = normalizeSearch(query);
  const barcode = query.trim();
  return foods
    .flatMap((food) => {
      if (sameBarcode(food.barcode, barcode)) return [{ food, score: 1000 }];
      let indexed = foodSearchTerms.get(food);
      if (!indexed) {
        indexed = {
          title: normalizeSearch(food.name),
          name: searchTerms(food.name),
          descriptors: searchTerms(
            [
              food.brand,
              food.barcode,
              food.category,
              ...(food.aliases ?? []),
            ].join(' '),
          ),
        };
        foodSearchTerms.set(food, indexed);
      }
      let score = indexed.title === phrase ? 100 : 0;
      for (const term of terms) {
        const match = Math.max(
          wordScore(term, indexed.name) * 2,
          wordScore(term, indexed.descriptors),
        );
        if (!match) return [];
        score += match;
      }
      return [{ food, score }];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ food }) => food);
}
