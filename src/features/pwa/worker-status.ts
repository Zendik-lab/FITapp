import { currentBuild } from './build-info';

export type WorkerStatus = { ready: boolean; version: string };

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
            'Не удалось проверить готовность обновления. Повторите попытку.',
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
        finish(undefined, { ready: data.ready, version: data.version });
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
