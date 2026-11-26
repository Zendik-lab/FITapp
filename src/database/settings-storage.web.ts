import {
  SettingsStorageError,
  SettingsConflictError,
  type Setting,
  type SettingsStorage,
} from './settings-contract';
import { trackSettingsWrite } from './settings-writes';

const databaseName = 'masstracker';
const storeName = 'app_settings';
const migrations = [
  (database: IDBDatabase) => {
    const store = database.createObjectStore(storeName, { keyPath: 'key' });
    const updatedAt = new Date().toISOString();

    store.add({ key: 'locale', value: 'ru-KZ', updatedAt } satisfies Setting);
    store.add({ key: 'units', value: 'metric', updatedAt } satisfies Setting);
    store.add({ key: 'currency', value: 'KZT', updatedAt } satisfies Setting);
  },
  (_database: IDBDatabase, transaction: IDBTransaction) => {
    transaction.objectStore(storeName).add({
      key: 'user_state_schema',
      value: '1',
      updatedAt: new Date().toISOString(),
    } satisfies Setting);
  },
];

let connection: Promise<SettingsStorage> | undefined;

export function getSettingsStorage(): Promise<SettingsStorage> {
  connection ??= openIndexedDbSettings(undefined, () => {
    connection = undefined;
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

function storageError(error: unknown, fallback: 'unavailable' | 'operation') {
  if (error instanceof SettingsConflictError) return error;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? error.name
      : undefined;
  return new SettingsStorageError(
    name === 'QuotaExceededError' ? 'quota' : fallback,
    error,
  );
}

export function openIndexedDbSettings(
  factory?: IDBFactory,
  onClose?: () => void,
): Promise<SettingsStorage> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let upgradeFailure: unknown;
    const timeout = setTimeout(
      () => fail(new Error('Истекло время ожидания открытия IndexedDB.')),
      5000,
    );

    function finish() {
      finished = true;
      clearTimeout(timeout);
    }

    function fail(error: unknown) {
      finish();
      reject(storageError(error, 'unavailable'));
    }

    try {
      const request = (factory ?? globalThis.indexedDB).open(
        databaseName,
        migrations.length,
      );
      request.onblocked = () =>
        fail(new Error('Схема IndexedDB используется в другом окне.'));
      request.onupgradeneeded = ({ oldVersion }) => {
        if (finished) {
          request.transaction?.abort();
          return;
        }
        try {
          for (const migrate of migrations.slice(oldVersion))
            migrate(request.result, request.transaction!);
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
        resolve(createStorage(database));
      };
    } catch (error) {
      fail(error);
    }
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createStorage(database: IDBDatabase): SettingsStorage {
  async function run<T>(
    mode: IDBTransactionMode,
    execute: (store: IDBObjectStore) => Promise<T>,
  ) {
    try {
      // Request a disk flush before acknowledging a write, including abrupt PWA closure.
      // Older WebKit versions accept only the two-argument transaction overload.
      let transaction: IDBTransaction;
      try {
        transaction =
          mode === 'readwrite'
            ? database.transaction(storeName, mode, { durability: 'strict' })
            : database.transaction(storeName, mode);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        transaction = database.transaction(storeName, mode);
      }
      const committed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      const result = (async () => {
        try {
          return await execute(transaction.objectStore(storeName));
        } catch (error) {
          try {
            transaction.abort();
          } catch {
            // IndexedDB may have already aborted it after a request failed.
          }
          throw error;
        }
      })();
      const [requested, completed] = await Promise.allSettled([
        result,
        committed,
      ]);
      if (requested.status === 'rejected') throw requested.reason;
      if (completed.status === 'rejected') throw completed.reason;
      return requested.value;
    } catch (error) {
      throw storageError(error, 'operation');
    }
  }

  return {
    async get(key) {
      const setting = await run<Setting | undefined>('readonly', (store) =>
        requestResult(store.get(key)),
      );
      return setting?.value ?? null;
    },
    list: () =>
      run<Setting[]>('readonly', (store) => requestResult(store.getAll())),
    apply: (changes, expected) =>
      trackSettingsWrite(() =>
        run('readwrite', async (store) => {
          if (expected) {
            const current = await requestResult<Setting | undefined>(
              store.get(expected.key),
            );
            if ((current?.value ?? null) !== expected.value)
              throw new SettingsConflictError();
          }
          const updatedAt = new Date().toISOString();
          // Queue the whole batch before yielding. Safari may auto-commit an idle transaction.
          const requests: Promise<unknown>[] = [];
          try {
            for (const { key, value } of changes) {
              requests.push(
                value === null
                  ? requestResult(store.delete(key))
                  : requestResult(
                      store.put({ key, value, updatedAt } satisfies Setting),
                    ),
              );
            }
          } catch (error) {
            // Attach handlers before run() aborts the already queued requests.
            void Promise.allSettled(requests);
            throw error;
          }
          await Promise.all(requests);
        }),
      ),
  };
}
