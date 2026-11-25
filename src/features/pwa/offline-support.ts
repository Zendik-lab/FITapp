import { currentBuild, isBuildInfo } from './build-info';
import { readWorkerStatus } from './worker-status';

export type OfflinePreparation = 'preparing' | 'ready' | 'unavailable';
export type UpdateCheck = {
  state:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'offline'
    | 'error';
  message?: string;
};

export function observeOfflineSupport(
  onStatus: (status: OfflinePreparation) => void,
  onUpdate: (worker: ServiceWorker | null) => void,
  onCheck: (status: UpdateCheck) => void = () => {},
) {
  const workers = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;
  let disposed = false;
  let registering = false;
  let checking = false;
  let network: AbortController | undefined;
  const status = (value: OfflinePreparation) => {
    if (!disposed) onStatus(value);
  };
  const check = (value: UpdateCheck) => {
    if (!disposed) onCheck(value);
  };

  async function verifyActive() {
    const worker = workers.controller ?? registration?.active;
    if (!worker || checking || disposed) return;
    checking = true;
    try {
      let snapshot = await readWorkerStatus(worker);
      let { ready } = snapshot;
      if (!ready) {
        status(navigator.onLine ? 'preparing' : 'unavailable');
        if (navigator.onLine) {
          snapshot = await readWorkerStatus(worker, true);
          ready = snapshot.ready;
        }
      }
      if (
        !disposed &&
        (workers.controller ?? registration?.active) === worker
      ) {
        status(
          ready && snapshot.version === currentBuild().buildId
            ? 'ready'
            : 'unavailable',
        );
        if (ready && snapshot.version !== currentBuild().buildId) {
          onUpdate(registration?.waiting ?? worker);
          check({ state: 'available' });
        }
      }
    } catch {
      if (workers.controller === worker) status('unavailable');
    } finally {
      checking = false;
      if ((workers.controller ?? registration?.active) !== worker)
        void verifyActive();
    }
  }

  function sync() {
    if (disposed) return;
    const waiting = registration?.waiting ?? null;
    onUpdate(waiting);
    if (waiting) check({ state: 'available' });
    else if (installing?.state === 'redundant')
      check({
        state: 'error',
        message:
          'Не удалось загрузить обновление. Текущая версия сохранена. Повторите проверку.',
      });
    if (workers.controller) void verifyActive();
    else
      status(
        installing && installing.state !== 'redundant'
          ? 'preparing'
          : 'unavailable',
      );
  }

  function watchInstall() {
    installing?.removeEventListener('statechange', sync);
    installing = registration?.installing ?? null;
    installing?.addEventListener('statechange', sync);
    sync();
  }

  async function prepare() {
    if (disposed || registering) return;
    // Local registration discovery also runs offline: a complete waiting build
    // may have been downloaded before iOS suspended or restarted the page.
    if (!registration) {
      registering = true;
      try {
        registration = await workers.getRegistration();
        if (disposed) return;
        if (registration) {
          registration.addEventListener('updatefound', watchInstall);
          watchInstall();
        }
      } catch {
        check({
          state: 'error',
          message:
            'Не удалось проверить готовность обновления. Повторите попытку.',
        });
      } finally {
        registering = false;
      }
    }
    if (disposed) return;
    void verifyActive();
    if (!navigator.onLine) {
      if (!registration?.waiting) check({ state: 'offline' });
      return;
    }
    if (
      registration &&
      !registration.active &&
      !registration.installing &&
      !registration.waiting
    ) {
      registration.removeEventListener('updatefound', watchInstall);
      registration = undefined;
      installing?.removeEventListener('statechange', sync);
      installing = null;
    }
    registering = true;
    check({ state: 'checking' });
    if (!workers.controller) status('preparing');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        registration
          ? registration.update()
          : workers.register('/sw.js', { scope: '/', updateViaCache: 'none' }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'Сервер обновлений не отвечает. Текущая версия сохранена. Повторите проверку.',
                ),
              ),
            25_000,
          );
        }),
      ]);
      clearTimeout(timeout);
      if (disposed) return;
      if (!registration) {
        registration = result;
        registration.addEventListener('updatefound', watchInstall);
        watchInstall();
      }
      network = new AbortController();
      const deadline = setTimeout(() => network?.abort(), 10_000);
      try {
        const response = await fetch('/version.json', {
          cache: 'no-store',
          redirect: 'error',
          signal: network.signal,
        });
        if (
          !response.ok ||
          !response.headers.get('content-type')?.includes('application/json')
        )
          throw new Error(
            'Сервер не вернул сведения о версии. Текущая версия сохранена.',
          );
        const info: unknown = await response.json();
        if (!isBuildInfo(info))
          throw new Error(
            'Не удалось проверить версию приложения. Повторите попытку.',
          );
        if (registration.waiting) {
          sync();
        } else if (registration.installing) check({ state: 'downloading' });
        else if (info.buildId === currentBuild().buildId)
          check({ state: 'current' });
        else {
          const active = workers.controller ?? registration.active;
          const activeStatus = active
            ? await readWorkerStatus(active)
            : undefined;
          if (
            active &&
            activeStatus?.ready &&
            activeStatus.version === info.buildId
          ) {
            if (!disposed) onUpdate(active);
            check({ state: 'available' });
          } else
            throw new Error(
              'Обновление ещё не готово. Текущая версия сохранена. Повторите проверку.',
            );
        }
      } finally {
        clearTimeout(deadline);
      }
    } catch (error) {
      if (!workers.controller) status('unavailable');
      check(
        navigator.onLine
          ? {
              state: 'error',
              message:
                error instanceof Error && error.name === 'Error'
                  ? error.message
                  : 'Не удалось проверить обновления. Повторите попытку.',
            }
          : { state: 'offline' },
      );
    } finally {
      clearTimeout(timeout);
      registering = false;
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') void prepare();
  }
  function onOnline() {
    void prepare();
  }
  workers.addEventListener('controllerchange', sync);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', sync);
  const interval = setInterval(onVisible, 60 * 60 * 1000);
  void prepare();

  return {
    prepare: () => {
      void prepare();
    },
    dispose: () => {
      disposed = true;
      network?.abort();
      clearInterval(interval);
      installing?.removeEventListener('statechange', sync);
      registration?.removeEventListener('updatefound', watchInstall);
      workers.removeEventListener('controllerchange', sync);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', sync);
    },
  };
}
