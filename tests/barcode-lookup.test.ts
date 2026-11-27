import { lookupBarcode } from '@/features/food/barcode-lookup';
import { emptyFoodState, type FoodProduct } from '@/features/food/model';
import { saveProduct } from '@/features/food/operations';

function product(id: string, barcode = '96385074'): FoodProduct {
  return {
    id,
    barcode,
    name: `Продукт ${id}`,
    category: 'Готовые продукты',
    per100: { calories: 100, protein: 5, fat: 2, carbs: 15 },
    source: 'Тест',
    isCustom: id === 'custom',
    createdAt: '2026-11-26T09:00:00.000Z',
    updatedAt: '2026-11-26T09:00:00.000Z',
  };
}

function setup() {
  let state = emptyFoodState();
  const findPack = jest
    .fn<Promise<FoodProduct | null>, [string]>()
    .mockResolvedValue(null);
  const remote = jest
    .fn<Promise<FoodProduct | null>, [string, AbortSignal?]>()
    .mockResolvedValue(null);
  const session = {
    get state() {
      return state;
    },
    async change(operation: (current: typeof state) => typeof state) {
      state = operation(state);
    },
  };
  return {
    findPack,
    remote,
    session,
    online: true,
    builtins: [],
    signal: new AbortController().signal,
  };
}

test('приоритет штрихкода: встроенный товар, пакет, сохранённый товар', async () => {
  const options = setup();
  const builtin = product('builtin');
  const packed = product('pack');
  const custom = product('custom');
  await options.session.change((state) => saveProduct(state, custom));
  options.findPack.mockResolvedValueOnce(packed);
  await expect(
    lookupBarcode('96385074', { ...options, builtins: [builtin] }),
  ).resolves.toMatchObject({ product: builtin });
  expect(options.findPack).not.toHaveBeenCalled();
  await expect(lookupBarcode('96385074', options)).resolves.toMatchObject({
    product: packed,
  });
  await expect(lookupBarcode('96385074', options)).resolves.toMatchObject({
    product: custom,
  });
  expect(options.remote).not.toHaveBeenCalled();
});

test('найденный онлайн товар сохраняется один раз и находится офлайн по эквивалентному GTIN', async () => {
  const options = setup();
  const found = product('online', '036000291452');
  options.remote.mockResolvedValueOnce(found);
  await expect(lookupBarcode('036000291452', options)).resolves.toMatchObject({
    product: found,
    saved: true,
  });
  await expect(
    lookupBarcode('00036000291452', { ...options, online: false }),
  ).resolves.toMatchObject({ product: found });
  expect(options.session.state.products).toEqual([found]);
  await expect(
    lookupBarcode('96385074', { ...options, online: false }),
  ).resolves.toBeNull();
  expect(options.remote).toHaveBeenCalledTimes(1);
});

test('отмена локального чтения исключает сетевой запрос', async () => {
  const options = setup();
  const controller = new AbortController();
  options.findPack.mockImplementationOnce(async () => {
    controller.abort();
    return null;
  });
  await expect(
    lookupBarcode('96385074', { ...options, signal: controller.signal }),
  ).resolves.toBeNull();
  expect(options.remote).not.toHaveBeenCalled();
});

test('сохранённый штрихкод доступен при отказе отдельного хранилища пакетов', async () => {
  const options = setup();
  const saved = product('custom');
  await options.session.change((state) => saveProduct(state, saved));
  options.findPack.mockRejectedValueOnce(
    new Error('Хранилище пакетов недоступно'),
  );
  await expect(
    lookupBarcode('96385074', { ...options, online: false }),
  ).resolves.toEqual({ product: saved, saved: false });
  expect(options.remote).not.toHaveBeenCalled();
});
