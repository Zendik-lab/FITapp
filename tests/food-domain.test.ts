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
  barcodeKey,
  normalizeScannedBarcode,
  sameBarcode,
  entryNutrition,
  gramsFor,
  makeEntry,
  unitsFor,
} from '@/features/food/domain';
import { makeIngredient } from '@/features/recipes/domain';
import { diaryCost } from '@/features/smart/planning';

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

test('GTIN-14 сохраняет ведущие нули, а камера различает UPC-E и EAN-8', () => {
  expect(barcodeKey('036000291452')).toBe('00036000291452');
  expect(barcodeKey('00036000291452')).toBe(barcodeKey('0036000291452'));
  expect(barcodeKey('10012345678902')).toBe('10012345678902');
  expect(barcodeKey('10012345678903')).toBeNull();
  expect(normalizeScannedBarcode('04252614', 'upc_e')).toBe('042100005264');
  expect(normalizeScannedBarcode('96385074', 'ean8')).toBe('96385074');
  expect(normalizeScannedBarcode('04252614', 'ean8')).toBeNull();
  expect(normalizeScannedBarcode('0036000291452', 'upc_a')).toBe(
    '0036000291452',
  );
  expect(normalizeScannedBarcode('036000291452', 'ean13')).toBe('036000291452');
  expect(normalizeScannedBarcode('00010016', 'ean8')).toBe('00010016');
  expect(normalizeScannedBarcode('00010016', 'upc_e')).toBe('000100001006');
  expect(barcodeKey('04252614')).toBe('00042100005264');
});

test('объёмная порция сохраняется в мл и остаётся неизвестной для учёта массы и цен', () => {
  const product = { ...food(), baseUnit: 'ml' as const, servingMl: 250 };
  expect(unitsFor(product)).toEqual(['ml', 'serving']);
  expect(portion(product, 125, 'ml').calories).toBe(437.5);
  const entry = makeEntry(product, 0.5, 'serving', 'snack', '2026-11-26');
  expect(entry).toMatchObject({ grams: null, milliliters: 125 });
  expect(entryNutrition(entry).calories).toBe(437.5);
  expect(() => gramsFor(product, 125, 'ml')).toThrow();
  expect(() => makeIngredient(product, 125, 'g')).toThrow();
  expect(
    diaryCost([entry], { [product.id]: { grams: 250, amount: 100 } }),
  ).toEqual({ amount: 0, unknown: 1 });
});
