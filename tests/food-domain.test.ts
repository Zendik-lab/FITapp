import { builtinFoods } from '@/features/food/catalog';
import {
  dateKey,
  parseDateKey,
  portion,
  sumEntries,
  progress,
  searchFoods,
  validateProduct,
  validBarcode,
  sameBarcode,
  makeEntry,
  unitsFor,
} from '@/features/food/domain';

const food = () => ({
  ...builtinFoods[0],
  per100: { calories: 350, protein: 12, fat: 2, carbs: 70 },
});
test('порция без промежуточного округления и только известные единицы', () => {
  expect(portion(food(), 150, 'g')).toEqual({
    calories: 525,
    protein: 18,
    fat: 3,
    carbs: 105,
  });
  expect(unitsFor(food())).toEqual(['g']);
  expect(() => portion(food(), 100, 'ml')).toThrow();
  expect(
    portion({ ...food(), gramsPerMl: 1.03 }, 100, 'ml').calories,
  ).toBeCloseTo(360.5);
});
test('даты являются локальными календарными днями', () => {
  const date = new Date(2026, 10, 26, 23, 59);
  expect(dateKey(date)).toBe('2026-11-26');
  expect(dateKey(parseDateKey('2026-11-26'))).toBe('2026-11-26');
  expect(() => parseDateKey('2026-02-30')).toThrow();
});
test('суммы разделены по дате и приёму, превышение без отрицательного остатка', () => {
  const entries = [
    makeEntry(food(), 150, 'g', 'breakfast', '2026-11-26'),
    makeEntry(food(), 100, 'g', 'dinner', '2026-11-27'),
  ];
  expect(sumEntries(entries, '2026-11-26').calories).toBe(525);
  expect(sumEntries(entries, '2026-11-26', 'dinner').calories).toBe(0);
  expect(progress(525, 500)).toEqual({ remaining: 0, over: 25, percent: 105 });
});
test('100+ уникальных справочных продуктов, регистр и пробелы поиска', () => {
  expect(builtinFoods.length).toBeGreaterThanOrEqual(100);
  expect(new Set(builtinFoods.map((f) => f.id)).size).toBe(builtinFoods.length);
  expect(searchFoods(builtinFoods, '  РИС   сухой ').length).toBeGreaterThan(0);
  expect(
    builtinFoods.every((f) => validateProduct(f).errors.length === 0),
  ).toBe(true);
});
test('валидация не принимает пустые/отрицательные/нечисловые значения и предупреждает', () => {
  expect(
    validateProduct({ ...food(), name: ' ' }).errors.length,
  ).toBeGreaterThan(0);
  expect(
    validateProduct({ ...food(), per100: { ...food().per100, protein: -1 } })
      .errors.length,
  ).toBeGreaterThan(0);
  expect(
    validateProduct({ ...food(), per100: { ...food().per100, calories: NaN } })
      .errors.length,
  ).toBeGreaterThan(0);
  expect(
    validateProduct({
      ...food(),
      per100: { calories: 900, protein: 100, fat: 100, carbs: 100 },
    }).warnings.length,
  ).toBeGreaterThan(0);
});
test('штрихкоды проверяются по длине и контрольной цифре, включая UPC-E', () => {
  for (const code of ['4006381333931', '96385074', '036000291452', '04252614'])
    expect(validBarcode(code)).toBe(true);
  for (const code of ['123', '4006381333932', 'abcd1234'])
    expect(validBarcode(code)).toBe(false);
});

test('UPC-A и EAN-13 с ведущим нулём обозначают один локальный продукт', () => {
  expect(sameBarcode('036000291452', '0036000291452')).toBe(true);
  expect(sameBarcode('96385074', '4006381333931')).toBe(false);
  expect(sameBarcode(undefined, '4006381333931')).toBe(false);
  expect(
    searchFoods(
      [{ ...builtinFoods[0], barcode: '036000291452' }],
      '0036000291452',
    ),
  ).toHaveLength(1);
});
