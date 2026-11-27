/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { createFoodRepository } from '@/database/repositories/food';
import {
  addEntry,
  editEntry,
  removeEntry,
  copyMeal,
  saveProduct,
  deleteProduct,
  toggleFavorite,
} from '@/features/food/operations';
import { builtinFoods } from '@/features/food/catalog';
import { makeEntry, sumEntries } from '@/features/food/domain';
import { emptyFoodState } from '@/features/food/model';

test('сохранённый по штрихкоду напиток и его порция переживают перезапуск', async () => {
  const factory = new IDBFactory();
  const repo = createFoodRepository(await openIndexedDbSettings(factory));
  const product = {
    ...builtinFoods[0],
    id: 'off-4006381333931',
    barcode: '4006381333931',
    baseUnit: 'ml' as const,
    servingMl: 250,
    gramsPerMl: undefined,
    catalogDetails: { countries: ['en:kazakhstan'], sugar: 0 },
  };
  await repo.change((s) => saveProduct(s, product));
  await repo.change((s) =>
    addEntry(s, makeEntry(product, 0.5, 'serving', 'snack', '2026-11-26')),
  );
  const reopened = createFoodRepository(await openIndexedDbSettings(factory));
  const state = await reopened.load();
  expect(state.products[0]).toMatchObject({
    barcode: product.barcode,
    catalogDetails: product.catalogDetails,
  });
  expect(state.entries[0]).toMatchObject({ grams: null, milliliters: 125 });
  expect(sumEntries(state.entries, '2026-11-26').calories).toBe(
    product.per100.calories * 1.25,
  );
});

test('CRUD, перенос, копии, снимки, избранное и недавние переживают повторное открытие', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  await storage.apply([{ key: 'user_state', value: 'preserve' }]);
  const repo = createFoodRepository(storage);
  const product = { ...builtinFoods[0], id: 'custom-1', isCustom: true };
  await repo.change((s) => saveProduct(s, product));
  const entry = makeEntry(product, 150, 'g', 'breakfast', '2026-11-26');
  await repo.change((s) => addEntry(s, entry));
  await repo.change((s) =>
    addEntry(s, makeEntry(product, 50, 'g', 'lunch', '2026-11-26')),
  );
  expect((await repo.load()).recent).toHaveLength(1);
  await repo.change((s) =>
    editEntry(s, entry.id, 200, 'g', 'dinner', '2026-11-26'),
  );
  await repo.change((s) => toggleFavorite(s, product.id));
  await repo.change((s) => copyMeal(s, '2026-11-26', 'dinner', '2026-11-27'));
  await repo.change((s) =>
    saveProduct(s, {
      ...product,
      per100: { ...product.per100, calories: 999 },
    }),
  );
  expect(sumEntries((await repo.load()).entries, '2026-11-27').calories).toBe(
    product.per100.calories * 2,
  );
  await repo.change((s) => deleteProduct(s, product.id));
  await repo.change((s) => removeEntry(s, entry.id));
  const reopened = createFoodRepository(await openIndexedDbSettings(factory));
  const state = await reopened.load();
  expect(state.entries).toHaveLength(2);
  expect(state.entries.find((e) => e.date === '2026-11-27')?.product.name).toBe(
    product.name,
  );
  expect(state.favorites).toHaveLength(0);
  expect(state.products).toHaveLength(0);
  expect(await storage.get('user_state')).toBe('preserve');
});
test('повреждённое состояние не очищается, ошибки записи видны', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  await storage.apply([{ key: 'food_diary_state', value: '{bad' }]);
  const repo = createFoodRepository(storage);
  await expect(repo.change((s) => s)).rejects.toThrow(/поврежден|повреждён/);
  expect(await storage.get('food_diary_state')).toBe('{bad');
});

test('две транзакции не перезаписывают принятые записи друг друга', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repo = createFoodRepository(storage);
  const a = makeEntry(builtinFoods[0], 100, 'g', 'lunch', '2026-11-26');
  const b = makeEntry(builtinFoods[1], 100, 'g', 'lunch', '2026-11-26');
  const results = await Promise.allSettled([
    repo.change((s) => addEntry(s, a)),
    createFoodRepository(storage).change((s) => addEntry(s, b)),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await repo.load()).entries).toHaveLength(1);
  const missing = (await repo.load()).entries[0].id === a.id ? b : a;
  await repo.change((s) => addEntry(s, missing));
  expect((await repo.load()).entries).toHaveLength(2);
});

test('недавние уникальны, отсортированы по использованию; избранное можно убрать', () => {
  const a = makeEntry(builtinFoods[0], 100, 'g', 'lunch', '2026-11-26');
  const b = makeEntry(builtinFoods[1], 100, 'g', 'lunch', '2026-11-26');
  let s = addEntry(addEntry(addEntry(emptyFoodState(), a), b), a);
  expect(s.recent.map((r) => r.productId)).toEqual([
    a.product.id,
    b.product.id,
  ]);
  s = toggleFavorite(toggleFavorite(s, a.product.id), a.product.id);
  expect(s.favorites).toEqual([]);
});

test('аддитивное обновление IndexedDB v2 сохраняет профиль и цели', async () => {
  const factory = new IDBFactory();
  await new Promise<void>((done, reject) => {
    const req = factory.open('masstracker', 2);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('app_settings', {
        keyPath: 'key',
      });
      for (const key of ['user_state', 'nutrition_state', 'theme_mode'])
        store.put({ key, value: `original-${key}`, updatedAt: 'old' });
    };
    req.onsuccess = () => {
      req.result.close();
      done();
    };
    req.onerror = () => reject(req.error);
  });
  const storage = await openIndexedDbSettings(factory);
  expect(await storage.get('food_diary_schema')).toBe('1');
  for (const key of ['user_state', 'nutrition_state', 'theme_mode'])
    expect(await storage.get(key)).toBe(`original-${key}`);
  expect((await createFoodRepository(storage).load()).entries).toEqual([]);
});
