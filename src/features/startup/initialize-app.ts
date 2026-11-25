import { getSettingsStorage } from '@/database/settings-storage';
import {
  loadAppSettings,
  type AppSettings,
} from '@/features/settings/app-settings';

const startupTimeoutMs = 10_000;

export async function initializeApp(): Promise<AppSettings> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Истекло время ожидания запуска MassTracker.')),
      startupTimeoutMs,
    );
  });
  try {
    const startup = getSettingsStorage().then(loadAppSettings);
    return await Promise.race([startup, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
