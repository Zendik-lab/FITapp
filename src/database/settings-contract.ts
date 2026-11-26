export type Setting = { key: string; value: string; updatedAt: string };
export type SettingChange = { key: string; value: string | null };

export interface SettingsStorage {
  get(key: string): Promise<string | null>;
  list(): Promise<Setting[]>;
  /** Checks the optional expected value and commits all changes in one transaction. */
  apply(
    changes: readonly SettingChange[],
    expected?: SettingChange,
  ): Promise<void>;
}

export class SettingsConflictError extends Error {
  constructor() {
    super('Данные изменены в другом окне. Загрузите актуальные значения.');
  }
}

export class SettingsStorageError extends Error {
  constructor(
    readonly code: 'unavailable' | 'quota' | 'operation',
    cause: unknown,
  ) {
    super(`Ошибка локального хранилища (${code})`, { cause });
  }
}
