import { createSettingsRepository } from '@/database/repositories/settings';

function mockDatabase() {
  return {
    getFirstAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
  };
}

test('возвращает строку настройки и отличает пустое значение от отсутствующей записи', async () => {
  const database = mockDatabase();
  database.getFirstAsync
    .mockResolvedValueOnce({ value: '' })
    .mockResolvedValueOnce(null);
  const settings = createSettingsRepository(database);

  await expect(settings.get('ключ')).resolves.toBe('');
  await expect(settings.get('неизвестный ключ')).resolves.toBeNull();
  expect(database.getFirstAsync).toHaveBeenCalledWith(
    expect.stringMatching(/WHERE key = \?/i),
    'ключ',
  );
});

test('сохраняет значение через UPSERT и передаёт ключ, значение и дату параметрами', async () => {
  const database = mockDatabase();
  const settings = createSettingsRepository(database);
  const key = "строка ' ключ";
  const value = "строка ' значение";

  await settings.set(key, value);

  expect(database.runAsync).toHaveBeenCalledWith(
    expect.stringMatching(/ON CONFLICT\(key\) DO UPDATE/i),
    key,
    value,
    expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
  );
});

test('удаляет только запись с переданным ключом', async () => {
  const database = mockDatabase();
  const settings = createSettingsRepository(database);

  await settings.remove('настройка');

  expect(database.runAsync).toHaveBeenCalledWith(
    expect.stringMatching(/DELETE FROM app_settings WHERE key = \?/i),
    'настройка',
  );
});
