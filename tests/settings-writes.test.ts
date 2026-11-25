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

test('не разрешает обновление, если принятая запись завершилась ошибкой', async () => {
  let fail = (_error: Error) => {};
  const write = trackSettingsWrite(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const outcome = write.catch(() => {});
  const paused = pauseSettingsWrites();
  fail(new Error('disk full'));
  await outcome;
  await expect(paused).rejects.toThrow(/сохранить/);
});
