import { openDatabaseAsync } from 'expo-sqlite';
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

const migrations = [
  `CREATE TABLE catalog_packages (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE TABLE catalog_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('pending', 'installed', 'obsolete'))
  );
  CREATE INDEX catalog_generation_status ON catalog_generations (status);
  CREATE TABLE catalog_products (
    generation INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (generation, product_id)
  ) WITHOUT ROWID;
  CREATE INDEX catalog_product_rank ON catalog_products (generation, rank, product_id);
  CREATE TABLE catalog_terms (
    generation INTEGER NOT NULL,
    term TEXT NOT NULL,
    rank INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    PRIMARY KEY (generation, term, rank, product_id)
  ) WITHOUT ROWID;
  CREATE TABLE catalog_barcodes (
    generation INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    rank INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    PRIMARY KEY (generation, barcode, rank, product_id)
  ) WITHOUT ROWID;`,
];

type SqlValue = string | number;
interface SqlConnection {
  execAsync(statement: string): Promise<void>;
  getAllAsync<T>(statement: string, ...values: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(statement: string, ...values: SqlValue[]): Promise<T | null>;
  runAsync(
    statement: string,
    ...values: SqlValue[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
}
type CatalogDatabase = SqlConnection & {
  withExclusiveTransactionAsync(
    action: (transaction: SqlConnection) => Promise<void>,
  ): Promise<void>;
};
type ProductPayload = { payload: string };
const cleanupBatch = 800;

let connection: Promise<CatalogStorage> | undefined;

export function getCatalogStorage(): Promise<CatalogStorage> {
  connection ??= openDatabaseAsync('masstracker-catalog.db', {
    useNewConnection: true,
  })
    .then(async (database) => {
      try {
        await database.execAsync('PRAGMA journal_mode = WAL');
        return await openSqliteCatalog(database);
      } catch (error) {
        await database.closeAsync().catch((closeError: unknown) => {
          console.warn(
            '[MassTracker] Ошибка закрытия базы каталога',
            closeError,
          );
        });
        throw error;
      }
    })
    .catch((error: unknown) => {
      connection = undefined;
      throw catalogStorageError(error, 'unavailable');
    });
  return connection;
}

export async function openSqliteCatalog(
  database: CatalogDatabase,
): Promise<CatalogStorage> {
  await database.execAsync(
    'PRAGMA busy_timeout = 5000; PRAGMA auto_vacuum = INCREMENTAL;',
  );
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync('PRAGMA busy_timeout = 5000');
    const current = await transaction.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    const version = current?.user_version ?? 0;
    if (version > migrations.length)
      throw new Error('База каталога требует более новую версию приложения.');
    for (const migrate of migrations.slice(version))
      await transaction.execAsync(migrate);
    if (version < migrations.length)
      await transaction.execAsync(`PRAGMA user_version = ${migrations.length}`);
  });
  return createCatalog(database);
}

async function readRecord(
  database: SqlConnection,
  id: string,
): Promise<CatalogRecord | null> {
  const row = await database.getFirstAsync<{ state: string }>(
    'SELECT state FROM catalog_packages WHERE id = ?',
    id,
  );
  return row ? (JSON.parse(row.state) as CatalogRecord) : null;
}

function writeRecord(database: SqlConnection, state: CatalogRecord) {
  return database.runAsync(
    'INSERT OR REPLACE INTO catalog_packages (id, state) VALUES (?, ?)',
    state.id,
    JSON.stringify(state),
  );
}

async function setStatus(
  database: SqlConnection,
  id: string | undefined,
  status: string,
) {
  if (id)
    await database.runAsync(
      'UPDATE catalog_generations SET status = ? WHERE id = ?',
      status,
      Number(id),
    );
}

async function insertRows(
  database: SqlConnection,
  table: 'catalog_products' | 'catalog_terms' | 'catalog_barcodes',
  rows: SqlValue[][],
) {
  // Stay below the legacy 999-variable limit while batching bridge calls.
  const batch = 200;
  for (let offset = 0; offset < rows.length; offset += batch) {
    const chunk = rows.slice(offset, offset + batch);
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    await database.runAsync(
      `INSERT INTO ${table} VALUES ${placeholders}`,
      ...chunk.flat(),
    );
  }
}

const activeGeneration =
  "EXISTS(SELECT 1 FROM catalog_generations g WHERE g.id = ? AND g.status = 'installed')";

function createCatalog(database: CatalogDatabase): CatalogStorage {
  let writes = Promise.resolve();

  // Exclusive Expo transactions use a separate SQLite connection, so reads never
  // see partial writes. Serialize writers and acquire the write lock before reading state.
  function mutate<T>(operation: (transaction: SqlConnection) => Promise<T>) {
    const task = writes.then(async () => {
      let result!: T;
      try {
        await database.withExclusiveTransactionAsync(async (transaction) => {
          await transaction.execAsync('PRAGMA busy_timeout = 5000');
          await transaction.runAsync(
            'UPDATE catalog_generations SET status = status WHERE id = 0',
          );
          result = await operation(transaction);
        });
      } catch (error) {
        throw catalogStorageError(error, 'operation');
      }
      return result;
    });
    writes = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  const garbage = catalogGarbageCollector(() =>
    mutate(async (transaction) => {
      const obsolete = await transaction.getFirstAsync<{ id: number }>(
        "SELECT id FROM catalog_generations WHERE status = 'obsolete' ORDER BY id LIMIT 1",
      );
      if (!obsolete) return false;
      const { id } = obsolete;
      const terms = await transaction.runAsync(
        `DELETE FROM catalog_terms WHERE (generation, term, rank, product_id) IN (
        SELECT generation, term, rank, product_id FROM catalog_terms WHERE generation = ? LIMIT ?
      )`,
        id,
        cleanupBatch,
      );
      const barcodes = await transaction.runAsync(
        `DELETE FROM catalog_barcodes WHERE (generation, barcode, rank, product_id) IN (
        SELECT generation, barcode, rank, product_id FROM catalog_barcodes WHERE generation = ? LIMIT ?
      )`,
        id,
        cleanupBatch,
      );
      const products = await transaction.runAsync(
        `DELETE FROM catalog_products WHERE (generation, product_id) IN (
        SELECT generation, product_id FROM catalog_products WHERE generation = ? LIMIT ?
      )`,
        id,
        cleanupBatch,
      );
      if (
        [terms, barcodes, products].every(
          ({ changes }) => changes < cleanupBatch,
        )
      )
        await transaction.runAsync(
          'DELETE FROM catalog_generations WHERE id = ?',
          id,
        );
      await transaction.execAsync('PRAGMA incremental_vacuum(256)');
      return true;
    }),
  );
  garbage.schedule();

  return {
    async list() {
      const rows = await database.getAllAsync<{ state: string }>(
        'SELECT state FROM catalog_packages ORDER BY id',
      );
      return rows.map(({ state }) =>
        publicCatalogState(JSON.parse(state) as CatalogRecord),
      );
    },

    async begin(id, version) {
      const { pending, retired } = await mutate(async (transaction) => {
        const record = await readRecord(transaction, id);
        const current = existingImport(record, version);
        if (current) return { pending: current, retired: false };
        const added = await transaction.runAsync(
          "INSERT INTO catalog_generations (status) VALUES ('pending')",
        );
        const pending: CatalogPending = {
          version,
          generation: String(added.lastInsertRowId),
          next: 0,
        };
        await setStatus(transaction, record?.pending?.generation, 'obsolete');
        await writeRecord(transaction, { ...record, id, pending });
        return { pending, retired: Boolean(record?.pending) };
      });
      if (retired) garbage.schedule();
      return pending;
    },

    async append(id, generation, index, rows, last) {
      const retired = await mutate(async (transaction) => {
        const record = await readRecord(transaction, id);
        const pending = currentImport(record, generation, index);
        if (!pending) return false;
        const key = Number(generation);
        await insertRows(
          transaction,
          'catalog_products',
          rows.map(({ product, rank }) => [
            key,
            product.id,
            rank,
            JSON.stringify(product),
          ]),
        );
        await insertRows(
          transaction,
          'catalog_terms',
          rows.flatMap((row) =>
            distinctIndexValues(row.terms).map((term) => [
              key,
              term,
              row.rank,
              row.product.id,
            ]),
          ),
        );
        await insertRows(
          transaction,
          'catalog_barcodes',
          rows.flatMap((row) =>
            distinctIndexValues([
              row.barcodeKey,
              ...(row.barcodeKeys ?? []),
            ]).map((barcode) => [key, barcode, row.rank, row.product.id]),
          ),
        );
        if (last) {
          await setStatus(transaction, record?.installed, 'obsolete');
          await setStatus(transaction, generation, 'installed');
          await writeRecord(transaction, {
            id,
            installed: generation,
            installedVersion: pending.version,
            installedChunks: index + 1,
          });
        } else {
          await writeRecord(transaction, {
            ...record,
            id,
            pending: { ...pending, next: index + 1 },
          });
        }
        return last && Boolean(record?.installed);
      });
      if (retired) garbage.schedule();
    },

    async remove(id) {
      const retired = await mutate(async (transaction) => {
        const record = await readRecord(transaction, id);
        if (!record) return false;
        await setStatus(transaction, record.installed, 'obsolete');
        await setStatus(transaction, record.pending?.generation, 'obsolete');
        await transaction.runAsync(
          'DELETE FROM catalog_packages WHERE id = ?',
          id,
        );
        return true;
      });
      if (retired) garbage.schedule();
    },

    async barcode(key) {
      if (!key) return null;
      const row = await database.getFirstAsync<ProductPayload>(
        `SELECT p.payload FROM catalog_generations g
         JOIN catalog_barcodes b ON b.generation = g.id AND b.barcode = ?
         JOIN catalog_products p ON p.generation = g.id AND p.product_id = b.product_id
         WHERE g.status = 'installed' ORDER BY b.rank, g.id, b.product_id LIMIT 1`,
        key,
      );
      return row ? (JSON.parse(row.payload) as FoodProduct) : null;
    },

    async candidates(generation, prefix, limit, offset = 0) {
      const key = Number(generation);
      const range = prefix
        ? 'generation = ? AND term >= ? AND term < ?'
        : 'generation = ?';
      const values = prefix
        ? [key, prefix, `${prefix}\u{10ffff}`, key]
        : [key, key];
      const table = prefix ? 'catalog_terms' : 'catalog_products';
      const count = await database.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${table} WHERE ${range} AND ${activeGeneration}`,
        ...values,
      );
      const total = count?.total ?? 0;
      if (limit <= 0 || offset >= total)
        return candidatePage([], total, limit, offset);

      const rows = prefix
        ? await database.getAllAsync<ProductPayload>(
            `SELECT p.payload FROM (
            SELECT generation, term, rank, product_id FROM catalog_terms
              WHERE ${range} AND ${activeGeneration} ORDER BY term, rank, product_id LIMIT ? OFFSET ?
           ) t JOIN catalog_products p ON p.generation = t.generation AND p.product_id = t.product_id
           ORDER BY t.term, t.rank, t.product_id`,
            ...values,
            limit,
            offset,
          )
        : await database.getAllAsync<ProductPayload>(
            `SELECT payload FROM catalog_products WHERE ${range} AND ${activeGeneration}
           ORDER BY rank, product_id LIMIT ? OFFSET ?`,
            ...values,
            limit,
            offset,
          );
      const products = new Map<string, FoodProduct>();
      for (const { payload } of rows) {
        const product = JSON.parse(payload) as FoodProduct;
        products.set(product.id, product);
      }
      return candidatePage(
        [...products.values()],
        rows.length ? total : 0,
        limit,
        offset,
      );
    },

    collectGarbage: garbage.collect,
  };
}
