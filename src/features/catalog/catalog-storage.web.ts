import type { FoodProduct } from '@/features/food/model';
import {
  candidatePage,
  catalogGarbageCollector,
  catalogStorageError,
  currentImport,
  distinctIndexValues,
  existingImport,
  publicCatalogState,
  type CatalogPending,
  type CatalogRecord,
  type CatalogStorage,
} from './catalog-storage-contract';

const databaseName = 'masstracker-catalog';
const stateStore = 'packages';
const generationsStore = 'generations';
const productsStore = 'products';
const cleanupBatch = 400;

const migrations = [
  (database: IDBDatabase) => {
    database.createObjectStore(stateStore, { keyPath: 'id' });
    const generations = database.createObjectStore(generationsStore, {
      keyPath: 'id',
      autoIncrement: true,
    });
    generations.createIndex('status', 'status');
    const products = database.createObjectStore(productsStore, {
      keyPath: ['generation', 'product.id'],
    });
    products.createIndex('rank', ['generation', 'rank']);
    products.createIndex('barcodes', 'barcodeKeys', { multiEntry: true });
    products.createIndex('terms', 'termKeys', { multiEntry: true });
  },
];

type GenerationStatus = 'pending' | 'installed' | 'obsolete';
interface StoredProduct {
  generation: number;
  product: FoodProduct;
  rank: number;
  barcodeKeys: [number, string, number][];
  termKeys: [number, string, number][];
}

let connection: Promise<CatalogStorage> | undefined;

export function getCatalogStorage(): Promise<CatalogStorage> {
  connection ??= openIndexedDbCatalog(undefined, undefined, () => {
    connection = undefined;
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export function openIndexedDbCatalog(
  factory = globalThis.indexedDB,
  ranges = globalThis.IDBKeyRange,
  onClose?: () => void,
): Promise<CatalogStorage> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let upgradeFailure: unknown;
    const timeout = setTimeout(
      () => fail(new Error('Истекло время открытия каталога.')),
      5000,
    );

    function finish() {
      finished = true;
      clearTimeout(timeout);
    }
    function fail(error: unknown) {
      finish();
      reject(catalogStorageError(error, 'unavailable'));
    }

    try {
      const request = factory.open(databaseName, migrations.length);
      request.onblocked = () =>
        fail(new Error('Схема каталога используется в другом окне.'));
      request.onupgradeneeded = ({ oldVersion }) => {
        if (finished) {
          request.transaction?.abort();
          return;
        }
        try {
          for (const migrate of migrations.slice(oldVersion))
            migrate(request.result);
        } catch (error) {
          upgradeFailure = error;
          request.transaction?.abort();
        }
      };
      request.onerror = () => fail(upgradeFailure ?? request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (finished) {
          database.close();
          return;
        }
        finish();
        database.onclose = () => onClose?.();
        database.onversionchange = () => {
          database.close();
          onClose?.();
        };
        resolve(createCatalog(database, ranges));
      };
    } catch (error) {
      fail(error);
    }
  });
}

function writeTransaction(database: IDBDatabase, stores: string[]) {
  try {
    return database.transaction(stores, 'readwrite', { durability: 'strict' });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return database.transaction(stores, 'readwrite');
  }
}

type Observe = <T>(
  request: IDBRequest<T>,
  success: (result: T) => void,
) => void;

function createCatalog(
  database: IDBDatabase,
  ranges: typeof IDBKeyRange,
): CatalogStorage {
  // Keep dependent requests in IDB event callbacks so WebKit keeps the transaction active.
  function run<T>(
    stores: string[],
    mode: 'readonly' | 'readwrite',
    execute: (
      transaction: IDBTransaction,
      observe: Observe,
      finish: (value: T) => void,
    ) => void,
  ) {
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction =
          mode === 'readwrite'
            ? writeTransaction(database, stores)
            : database.transaction(stores, mode);
      } catch (error) {
        reject(catalogStorageError(error, 'operation'));
        return;
      }
      let failure: unknown;
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(catalogStorageError(failure ?? transaction.error, 'operation'));

      function process(action: () => void) {
        try {
          action();
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      }
      const observe: Observe = (request, success) => {
        request.onsuccess = () => process(() => success(request.result));
        request.onerror = () => {
          failure ??= request.error;
        };
      };
      process(() =>
        execute(transaction, observe, (value) => {
          result = value;
        }),
      );
    });
  }

  function setStatus(
    store: IDBObjectStore,
    id: string | undefined,
    status: GenerationStatus,
  ) {
    if (id) store.put({ id: Number(id), status });
  }

  const generationRange = (generation: number) =>
    ranges.bound([generation], [generation, []]);
  const garbage = catalogGarbageCollector(() =>
    run<boolean>(
      [generationsStore, productsStore],
      'readwrite',
      (tx, observe, finish) => {
        const generations = tx.objectStore(generationsStore);
        observe(generations.index('status').getKey('obsolete'), (obsolete) => {
          if (typeof obsolete !== 'number') return finish(false);
          const products = tx.objectStore(productsStore);
          observe(
            products.getAllKeys(generationRange(obsolete), cleanupBatch),
            (keys) => {
              for (const key of keys) products.delete(key);
              if (keys.length < cleanupBatch) generations.delete(obsolete);
              finish(true);
            },
          );
        });
      },
    ),
  );
  garbage.schedule();

  return {
    list: () =>
      run([stateStore], 'readonly', (tx, observe, finish) => {
        observe(
          tx.objectStore(stateStore).getAll(),
          (records: CatalogRecord[]) => {
            finish(records.map(publicCatalogState));
          },
        );
      }),

    async begin(id, version) {
      const { pending, retired } = await run<{
        pending: CatalogPending;
        retired: boolean;
      }>([stateStore, generationsStore], 'readwrite', (tx, observe, finish) => {
        const states = tx.objectStore(stateStore);
        const generations = tx.objectStore(generationsStore);
        observe(states.get(id), (record: CatalogRecord | undefined) => {
          const previous = existingImport(record ?? null, version);
          if (previous) return finish({ pending: previous, retired: false });
          observe(generations.add({ status: 'pending' }), (key) => {
            const pending = { version, generation: String(key), next: 0 };
            setStatus(generations, record?.pending?.generation, 'obsolete');
            states.put({ ...record, id, pending } satisfies CatalogRecord);
            finish({ pending, retired: Boolean(record?.pending) });
          });
        });
      });
      if (retired) garbage.schedule();
      return pending;
    },

    async append(id, generation, index, rows, last) {
      const retired = await run<boolean>(
        [stateStore, generationsStore, productsStore],
        'readwrite',
        (tx, observe, finish) => {
          const states = tx.objectStore(stateStore);
          const generations = tx.objectStore(generationsStore);
          const products = tx.objectStore(productsStore);
          observe(states.get(id), (record: CatalogRecord | undefined) => {
            const pending = currentImport(record ?? null, generation, index);
            if (!pending) return finish(false);
            const generationNumber = Number(generation);
            for (const row of rows) {
              const keys = (values: readonly string[]) =>
                distinctIndexValues(values).map(
                  (value): [number, string, number] => [
                    generationNumber,
                    value,
                    row.rank,
                  ],
                );
              products.add({
                generation: generationNumber,
                product: row.product,
                rank: row.rank,
                barcodeKeys: keys([row.barcodeKey, ...(row.barcodeKeys ?? [])]),
                termKeys: keys(row.terms),
              } satisfies StoredProduct);
            }
            if (last) {
              setStatus(generations, record?.installed, 'obsolete');
              setStatus(generations, generation, 'installed');
              states.put({
                id,
                installed: generation,
                installedVersion: pending.version,
                installedChunks: index + 1,
              } satisfies CatalogRecord);
            } else {
              states.put({
                ...record,
                id,
                pending: { ...pending, next: index + 1 },
              } satisfies CatalogRecord);
            }
            finish(last && Boolean(record?.installed));
          });
        },
      );
      if (retired) garbage.schedule();
    },

    async remove(id) {
      const retired = await run<boolean>(
        [stateStore, generationsStore],
        'readwrite',
        (tx, observe, finish) => {
          const states = tx.objectStore(stateStore);
          const generations = tx.objectStore(generationsStore);
          observe(states.get(id), (record: CatalogRecord | undefined) => {
            if (!record) return finish(false);
            setStatus(generations, record.installed, 'obsolete');
            setStatus(generations, record.pending?.generation, 'obsolete');
            states.delete(id);
            finish(true);
          });
        },
      );
      if (retired) garbage.schedule();
    },

    barcode: (key) =>
      run(
        [generationsStore, productsStore],
        'readonly',
        (tx, observe, finish) => {
          const generations = tx.objectStore(generationsStore);
          const barcodes = tx.objectStore(productsStore).index('barcodes');
          observe(
            generations.index('status').getAllKeys('installed'),
            (keys) => {
              if (!key || !keys.length) return finish(null);
              let remaining = keys.length;
              let best: StoredProduct | undefined;
              for (const generation of keys) {
                const range = ranges.bound(
                  [generation, key],
                  [generation, key, []],
                );
                observe(
                  barcodes.get(range),
                  (row: StoredProduct | undefined) => {
                    if (row && (!best || row.rank < best.rank)) best = row;
                    if (--remaining === 0) finish(best?.product ?? null);
                  },
                );
              }
            },
          );
        },
      ),

    candidates: (generation, prefix, limit, offset = 0) =>
      run(
        [generationsStore, productsStore],
        'readonly',
        (tx, observe, finish) => {
          const generationNumber = Number(generation);
          const generations = tx.objectStore(generationsStore);
          const products = tx.objectStore(productsStore);
          observe(
            generations.get(generationNumber),
            (value: { status: GenerationStatus } | undefined) => {
              if (value?.status !== 'installed')
                return finish(candidatePage([], 0, limit, offset));
              const index = products.index(prefix ? 'terms' : 'rank');
              const range = prefix
                ? ranges.bound(
                    [generationNumber, prefix],
                    [generationNumber, `${prefix}\uffff`],
                  )
                : generationRange(generationNumber);
              observe(index.count(range), (total) => {
                const count = Math.min(limit, total - offset);
                if (count <= 0)
                  return finish(candidatePage([], total, limit, offset));

                // IndexedDB cursors cross the WebKit process boundary on each
                // continue(). Use one request for the common early pages.
                const end = offset + count;
                if (end <= 64) {
                  observe(
                    index.getAll(range, end),
                    (stored: StoredProduct[]) => {
                      const unique = new Map<string, FoodProduct>();
                      for (const { product } of stored.slice(offset)) {
                        unique.set(product.id, product);
                      }
                      finish(
                        candidatePage(
                          [...unique.values()],
                          total,
                          limit,
                          offset,
                        ),
                      );
                    },
                  );
                  return;
                }

                function loadRows(keys: Iterable<IDBValidKey>) {
                  const uniqueKeys = new Map<string, IDBValidKey>();
                  for (const key of keys)
                    uniqueKeys.set((key as [number, string])[1], key);
                  if (!uniqueKeys.size)
                    return finish(candidatePage([], total, limit, offset));
                  const rows: FoodProduct[] = [];
                  for (const key of uniqueKeys.values()) {
                    observe(products.get(key), (row: StoredProduct) => {
                      rows.push(row.product);
                      if (rows.length === uniqueKeys.size)
                        finish(candidatePage(rows, total, limit, offset));
                    });
                  }
                }

                // Later pages skip bounded regions using just their primary keys.
                if (end <= 4096) {
                  observe(index.getAllKeys(range, end), (keys) =>
                    loadRows(keys.slice(offset)),
                  );
                  return;
                }

                // The key cursor skips offsets and duplicate postings without loading their payloads.
                const keys: IDBValidKey[] = [];
                let needOffset = offset > 0;
                observe(index.openKeyCursor(range), (cursor) => {
                  if (!cursor) return loadRows(keys);
                  if (needOffset) {
                    needOffset = false;
                    cursor.advance(offset);
                    return;
                  }
                  keys.push(cursor.primaryKey);
                  if (keys.length < count) cursor.continue();
                  else loadRows(keys);
                });
              });
            },
          );
        },
      ),

    collectGarbage: garbage.collect,
  };
}
