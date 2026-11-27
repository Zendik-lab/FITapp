import { decodeCatalogChunk } from '@/features/catalog/catalog-chunk';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { barcodeKey, searchFoods } from '@/features/food/domain';
import { builtinFoods } from '@/features/food/catalog';
import { catalogCore } from '@/features/food/catalog-core-data';
import {
  parseCatalogManifest,
  unpackCatalogProduct,
  type PackedProduct,
} from '@/features/catalog/catalog-format';

const row: PackedProduct = [
  '036000291452',
  'Шоколад',
  12,
  'Snickers',
  450,
  10,
  20,
  55,
  { countries: ['kazakhstan'], package: [70, 'g'], sugar: 0 },
];

test('uses label basis and keeps the original barcode and unknown data', () => {
  const product = unpackCatalogProduct(row, 'off');
  expect(product.barcode).toBe('036000291452');
  expect(product.catalogDetails).toMatchObject({
    countries: ['kazakhstan'],
    packageAmount: 70,
    sugar: 0,
  });
  expect(product.catalogDetails?.fiber).toBeUndefined();
  expect(product.aliases).toContain('сникерс');
});

test('rejects altered chunks and mismatched totals before exposing rows', () => {
  const raw = Buffer.from(JSON.stringify([row]));
  const bytes = gzipSync(raw);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = {
    path: `kazakhstan/${sha256}.json.gz`,
    bytes: bytes.length,
    rawBytes: raw.length,
    count: 1,
    sha256,
  };
  const pack = {
    id: 'kazakhstan',
    version: '123456789012345678901234',
    title: 'Казахстан',
    source: 'off',
    sourceUrl: 'https://static.openfoodfacts.org/data/test',
    license: 'ODbL-1.0',
    count: 1,
    bytes: bytes.length,
    rawBytes: raw.length,
    files: [file],
  };
  expect(parseCatalogManifest({ schema: 1, packages: [pack] })).toEqual([pack]);
  expect(() =>
    parseCatalogManifest({ schema: 1, packages: [{ ...pack, count: 2 }] }),
  ).toThrow();
  expect(decodeCatalogChunk(bytes, file)).toEqual([row]);
  bytes[0] = 0;
  expect(() => decodeCatalogChunk(bytes, file)).toThrow();
});

test('finds 100 real imported regional barcodes from the built-in catalog', () => {
  const byBarcode = new Map(
    builtinFoods.flatMap((product) =>
      product.barcode ? [[barcodeKey(product.barcode), product] as const] : [],
    ),
  );
  expect(catalogCore.length).toBeGreaterThanOrEqual(100);
  expect(byBarcode.size).toBe(catalogCore.length);
  for (const [code, name] of catalogCore.slice(0, 100)) {
    const key = barcodeKey(code);
    expect(key).not.toBeNull();
    expect(byBarcode.get(key)?.name).toBe(name);
    expect(searchFoods([byBarcode.get(key)!], code)[0]?.barcode).toBe(code);
  }
});

test('finds imported brands with Russian and Latin queries', () => {
  const matches = (query: string, brand: RegExp) =>
    searchFoods(builtinFoods, query).some(
      (product) => product.barcode && brand.test(product.brand ?? ''),
    );
  expect(matches('сникерс', /snickers|сникерс/i)).toBe(true);
  expect(matches('Snickers', /snickers|сникерс/i)).toBe(true);
  expect(matches('молоко фудмастер', /food\s*master|фудмастер/i)).toBe(true);
});
