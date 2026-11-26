export type StorageDiagnostics = {
  lastSuccessfulWrite?: string;
  error?: string;
};

let snapshot: StorageDiagnostics = {};
const listeners = new Set<() => void>();

export function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current) && parts.length < 5) {
    seen.add(current);
    if (typeof current === 'object' && 'message' in current) {
      const name = 'name' in current ? String(current.name) : 'Error';
      parts.push(`${name}: ${String(current.message)}`);
      current = 'cause' in current ? current.cause : undefined;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' → ') || 'Неизвестная ошибка';
}

export const getStorageDiagnostics = () => snapshot;
export function subscribeStorageDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: StorageDiagnostics) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function recordStorageWrite() {
  publish({ lastSuccessfulWrite: new Date().toISOString() });
}

export function recordStorageFailure(error: unknown) {
  publish({ ...snapshot, error: describeError(error) });
}

export function restoreStorageWriteTime(updatedAt: string | undefined) {
  if (
    updatedAt &&
    (!snapshot.lastSuccessfulWrite || updatedAt > snapshot.lastSuccessfulWrite)
  )
    publish({ ...snapshot, lastSuccessfulWrite: updatedAt });
}
