const blockers = new Set<symbol>();
const listeners = new Set<() => void>();

export function isUpdateBlocked() {
  return blockers.size > 0;
}

export function subscribeUpdateSafety(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function blockUpdates() {
  const token = Symbol('active-form');
  blockers.add(token);
  listeners.forEach((listener) => listener());
  return () => {
    blockers.delete(token);
    listeners.forEach((listener) => listener());
  };
}
