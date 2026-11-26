import { currentBuild } from './build-info';

export type WorkerStatus = {
  ready: boolean;
  version: string;
  resources?: number;
  cached?: number;
  error?: string;
};

const diagnosticCache = 'masstracker-diagnostics';
const checkPath = '/__masstracker_update_check__';

export async function readUpdateCheckTime(): Promise<string | undefined> {
  const response = await caches.match(checkPath, {
    cacheName: diagnosticCache,
  });
  if (!response) return;
  const value: unknown = await response.json();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    return value;
}

export async function saveUpdateCheckTime(value: string) {
  const cache = await caches.open(diagnosticCache);
  await cache.put(
    checkPath,
    new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export async function readInstallFailure(
  buildId?: string,
  since?: string,
): Promise<string | undefined> {
  const response = await caches.match('/__masstracker_install_failure__', {
    cacheName: diagnosticCache,
  });
  if (!response) return;
  const data: unknown = await response.json();
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string' &&
    (!since ||
      ('occurredAt' in data &&
        typeof data.occurredAt === 'string' &&
        data.occurredAt >= since)) &&
    (!buildId || ('buildId' in data && data.buildId === buildId))
  )
    return data.error;
}

export function readWorkerStatus(
  worker: ServiceWorker,
  repair = false,
): Promise<WorkerStatus> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error, status?: WorkerStatus) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (error) reject(error);
      else if (status) resolve(status);
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            `Service Worker не ответил за ${repair ? 55 : 5} с (${repair ? 'PREPARE_OFFLINE' : 'GET_OFFLINE_STATUS'}).`,
          ),
        ),
      repair ? 55_000 : 5_000,
    );
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        data.type === 'OFFLINE_STATUS' &&
        'ready' in data &&
        typeof data.ready === 'boolean' &&
        'version' in data &&
        typeof data.version === 'string' &&
        /^[a-f0-9]{20}$/.test(data.version)
      ) {
        finish(undefined, {
          ready: data.ready,
          version: data.version,
          ...('resources' in data && typeof data.resources === 'number'
            ? { resources: data.resources }
            : {}),
          ...('cached' in data && typeof data.cached === 'number'
            ? { cached: data.cached }
            : {}),
          ...('error' in data && typeof data.error === 'string'
            ? { error: data.error }
            : {}),
        });
      } else finish(new Error('Получен некорректный ответ обновления.'));
    };
    try {
      worker.postMessage(
        {
          type: repair ? 'PREPARE_OFFLINE' : 'GET_OFFLINE_STATUS',
          buildId: currentBuild().buildId,
        },
        [channel.port2],
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error('Service Worker недоступен.'),
      );
    }
  });
}
