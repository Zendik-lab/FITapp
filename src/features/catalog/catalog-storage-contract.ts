import type { FoodProduct } from '@/features/food/model';

export interface CatalogRow {
  product: FoodProduct;
  barcodeKey: string;
  barcodeKeys?: readonly string[];
  terms: readonly string[];
  rank: number;
}

export interface CatalogPending {
  version: string;
  generation: string;
  next: number;
}

export interface CatalogState {
  id: string;
  installed?: string;
  installedVersion?: string;
  pending?: CatalogPending;
}

export interface CatalogCandidatePage {
  rows: FoodProduct[];
  // A product can match several indexed terms. The cursor and total count index entries.
  total: number;
  nextOffset: number | null;
}

export interface CatalogStorage {
  list(): Promise<CatalogState[]>;
  begin(id: string, version: string): Promise<CatalogPending>;
  append(
    id: string,
    generation: string,
    index: number,
    rows: CatalogRow[],
    last: boolean,
  ): Promise<void>;
  remove(id: string): Promise<void>;
  barcode(key: string): Promise<FoodProduct | null>;
  candidates(
    generation: string,
    prefix: string | null,
    limit: number,
    offset?: number,
  ): Promise<CatalogCandidatePage>;
  collectGarbage(): Promise<void>;
}

export class CatalogImportConflictError extends Error {
  constructor() {
    super('Состояние пакета изменилось. Повторите действие.');
    this.name = 'CatalogImportConflictError';
  }
}

export class CatalogStorageError extends Error {
  constructor(
    readonly code: 'quota' | 'unavailable' | 'operation',
    cause: unknown,
  ) {
    super(
      code === 'quota'
        ? 'Недостаточно места для пакета каталога.'
        : 'Не удалось обратиться к хранилищу пакетов каталога.',
      { cause },
    );
    this.name = 'CatalogStorageError';
  }
}

export function catalogStorageError(
  error: unknown,
  fallback: 'unavailable' | 'operation',
) {
  if (
    error instanceof CatalogImportConflictError ||
    error instanceof CatalogStorageError
  )
    return error;

  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? error.name
      : undefined;
  const quota =
    name === 'QuotaExceededError' ||
    (error instanceof Error &&
      /SQLITE_FULL|database or disk is full/i.test(error.message));
  return new CatalogStorageError(quota ? 'quota' : fallback, error);
}

export interface CatalogRecord extends CatalogState {
  installedChunks?: number;
}

export function publicCatalogState(record: CatalogRecord): CatalogState {
  const { installedChunks: _installedChunks, ...state } = record;
  return state;
}

export function existingImport(record: CatalogRecord | null, version: string) {
  if (record?.pending?.version === version) return record.pending;
  if (record?.installed && record.installedVersion === version) {
    return {
      generation: record.installed,
      next: record.installedChunks ?? 0,
      version,
    };
  }
  return undefined;
}

export function currentImport(
  record: CatalogRecord | null,
  generation: string,
  index: number,
) {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new CatalogImportConflictError();
  if (record?.installed === generation && index < (record.installedChunks ?? 0))
    return undefined;

  const pending = record?.pending;
  if (pending?.generation !== generation || pending.next < index)
    throw new CatalogImportConflictError();

  return pending.next === index ? pending : undefined;
}

export function distinctIndexValues(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function candidatePage(
  rows: FoodProduct[],
  total: number,
  limit: number,
  offset: number,
): CatalogCandidatePage {
  return {
    rows,
    total,
    nextOffset: limit > 0 && offset + limit < total ? offset + limit : null,
  };
}

export function catalogGarbageCollector(step: () => Promise<boolean>) {
  let collection: Promise<void> | undefined;
  let requested = false;
  function collect() {
    requested = true;
    collection ??= (async () => {
      try {
        do {
          requested = false;
          while (await step())
            await new Promise((resolve) => setTimeout(resolve, 0));
        } while (requested);
      } finally {
        collection = undefined;
      }
    })();
    return collection;
  }
  function schedule() {
    if (collection) {
      requested = true;
      return;
    }
    void collect().catch((error: unknown) => {
      console.warn('[MassTracker] Ошибка очистки пакетов каталога', error);
    });
  }
  return { collect, schedule };
}
