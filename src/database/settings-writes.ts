const pendingWrites = new Set<Promise<void>>();
let paused = false;

export async function trackSettingsWrite(write: () => Promise<void>) {
  if (paused) throw new Error('Выполняется обновление приложения.');

  const operation = write();
  pendingWrites.add(operation);
  try {
    await operation;
  } finally {
    pendingWrites.delete(operation);
  }
}

export async function pauseSettingsWrites() {
  paused = true;
  await Promise.allSettled(pendingWrites);
}

export function resumeSettingsWrites() {
  paused = false;
}
