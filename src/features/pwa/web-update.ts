import {
  pauseSettingsWrites,
  resumeSettingsWrites,
} from '@/database/settings-writes';
import { currentBuild } from './build-info';
import { isUpdateBlocked } from './update-safety';
import { readWorkerStatus } from './worker-status';

const reloadKey = 'masstracker:last-update-reload';

export function wasUpdateInstalled(): boolean {
  try {
    return window.sessionStorage.getItem(reloadKey) === currentBuild().buildId;
  } catch {
    // Confirmation is optional when the browser denies sessionStorage access.
    return false;
  }
}

function assertSafeToUpdate() {
  if (
    isUpdateBlocked() ||
    document.activeElement?.matches('input, textarea, [contenteditable="true"]')
  )
    throw new Error(
      'Завершите заполнение формы и сохраните изменения перед обновлением.',
    );
}

export async function activateUpdate(worker: ServiceWorker) {
  try {
    assertSafeToUpdate();
    const target = await readWorkerStatus(worker);
    if (!target.ready)
      throw new Error(
        'Обновление ещё не загружено полностью. Повторите проверку.',
      );
    if (window.sessionStorage.getItem(reloadKey) === target.version)
      throw new Error(
        'Повторная перезагрузка этой сборки остановлена. Закройте и снова откройте приложение.',
      );
    if (target.version === currentBuild().buildId)
      throw new Error('Эта версия уже установлена.');
    await pauseSettingsWrites();
    assertSafeToUpdate();
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
        if (data === 'not-ready')
          finish(
            new Error(
              'Обновление ещё не готово для работы без интернета. Повторите проверку.',
            ),
          );
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
    assertSafeToUpdate();
    window.sessionStorage.setItem(reloadKey, target.version);
    window.location.reload();
  } catch (error) {
    resumeSettingsWrites();
    throw error;
  }
}
