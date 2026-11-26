import { getSettingsStorage } from './settings-storage';
import {
  recordStorageFailure,
  restoreStorageWriteTime,
} from './storage-diagnostics';

/** Read existing commit timestamps; inspecting never seeds or changes user data. */
export async function inspectStorage() {
  try {
    const records = await (await getSettingsStorage()).list();
    const dates = records
      .filter(({ key }) => key === 'user_state' || key === 'theme_mode')
      .map(({ updatedAt }) => updatedAt)
      .filter((date) => Number.isFinite(Date.parse(date)))
      .sort();
    restoreStorageWriteTime(dates.at(-1));
  } catch (error) {
    recordStorageFailure(error);
    throw error;
  }
}
