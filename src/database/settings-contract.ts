export type Setting = { key: string; value: string; updatedAt: string };
export type SettingChange = { key: string; value: string | null };

export interface SettingsStorage {
  get(key: string): Promise<string | null>;
  list(): Promise<Setting[]>;
  /** Applies every change in order, committing the batch atomically. */
  apply(changes: readonly SettingChange[]): Promise<void>;
}

export class SettingsStorageError extends Error {
  constructor(
    readonly code: 'unavailable' | 'quota' | 'operation',
    cause: unknown,
  ) {
    super(`Ошибка локального хранилища (${code})`, { cause });
  }
}
