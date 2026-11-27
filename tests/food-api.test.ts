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

test('OFF сохраняет подтверждённую основу на 100 мл и только присутствующие метаданные', () => {
  expect(
    parseOffProduct({
      ...raw,
      product_name_ru: 'Напиток',
      nutrition_data_per: '100ml',
      serving_size: '250 мл',
      quantity: '1 L',
      countries_tags: ['en:kazakhstan'],
      allergens: 'en:milk',
      nutriments: { ...raw.nutriments, sugars_100g: 0 },
    }),
  ).toMatchObject({
    baseUnit: 'ml',
    servingMl: 250,
    catalogDetails: {
      russianName: 'Напиток',
      originalName: raw.product_name,
      packageAmount: 1000,
      packageUnit: 'ml',
      countries: ['kazakhstan'],
      allergens: 'en:milk',
      sugar: 0,
    },
  });
  expect(
    parseOffProduct({ ...raw, nutrition_data_per: '100ml' })?.catalogDetails
      ?.fiber,
  ).toBeUndefined();
  expect(
    parseOffProduct({
      ...raw,
      nutrition_data_per: '100ml',
      nutriments: { ...raw.nutriments, proteins_100g: 500 },
    }),
  ).toBeNull();
});
test('поиск, штрихкод, сеть и ограничение частоты', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      hits: [{ ...raw, brands: ['xx:Snickers'] }, {}],
      product: raw,
      status: 1,
    }),
  });
  const client = createOffClient(request);
  const result = await client.search('Тест');
  expect(result.products).toHaveLength(1);
  expect(result.products[0].brand).toBe('Snickers');
  expect(result.incomplete).toBe(1);
  await expect(client.search('Другой')).rejects.toThrow(/Подождите/);
  expect((await client.barcode(raw.code))?.name).toBe('Продукт');
  const offline = createOffClient(
    jest.fn().mockRejectedValue(new TypeError('offline')),
  );
  await expect(offline.barcode(raw.code)).rejects.toThrow(/Сетевой запрос/);
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

test.each([200, 404])(
  'отсутствие товара по штрихкоду в ответе HTTP %i',
  async (status) => {
    const client = createOffClient(
      jest.fn().mockResolvedValue({
        ok: status === 200,
        status,
        json: async () => ({ code: raw.code, status: 0 }),
      }),
    );
    await expect(client.barcode(raw.code)).resolves.toBeNull();
  },
);

test('найденный продукт с неполными КБЖУ отличается от отсутствующего', async () => {
  const client = createOffClient(
    jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, product: { code: raw.code } }),
    }),
  );
  await expect(client.barcode(raw.code)).rejects.toMatchObject({
    kind: 'incomplete',
  });
});

test.each([
  [400, 'invalid-request'],
  [403, 'access-denied'],
  [422, 'invalid-request'],
  [429, 'rate-limit'],
  [503, 'unavailable'],
])('HTTP %i сохраняет причину ошибки', async (status, kind) => {
  const client = createOffClient(
    jest.fn().mockResolvedValue({ ok: false, status }),
  );
  await expect(client.barcode(raw.code)).rejects.toMatchObject({
    kind,
    status,
  });
});

test('сетевой сбой и невалидный ответ различаются', async () => {
  const transport = createOffClient(
    jest.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  );
  await expect(transport.barcode(raw.code)).rejects.toMatchObject({
    kind: 'network',
  });
  const invalid = createOffClient(
    jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected HTML');
      },
    }),
  );
  await expect(invalid.barcode(raw.code)).rejects.toMatchObject({
    kind: 'invalid-response',
  });
});

test('поиск кодирует имя продукта, а неверная контрольная цифра не отправляется', async () => {
  const request = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ hits: [] }),
  });
  const client = createOffClient(request);
  await expect(client.barcode('4006381333932')).rejects.toMatchObject({
    kind: 'invalid-request',
  });
  expect(request).not.toHaveBeenCalled();
  await expect(client.search('  Чай  & мёд  ')).resolves.toEqual({
    products: [],
    incomplete: 0,
  });
  const url = new URL(request.mock.calls[0][0]);
  expect(url.origin + url.pathname).toBe(
    'https://search.openfoodfacts.org/search',
  );
  expect(url.searchParams.get('q')).toBe('Чай & мёд');
});

test('поиск принимает номер UPC-A с ведущим нулём, добавленным сервисом', async () => {
  const normalized = { ...raw, code: '0034000470693' };
  const request = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 1, product: normalized }),
  });
  await expect(
    createOffClient(request).barcode('034000470693'),
  ).resolves.toMatchObject({ barcode: normalized.code });
});

test('проверка штрихкодов учитывает минутный лимит API', async () => {
  jest.useFakeTimers();
  try {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, product: raw }),
    });
    const client = createOffClient(request);
    for (let i = 0; i < 15; i++) await client.barcode(raw.code);
    await expect(client.barcode(raw.code)).rejects.toMatchObject({
      kind: 'rate-limit',
    });
    expect(request).toHaveBeenCalledTimes(15);
    await jest.advanceTimersByTimeAsync(60000);
    await expect(client.barcode(raw.code)).resolves.toMatchObject({
      barcode: raw.code,
    });
  } finally {
    jest.useRealTimers();
  }
});
