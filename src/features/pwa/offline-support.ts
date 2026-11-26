import { currentBuild, isBuildInfo } from './build-info';
import {
  readInstallFailure,
  readUpdateCheckTime,
  saveUpdateCheckTime,
  readWorkerStatus,
} from './worker-status';
import { describeError } from '@/database/storage-diagnostics';

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
  checkedAt?: string;
};

export type PwaDiagnostics = {
  workerState?: string;
  scope?: string;
  controlled?: boolean;
  workerBuildId?: string;
  resources?: number;
  cached?: number;
  error?: string;
};

export function observeOfflineSupport(
  onStatus: (status: OfflinePreparation) => void,
  onUpdate: (worker: ServiceWorker | null) => void,
  onCheck: (status: UpdateCheck) => void = () => {},
  onDiagnostics: (status: Partial<PwaDiagnostics>) => void = () => {},
) {
  const workers = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;
  let disposed = false;
  let registering = false;
  let checking = false;
  let checkedBuildId: string | undefined;
  let checkState: UpdateCheck['state'] = 'idle';
  let network: AbortController | undefined;
  let lastCheckedAt: string | undefined;
  const diagnostics = (value: Partial<PwaDiagnostics>) => {
    if (!disposed) onDiagnostics(value);
  };
  const status = (value: OfflinePreparation) => {
    if (!disposed) onStatus(value);
  };
  const check = (value: UpdateCheck) => {
    if (!disposed) {
      checkState = value.state;
      onCheck({ ...value, checkedAt: lastCheckedAt });
    }
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
        diagnostics({
          controlled: workers.controller === worker,
          workerState: worker.state,
          workerBuildId: snapshot.version,
          resources: snapshot.resources,
          cached: snapshot.cached,
          error:
            snapshot.error ??
            (ready && snapshot.version !== currentBuild().buildId
              ? `HTML/JS ${currentBuild().buildId}; Service Worker ${snapshot.version}. Требуется согласованная публикация или установка готового обновления.`
              : undefined),
        });
        status(
          ready && snapshot.version === currentBuild().buildId
            ? 'ready'
            : 'unavailable',
        );
        if (ready && snapshot.version !== currentBuild().buildId) {
          onUpdate(registration?.waiting ?? worker);
          check({ state: 'available' });
        } else if (
          ready &&
          checkedBuildId === snapshot.version &&
          (checkState === 'downloading' || checkState === 'available') &&
          !registration?.installing &&
          !registration?.waiting
        ) {
          check({ state: 'current' });
        }
      }
    } catch (error) {
      diagnostics({ error: describeError(error) });
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
    diagnostics({
      scope: registration?.scope,
      controlled: Boolean(workers.controller),
      workerState:
        registration?.installing?.state ??
        waiting?.state ??
        registration?.active?.state ??
        'не зарегистрирован',
    });
    onUpdate(waiting);
    if (waiting) check({ state: 'available' });
    else if (installing?.state === 'redundant') {
      if (!workers.controller) status('unavailable');
      void readInstallFailure(undefined, lastCheckedAt)
        .catch(describeError)
        .then((failure) => {
          if (disposed) return;
          diagnostics({ error: failure });
          check({
            state: 'error',
            message:
              failure ??
              'Установка Service Worker завершилась состоянием redundant. Текущая версия сохранена. Повторите проверку.',
          });
        });
    }
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
      } catch (error) {
        diagnostics({ error: describeError(error) });
        check({
          state: 'error',
          message: describeError(error),
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
    lastCheckedAt = new Date().toISOString();
    void saveUpdateCheckTime(lastCheckedAt).catch((error: unknown) => {
      console.warn(
        '[MassTracker] Не удалось сохранить время проверки обновлений',
        error,
      );
    });
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
            `/version.json: HTTP ${response.status}, Content-Type ${response.headers.get('content-type') ?? 'отсутствует'}. Требуется полный production-экспорт.`,
          );
        const info: unknown = await response.json();
        if (!isBuildInfo(info))
          throw new Error(
            '/version.json: неверный формат buildId/appVersion. Требуется полный production-экспорт.',
          );
        checkedBuildId = info.buildId;
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
      const failure = await readInstallFailure(
        checkedBuildId ?? currentBuild().buildId,
        lastCheckedAt,
      ).catch(() => undefined);
      const message = failure ?? describeError(error);
      diagnostics({ error: message });
      check(
        navigator.onLine
          ? {
              state: 'error',
              message,
            }
          : { state: 'offline' },
      );
    } finally {
      clearTimeout(timeout);
      registering = false;
    }
  }

  async function prepareOffline() {
    if (disposed) return;
    status('preparing');
    diagnostics({ error: undefined });
    if (workers.controller || registration?.active) await verifyActive();
    else await prepare();
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
  void readUpdateCheckTime()
    .catch(() => undefined)
    .then((time) => {
      lastCheckedAt ??= time;
      if (!disposed) void prepare();
    });

  return {
    prepare: () => {
      void prepareOffline().catch((error: unknown) => {
        status('unavailable');
        diagnostics({ error: describeError(error) });
      });
    },
    checkUpdates: () => {
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
