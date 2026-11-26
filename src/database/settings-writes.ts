import {
  recordStorageFailure,
  recordStorageWrite,
} from './storage-diagnostics';

const pendingWrites = new Set<Promise<void>>();
let paused = false;
let queue: Promise<void> | undefined;

export async function trackSettingsWrite(write: () => Promise<void>) {
  if (paused) throw new Error('Выполняется обновление приложения.');

  // Reserve every accepted write immediately, including writes queued behind I/O.
  const operation = queue ? queue.then(write) : write();
  const settled = operation.catch(() => {});
  queue = settled;
  void settled.then(() => {
    if (queue === settled) queue = undefined;
  });
  pendingWrites.add(operation);
  try {
    await operation;
    recordStorageWrite();
  } catch (error) {
    recordStorageFailure(error);
    throw error;
  } finally {
    pendingWrites.delete(operation);
  }
}

export async function pauseSettingsWrites() {
  paused = true;
  const results = await Promise.allSettled(pendingWrites);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected')
    throw new Error(
      'Не удалось сохранить изменения. Повторите сохранение перед обновлением.',
      { cause: failure.reason },
    );
}

export function resumeSettingsWrites() {
  paused = false;
}
