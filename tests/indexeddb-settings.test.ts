/** @jest-environment node */

import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

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
