export type OfflinePreparation = 'preparing' | 'ready' | 'unavailable';

async function workerReady(
  worker: ServiceWorker,
  repair: boolean,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(
      () => {
        channel.port1.close();
        reject(new Error('Offline preparation timed out'));
      },
      repair ? 55_000 : 5_000,
    );
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(
        typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          data.type === 'OFFLINE_STATUS' &&
          'ready' in data &&
          data.ready === true,
      );
    };
    try {
      worker.postMessage(
        { type: repair ? 'PREPARE_OFFLINE' : 'GET_OFFLINE_STATUS' },
        [channel.port2],
      );
    } catch (error) {
      clearTimeout(timeout);
      channel.port1.close();
      reject(error);
    }
  });
}

export function observeOfflineSupport(
  onStatus: (status: OfflinePreparation) => void,
  onUpdate: (worker: ServiceWorker | null) => void,
) {
  const workers = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let installing: ServiceWorker | null = null;
  let disposed = false;
  let registering = false;
  let checking = false;
  const status = (value: OfflinePreparation) => {
    if (!disposed) onStatus(value);
  };

  async function verifyActive() {
    const worker = workers.controller;
    if (!worker || checking || disposed) return;
    checking = true;
    try {
      let ready = await workerReady(worker, false);
      if (!ready) {
        status(navigator.onLine ? 'preparing' : 'unavailable');
        if (navigator.onLine) ready = await workerReady(worker, true);
      }
      if (workers.controller === worker)
        status(ready ? 'ready' : 'unavailable');
    } catch {
      if (workers.controller === worker) status('unavailable');
    } finally {
      checking = false;
      if (workers.controller !== worker) void verifyActive();
    }
  }

  function sync() {
    if (disposed) return;
    onUpdate(workers.controller ? (registration?.waiting ?? null) : null);
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
    // Existing offline startup never waits for a network update check.
    void verifyActive();
    if (
      registration &&
      !registration.active &&
      !registration.installing &&
      !registration.waiting
    ) {
      // A failed first install leaves no worker to update. Register again.
      registration.removeEventListener('updatefound', watchInstall);
      registration = undefined;
      installing?.removeEventListener('statechange', sync);
      installing = null;
    }
    if (registration) {
      if (navigator.onLine)
        void registration.update().catch(() => {
          // The installed version remains usable when the update server is unreachable.
        });
      return;
    }
    registering = true;
    if (!workers.controller) status('preparing');
    const timeout = setTimeout(() => {
      if (!workers.controller) status('unavailable');
    }, 25_000);
    try {
      const result = await workers.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      if (disposed) return;
      registration = result;
      registration.addEventListener('updatefound', watchInstall);
      watchInstall();
    } catch (error) {
      if (!workers.controller) status('unavailable');
      if (!disposed && navigator.onLine)
        console.warn(
          '[MassTracker] Не удалось подготовить офлайн-режим',
          error,
        );
    } finally {
      clearTimeout(timeout);
      registering = false;
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') void prepare();
  }

  workers.addEventListener('controllerchange', sync);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', prepare);
  window.addEventListener('offline', sync);
  const interval = setInterval(onVisible, 60 * 60 * 1000);
  void prepare();

  return {
    prepare: () => {
      void prepare();
    },
    dispose: () => {
      disposed = true;
      clearInterval(interval);
      installing?.removeEventListener('statechange', sync);
      registration?.removeEventListener('updatefound', watchInstall);
      workers.removeEventListener('controllerchange', sync);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', prepare);
      window.removeEventListener('offline', sync);
    },
  };
}
