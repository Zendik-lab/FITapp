/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { createNutritionRepository } from '@/database/repositories/nutrition';
import {
  defaultPreferences,
  resolveNutrition,
} from '@/features/nutrition/model';
import { toProfile } from '@/features/profile/validation';
import { sampleDraft } from './fixtures/profile';

const snapshot = resolveNutrition(
  toProfile(sampleDraft),
  defaultPreferences(),
).snapshot!;
test('не пишет значения по умолчанию при чтении; восстанавливает документ после открытия', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  const repository = createNutritionRepository(storage);
  expect(await repository.load()).toBeNull();
  expect(await storage.get('nutrition_state')).toBeNull();
  await storage.apply([
    { key: 'theme_mode', value: 'dark' },
    { key: 'user_state', value: 'keep' },
  ]);
  await repository.save(snapshot);
  const reopened = createNutritionRepository(
    await openIndexedDbSettings(factory),
  );
  expect(await reopened.load()).toEqual(snapshot);
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(await storage.get('user_state')).toBe('keep');
});
test('повреждённые и неподдерживаемые данные остаются нетронутыми', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createNutritionRepository(storage);
  for (const value of [
    '{bad',
    JSON.stringify({ ...snapshot, version: 99 }),
    JSON.stringify({
      ...snapshot,
      preferences: { ...snapshot.preferences, calorieMode: 'unknown' },
    }),
  ]) {
    await storage.apply([{ key: 'nutrition_state', value }]);
    await expect(repository.load()).rejects.toThrow(/поврежд|поддерж/);
    expect(await storage.get('nutrition_state')).toBe(value);
  }
});
test('ошибка commit сохраняет предыдущие цели и допускает повтор', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createNutritionRepository(storage);
  await repository.save(snapshot);
  const failure = jest
    .spyOn(storage, 'apply')
    .mockRejectedValueOnce(new Error('quota'));
  const manual = resolveNutrition(toProfile(sampleDraft), {
    ...defaultPreferences(),
    calorieMode: 'manual',
    manualCalories: 3100,
  }).snapshot!;
  await expect(repository.save(manual)).rejects.toThrow('quota');
  expect(await repository.load()).toEqual(snapshot);
  failure.mockRestore();
  await repository.save(manual);
  expect((await repository.load())?.preferences.manualCalories).toBe(3100);
});

test.each(['goal', 'gainMode', 'calorieMode', 'macroMode'])(
  'строковое перечисление %s не принимает массив и не затирается',
  async (key) => {
    const storage = await openIndexedDbSettings(new IDBFactory());
    const invalid =
      key === 'goal'
        ? { ...snapshot, goal: ['gain'] }
        : {
            ...snapshot,
            preferences: {
              ...snapshot.preferences,
              [key]: [key === 'gainMode' ? 'standard' : 'manual'],
            },
          };
    const raw = JSON.stringify(invalid);
    await storage.apply([{ key: 'nutrition_state', value: raw }]);
    await expect(createNutritionRepository(storage).load()).rejects.toThrow(
      /поврежд/,
    );
    expect(await storage.get('nutrition_state')).toBe(raw);
  },
);

test('устаревший пересчёт другого соединения не заменяет сохранённую ручную цель', async () => {
  const factory = new IDBFactory();
  const first = createNutritionRepository(await openIndexedDbSettings(factory));
  await first.save(snapshot);
  const second = createNutritionRepository(
    await openIndexedDbSettings(factory),
  );
  await second.load();
  const manual = resolveNutrition(toProfile(sampleDraft), {
    ...defaultPreferences(),
    calorieMode: 'manual',
    manualCalories: 3000,
  }).snapshot!;
  await first.save(manual);
  const stale = resolveNutrition(
    toProfile({ ...sampleDraft, currentWeight: '73' }),
    defaultPreferences(),
  ).snapshot!;
  await expect(second.save(stale)).rejects.toThrow(/изменены/);
  expect((await first.load())?.targets.calories).toBe(3000);
  const latest = await second.load();
  const updated = resolveNutrition(
    toProfile({ ...sampleDraft, currentWeight: '73' }),
    latest!.preferences,
  ).snapshot!;
  await second.save(updated);
  expect((await first.load())?.preferences.calorieMode).toBe('manual');
  expect((await first.load())?.targets.calories).toBe(3000);
});

test('повторное чтение не разрешает запись, подготовленную по прежнему снимку', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createNutritionRepository(storage);
  // Existing JSON can have whitespace; comparisons use the exact loaded revision.
  await storage.apply([
    { key: 'nutrition_state', value: JSON.stringify(snapshot, null, 2) },
  ]);
  const previous = await repository.load();
  const manual = resolveNutrition(toProfile(sampleDraft), {
    ...defaultPreferences(),
    calorieMode: 'manual',
    manualCalories: 3000,
  }).snapshot!;
  await createNutritionRepository(storage).save(manual);
  await repository.load();
  await expect(repository.save(snapshot, previous)).rejects.toThrow(/изменены/);
  expect((await repository.load())?.targets.calories).toBe(3000);
});
