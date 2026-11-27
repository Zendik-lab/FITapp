/** @jest-environment node */

import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  CatalogRow,
  CatalogStorage,
} from '@/features/catalog/catalog-storage-contract';
import { openSqliteCatalog } from '@/features/catalog/catalog-storage';
import { openIndexedDbCatalog } from '@/features/catalog/catalog-storage.web';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

function row(id: string, terms: string[], rank = 1): CatalogRow {
  return {
    product: {
      id,
      name: id,
      category: 'Молочные продукты',
      per100: { calories: 50, protein: 4, fat: 2, carbs: 4 },
      source: 'test fixture',
      isCustom: false,
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    },
    barcodeKey: id,
    terms,
    rank,
  };
}

function sqliteConnection(sql: DatabaseSync) {
  const transaction = {
    execAsync: async (statement: string) => sql.exec(statement),
    getFirstAsync: async <T>(statement: string, ...args: SQLInputValue[]) =>
      (sql.prepare(statement).get(...args) as T | undefined) ?? null,
    getAllAsync: async <T>(statement: string, ...args: SQLInputValue[]) =>
      sql.prepare(statement).all(...args) as T[],
    runAsync: async (statement: string, ...args: SQLInputValue[]) => {
      const result = sql.prepare(statement).run(...args);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
  };
  return {
    ...transaction,
    async withExclusiveTransactionAsync(
      execute: (connection: typeof transaction) => Promise<void>,
    ) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        await execute(transaction);
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

let sqlite: DatabaseSync | undefined;
afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

function webStorage(factory = new IDBFactory()) {
  return openIndexedDbCatalog(factory, IDBKeyRange);
}

describe.each<{ label: string; open: () => Promise<CatalogStorage> }>([
  { label: 'IndexedDB', open: webStorage },
  {
    label: 'SQLite',
    open: () => {
      sqlite = new DatabaseSync(':memory:');
      return openSqliteCatalog(sqliteConnection(sqlite));
    },
  },
])('$label', ({ open }) => {
  test('показывает только установленную версию и удаляет её одним действием', async () => {
    const storage = await open();
    const first = await storage.begin('kz', 'v1');
    await storage.append(
      'kz',
      first.generation,
      0,
      [row('old', ['картофель'])],
      true,
    );
    const second = await storage.begin('kz', 'v2');
    const aliasRow = { ...row('new', ['молоко']), barcodeKeys: ['alias'] };
    await storage.append('kz', second.generation, 0, [aliasRow], false);
    await storage.append('kz', second.generation, 0, [aliasRow], false);

    expect(await storage.begin('kz', 'v2')).toEqual({ ...second, next: 1 });
    expect(await storage.barcode('old')).toMatchObject({ id: 'old' });
    expect(await storage.barcode('alias')).toBeNull();
    expect(
      (await storage.candidates(second.generation, 'мол', 20)).rows,
    ).toEqual([]);
    await expect(
      storage.append('kz', second.generation, 2, [], true),
    ).rejects.toThrow();

    await storage.append('kz', second.generation, 1, [], true);
    await storage.append('kz', second.generation, 1, [], true);
    expect(await storage.list()).toEqual([
      { id: 'kz', installed: second.generation, installedVersion: 'v2' },
    ]);
    expect(await storage.barcode('old')).toBeNull();
    expect(await storage.barcode('alias')).toMatchObject({ id: 'new' });
    expect((await storage.candidates(first.generation, null, 20)).rows).toEqual(
      [],
    );

    await storage.remove('kz');
    expect(await storage.list()).toEqual([]);
    expect(await storage.barcode('new')).toBeNull();
    await expect(
      storage.append('kz', second.generation, 1, [], true),
    ).rejects.toThrow();
    await storage.collectGarbage();
  });

  test('префиксный индекс листается без полносканирования и поддерживает кириллицу', async () => {
    const storage = await open();
    const { generation } = await storage.begin('kz', 'v1');
    await storage.append(
      'kz',
      generation,
      0,
      [
        row('other', ['молочник'], 1),
        row('one', ['молоко', 'молоко', 'молоком'], 2),
        row('two', ['молоко'], 0),
        row('three', ['молочная'], 1),
      ],
      true,
    );

    const first = await storage.candidates(generation, 'молоко', 2);
    expect(first.rows.map(({ id }) => id)).toEqual(['two', 'one']);
    expect(first.total).toBe(3);
    expect(first.nextOffset).toBe(2);
    const second = await storage.candidates(
      generation,
      'молоко',
      2,
      first.nextOffset!,
    );
    expect(second.rows.map(({ id }) => id)).toEqual(['one']);
    expect(second.nextOffset).toBeNull();
    const ordered = await storage.candidates(generation, null, 10);
    expect(ordered.rows.map(({ id }) => id)).toEqual([
      'two',
      'other',
      'three',
      'one',
    ]);
  });

  test('повтор продукта откатывает весь блок, а исправленный блок продолжает импорт', async () => {
    const storage = await open();
    const { generation } = await storage.begin('kz', 'v1');
    await storage.append('kz', generation, 0, [row('first', ['milk'])], false);
    await expect(
      storage.append(
        'kz',
        generation,
        1,
        [row('second', ['milk']), row('first', ['milk'])],
        true,
      ),
    ).rejects.toMatchObject({ code: 'operation' });
    expect((await storage.begin('kz', 'v1')).next).toBe(1);
    expect(await storage.barcode('second')).toBeNull();
    await storage.append('kz', generation, 1, [row('second', ['milk'])], true);
    expect(
      (await storage.candidates(generation, 'milk', 5)).rows.map(
        ({ id }) => id,
      ),
    ).toEqual(['first', 'second']);
  });

  test('последняя страница выдаёт нужный диапазон в стабильном порядке', async () => {
    const storage = await open();
    const { generation } = await storage.begin('kz', 'v1');
    await storage.append(
      'kz',
      generation,
      0,
      Array.from({ length: 75 }, (_, rank) =>
        row(`product-${rank}`, ['milk'], rank),
      ),
      true,
    );
    const page = await storage.candidates(generation, 'milk', 10, 70);
    expect(page.rows.map(({ id }) => id)).toEqual([
      'product-70',
      'product-71',
      'product-72',
      'product-73',
      'product-74',
    ]);
    expect(page.total).toBe(75);
    expect(page.nextOffset).toBeNull();
  });
});

test('две вкладки видят один контрольный индекс и удаление отменяет запоздалую запись', async () => {
  const factory = new IDBFactory();
  const [first, second] = await Promise.all([
    webStorage(factory),
    webStorage(factory),
  ]);
  const [started, concurrent] = await Promise.all([
    first.begin('cis', 'v1'),
    second.begin('cis', 'v1'),
  ]);
  expect(started).toEqual(concurrent);
  await Promise.all([
    first.append('cis', started.generation, 0, [row('a', ['a'])], false),
    second.append('cis', concurrent.generation, 0, [row('a', ['a'])], false),
  ]);
  expect((await second.begin('cis', 'v1')).next).toBe(1);
  await second.remove('cis');
  await expect(
    first.append('cis', started.generation, 1, [], true),
  ).rejects.toThrow();
  expect(await first.barcode('a')).toBeNull();
  await Promise.all([first.collectGarbage(), second.collectGarbage()]);
});

test('файловый SQLite восстанавливает контрольную точку после закрытия соединения', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fitapp-catalog-'));
  const file = join(directory, 'catalog.sqlite');
  let sql = new DatabaseSync(file);
  try {
    const first = await openSqliteCatalog(sqliteConnection(sql));
    const { generation } = await first.begin('kz', 'v1');
    await first.append('kz', generation, 0, [row('first', ['milk'])], false);
    sql.close();

    sql = new DatabaseSync(file);
    const reopened = await openSqliteCatalog(sqliteConnection(sql));
    expect(await reopened.begin('kz', 'v1')).toEqual({
      generation,
      version: 'v1',
      next: 1,
    });
    await reopened.append('kz', generation, 1, [row('second', ['milk'])], true);
    expect(await reopened.barcode('first')).toMatchObject({ id: 'first' });
    expect(await reopened.barcode('second')).toMatchObject({ id: 'second' });
    await reopened.collectGarbage();
  } finally {
    sql.close();
    rmSync(file, { force: true });
    rmdirSync(directory);
  }
});

test('недостаток места откатывает весь блок без изменения контрольного индекса', async () => {
  const storage = await webStorage();
  const { generation } = await storage.begin('kz', 'v1');
  const add = IDBObjectStore.prototype.add;
  const limited = jest
    .spyOn(IDBObjectStore.prototype, 'add')
    .mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'product' in value &&
        (value.product as { id: string }).id === 'quota'
      ) {
        throw new DOMException('Limit reached', 'QuotaExceededError');
      }
      return add.call(this, value);
    });
  try {
    await expect(
      storage.append(
        'kz',
        generation,
        0,
        [row('rolled-back', ['milk']), row('quota', ['milk'])],
        true,
      ),
    ).rejects.toMatchObject({ code: 'quota' });
  } finally {
    limited.mockRestore();
  }
  expect((await storage.begin('kz', 'v1')).next).toBe(0);
  await storage.append(
    'kz',
    generation,
    0,
    [row('rolled-back', ['milk'])],
    true,
  );
  expect(await storage.barcode('quota')).toBeNull();
  expect(await storage.barcode('rolled-back')).toMatchObject({
    id: 'rolled-back',
  });
});
