import {
  pauseSettingsWrites,
  resumeSettingsWrites,
  trackSettingsWrite,
} from '@/database/settings-writes';

afterEach(resumeSettingsWrites);

test('ждёт активную запись и блокирует новые до завершения обновления', async () => {
  let commit = () => {};
  let saved = false;
  const write = trackSettingsWrite(async () => {
    await new Promise<void>((resolve) => {
      commit = resolve;
    });
    saved = true;
  });

  const ready = pauseSettingsWrites().then(() => saved);
  await expect(trackSettingsWrite(async () => {})).rejects.toThrow(
    /обновление/,
  );
  expect(saved).toBe(false);
  commit();
  await write;
  await expect(ready).resolves.toBe(true);

  resumeSettingsWrites();
  await expect(trackSettingsWrite(async () => {})).resolves.toBeUndefined();
});
