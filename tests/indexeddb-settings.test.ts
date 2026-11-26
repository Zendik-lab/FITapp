/** @jest-environment node */

import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';

import { openIndexedDbSettings } from '@/database/settings-storage.web';

test('сохраняет, обновляет и удаляет настройки между открытиями базы', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  expect(await storage.get('locale')).toBe('ru-KZ');
  expect(await storage.get('theme_mode')).toBeNull();

  await storage.apply([
    { key: 'theme_mode', value: 'dark' },
    { key: 'test', value: 'first' },
  ]);
  const reopened = await openIndexedDbSettings(factory);
  expect(await reopened.get('theme_mode')).toBe('dark');

  await reopened.apply([
    { key: 'theme_mode', value: 'light' },
    { key: 'test', value: null },
  ]);
  expect(await storage.get('theme_mode')).toBe('light');
  expect(await storage.get('test')).toBeNull();
  expect(await storage.list()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'theme_mode', value: 'light' }),
    ]),
  );
});

test('сообщает о недоступности базы с исходной причиной', async () => {
  const factory = new IDBFactory();
  const cause = new DOMException('Unavailable', 'SecurityError');
  jest.spyOn(factory, 'open').mockImplementationOnce(() => {
    throw cause;
  });

  await expect(openIndexedDbSettings(factory)).rejects.toMatchObject({
    code: 'unavailable',
    cause,
  });
  await expect(openIndexedDbSettings(factory)).resolves.toBeDefined();
});

test('запрашивает строгую фиксацию данных и поддерживает старый WebKit без третьего аргумента', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const transaction = IDBDatabase.prototype.transaction;
  const calls: (IDBTransactionOptions | undefined)[] = [];
  const intercepted = jest
    .spyOn(IDBDatabase.prototype, 'transaction')
    .mockImplementation(function (
      this: IDBDatabase,
      names: string | Iterable<string>,
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      calls.push(options);
      if (options) throw new TypeError('Legacy WebKit overload');
      return transaction.call(this, names, mode);
    });
  try {
    await storage.apply([{ key: 'theme_mode', value: 'dark' }]);
    expect(calls.slice(0, 2)).toEqual([{ durability: 'strict' }, undefined]);
    expect(await storage.get('theme_mode')).toBe('dark');
  } finally {
    intercepted.mockRestore();
  }
});

test('откатывает всю запись при превышении квоты в середине пакета', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const put = IDBObjectStore.prototype.put;
  const quota = jest
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === 'second'
      ) {
        throw new DOMException('Limit reached', 'QuotaExceededError');
      }
      return put.call(this, value);
    });

  try {
    await expect(
      storage.apply([
        { key: 'first', value: 'queued' },
        { key: 'second', value: 'fails' },
      ]),
    ).rejects.toMatchObject({ code: 'quota' });
    expect(await storage.get('first')).toBeNull();
    expect(await storage.get('second')).toBeNull();
  } finally {
    quota.mockRestore();
  }
});

test('ошибка миграции сохраняет исходную версию базы и все старые записи', async () => {
  const factory = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('masstracker', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('app_settings', {
        keyPath: 'key',
      });
      store.put({ key: 'theme_mode', value: 'dark', updatedAt: 'old' });
      // Simulate a collision in a migration, not a fresh empty database.
      store.put({
        key: 'user_state_schema',
        value: 'legacy',
        updatedAt: 'old',
      });
      store.put({
        key: 'user_state',
        value: 'original-profile',
        updatedAt: 'old',
      });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  await expect(openIndexedDbSettings(factory)).rejects.toMatchObject({
    code: 'unavailable',
  });
  const retained = await new Promise<{ version: number; records: unknown[] }>(
    (resolve, reject) => {
      const request = factory.open('masstracker', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database
          .transaction('app_settings')
          .objectStore('app_settings')
          .getAll();
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          resolve({ version: database.version, records: read.result });
          database.close();
        };
      };
    },
  );
  expect(retained.version).toBe(1);
  expect(retained.records).toEqual(
    expect.arrayContaining([
      { key: 'theme_mode', value: 'dark', updatedAt: 'old' },
      { key: 'user_state_schema', value: 'legacy', updatedAt: 'old' },
      { key: 'user_state', value: 'original-profile', updatedAt: 'old' },
    ]),
  );
  expect(retained.records).toHaveLength(3);
});
