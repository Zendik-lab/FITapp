import {
  pauseSettingsWrites,
  resumeSettingsWrites,
} from '@/database/settings-writes';

export async function activateUpdate(worker: ServiceWorker) {
  await pauseSettingsWrites();

  try {
    await new Promise<void>((resolve, reject) => {
      const serviceWorkers = navigator.serviceWorker;
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        finish(
          new Error('Время ожидания обновления истекло. Попробуйте ещё раз.'),
        );
      }, 10_000);

      function finish(error?: Error) {
        clearTimeout(timeout);
        channel.port1.close();
        serviceWorkers.removeEventListener(
          'controllerchange',
          onControllerChange,
        );
        if (error) reject(error);
        else resolve();
      }

      function onControllerChange() {
        if (serviceWorkers.controller === worker) finish();
      }

      serviceWorkers.addEventListener('controllerchange', onControllerChange);
      channel.port1.onmessage = ({ data }) => {
        if (data === 'other-windows') {
          finish(
            new Error(
              'Закройте другие окна MassTracker и повторите обновление.',
            ),
          );
        }
      };

      if (serviceWorkers.controller === worker) finish();
      else {
        try {
          worker.postMessage({ type: 'ACTIVATE_UPDATE' }, [channel.port2]);
        } catch {
          finish(
            new Error('Не удалось запустить обновление. Попробуйте ещё раз.'),
          );
        }
      }
    });
    window.location.reload();
  } catch (error) {
    resumeSettingsWrites();
    throw error;
  }
}
