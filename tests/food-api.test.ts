import { parseOffProduct, createOffClient } from '@/features/food/off-api';
const raw = {
  code: '4006381333931',
  product_name: 'Продукт',
  brands: 'Бренд',
  nutriments: {
    'energy-kcal_100g': 350,
    proteins_100g: 12,
    fat_100g: 2,
    carbohydrates_100g: 70,
  },
};
test('OFF проверяет неизвестный JSON и не подставляет нули вместо отсутствующих полей', () => {
  expect(parseOffProduct(raw)?.per100.calories).toBe(350);
  expect(
    parseOffProduct({ ...raw, nutriments: { proteins_100g: 12 } }),
  ).toBeNull();
  expect(
    parseOffProduct({
      ...raw,
      nutriments: { ...raw.nutriments, fat_100g: -1 },
    }),
  ).toBeNull();
  expect(parseOffProduct(null)).toBeNull();
  expect(parseOffProduct({ ...raw, nutrition_data_per: '100ml' })).toBeNull();
  expect(
    parseOffProduct({
      ...raw,
      nutrition_data_per: '100g',
      serving_size: '250 ml',
    }),
  ).toBeNull();
  expect(parseOffProduct({ ...raw, quantity: '1 L' })).toBeNull();
  expect(parseOffProduct({ ...raw, serving_size: '250 мл' })).toBeNull();
  expect(parseOffProduct({ ...raw, serving_size: '250мл' })).toBeNull();
  expect(parseOffProduct({ ...raw, quantity: '1 л' })).toBeNull();
  expect(parseOffProduct({ ...raw, product_quantity_unit: 'ml' })).toBeNull();
  expect(
    parseOffProduct({ ...raw, categories_tags: ['en:beverages'] }),
  ).toBeNull();
  expect(parseOffProduct({ ...raw, no_nutrition_data: 'on' })).toBeNull();
});
test('поиск, штрихкод, сеть и ограничение частоты', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products: [raw, {}], product: raw, status: 1 }),
  });
  const client = createOffClient(request);
  const result = await client.search('Тест');
  expect(result.products).toHaveLength(1);
  expect(result.incomplete).toBe(1);
  await expect(client.search('Другой')).rejects.toThrow(/Подождите/);
  expect((await client.barcode(raw.code))?.name).toBe('Продукт');
  const offline = createOffClient(
    jest.fn().mockRejectedValue(new TypeError('offline')),
  );
  await expect(offline.barcode(raw.code)).rejects.toThrow(/сети|интернет/);
});

test('таймаут запроса, отмена и HTTP лимит не подменяются пустыми продуктами', async () => {
  jest.useFakeTimers();
  try {
    const request = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Pick<Response, 'ok' | 'status' | 'json'>>(
          (_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          },
        ),
    );
    const result = createOffClient(request).barcode(raw.code);
    const assertion = expect(result).rejects.toThrow(/Время ожидания/);
    await jest.advanceTimersByTimeAsync(10001);
    await assertion;
    const controller = new AbortController();
    const cancelled = createOffClient(request).barcode(
      raw.code,
      controller.signal,
    );
    const cancelledAssertion = expect(cancelled).rejects.toThrow('aborted');
    controller.abort();
    await cancelledAssertion;
    await expect(
      createOffClient(
        jest.fn().mockResolvedValue({ ok: false, status: 429 }),
      ).barcode(raw.code),
    ).rejects.toThrow(/Лимит/);
  } finally {
    jest.useRealTimers();
  }
});
