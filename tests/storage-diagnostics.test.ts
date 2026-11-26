/** @jest-environment node */
import { getStorageDiagnostics } from '@/database/storage-diagnostics';
import { trackSettingsWrite } from '@/database/settings-writes';

test('отмечает только завершённый commit и сохраняет его время при следующей ошибке', async () => {
  let finish = () => {};
  const before = getStorageDiagnostics().lastSuccessfulWrite;
  const pending = trackSettingsWrite(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  expect(getStorageDiagnostics().lastSuccessfulWrite).toBe(before);
  finish();
  await pending;
  const committed = getStorageDiagnostics().lastSuccessfulWrite;
  expect(committed).toEqual(expect.any(String));
  const cause = new DOMException('Disk quota exhausted', 'QuotaExceededError');
  await expect(
    trackSettingsWrite(async () => {
      throw new Error('Write failed', { cause });
    }),
  ).rejects.toThrow('Write failed');
  expect(getStorageDiagnostics().lastSuccessfulWrite).toBe(committed);
  expect(getStorageDiagnostics().error).toContain(
    'QuotaExceededError: Disk quota exhausted',
  );
});
