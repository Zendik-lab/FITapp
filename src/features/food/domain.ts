import type { NutritionTargets } from '@/features/nutrition/engine';
import {
  meals,
  type FoodDiaryEntry,
  type FoodProduct,
  type FoodUnit,
  type MealType,
} from './model';

export const nutrientKeys = ['calories', 'protein', 'fat', 'carbs'] as const;
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
  return {
    calories: food.per100.calories * factor,
    protein: food.per100.protein * factor,
    fat: food.per100.fat * factor,
    carbs: food.per100.carbs * factor,
  };
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
): FoodDiaryEntry {
  parseDateKey(date);
  if (!(meal in meals)) throw new Error('Выберите приём пищи.');
  if (validateProduct(product).errors.length)
    throw new Error('Проверьте продукт.');
  return {
    id: newId(),
    product: { ...product, per100: { ...product.per100 } },
    amount,
    unit,
    grams: gramsFor(product, amount, unit),
    meal,
    date,
    createdAt: new Date().toISOString(),
  };
}
export function sumEntries(
  entries: readonly FoodDiaryEntry[],
  date: string,
  meal?: MealType,
): NutritionTargets {
  return entries
    .filter((e) => e.date === date && (!meal || e.meal === meal))
    .reduce(
      (total, e) => {
        const values = portion(e.product, e.amount, e.unit);
        return {
          calories: total.calories + values.calories,
          protein: total.protein + values.protein,
          fat: total.fat + values.fat,
          carbs: total.carbs + values.carbs,
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
}
export function progress(consumed: number, goal: number) {
  return {
    remaining: Math.max(0, goal - consumed),
    over: Math.max(0, consumed - goal),
    percent: goal > 0 ? (consumed / goal) * 100 : 0,
  };
}
export function searchFoods(
  foods: readonly FoodProduct[],
  query: string,
): FoodProduct[] {
  const words = query.toLocaleLowerCase('ru').trim().split(/\s+/);
  return foods.filter(
    (food) =>
      sameBarcode(food.barcode, query.trim()) ||
      words.every((word) =>
        `${food.name} ${food.brand ?? ''} ${food.barcode ?? ''}`
          .toLocaleLowerCase('ru')
          .includes(word),
      ),
  );
}
