/** @jest-environment node */
import { IDBFactory } from 'fake-indexeddb';
import { openIndexedDbSettings } from '@/database/settings-storage.web';
import { createProfileRepository } from '@/database/repositories/profile';
import { emptyDraft } from '@/features/profile/model';
import {
  pauseSettingsWrites,
  resumeSettingsWrites,
} from '@/database/settings-writes';

const draft = {
  ...emptyDraft,
  name: 'Алекс',
  birthDate: '01.01.1996',
  sex: 'male' as const,
  height: '180',
  currentWeight: '70',
  goal: 'gain' as const,
  targetWeight: '76',
  activity: 'moderate' as const,
  sessions: '0',
};

test('восстанавливает последний шаг и незавершённые значения при новом открытии', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  const repository = createProfileRepository(storage);
  const initial = await repository.load();
  expect(initial.profile).toBeNull();
  expect(initial.onboarding.completed).toBe(false);
  await repository.save({
    ...initial,
    onboarding: {
      completed: false,
      step: 3,
      draft: { ...emptyDraft, name: 'Алекс', height: '18,' },
    },
  });
  const reopened = createProfileRepository(
    await openIndexedDbSettings(factory),
  );
  expect((await reopened.load()).onboarding).toMatchObject({
    step: 3,
    draft: { name: 'Алекс', height: '18,' },
  });
});

test('создаёт профиль атомарно, редактирует и повторяет анкету без удаления других данных', async () => {
  const factory = new IDBFactory();
  const storage = await openIndexedDbSettings(factory);
  await storage.apply([
    { key: 'theme_mode', value: 'dark' },
    { key: 'other_data', value: 'keep' },
  ]);
  const repository = createProfileRepository(storage);
  const saved = await repository.complete(draft);
  expect(saved.onboarding.completed).toBe(true);
  expect(saved.profile?.body.currentWeightKg).toBe(70);
  const updated = await repository.complete({ ...draft, name: 'Александр' });
  expect(updated.profile?.personal.name).toBe('Александр');
  await repository.save({
    ...updated,
    onboarding: {
      completed: false,
      step: 0,
      draft: { ...draft, name: 'Александр' },
    },
  });
  const reopened = createProfileRepository(
    await openIndexedDbSettings(factory),
  );
  expect((await reopened.load()).profile?.personal.name).toBe('Александр');
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(await storage.get('other_data')).toBe('keep');
});

test('сбой записи не завершает анкету, повреждённые данные не затираются', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createProfileRepository(storage);
  const apply = jest
    .spyOn(storage, 'apply')
    .mockRejectedValueOnce(new Error('disk full'));
  await expect(repository.complete(draft)).rejects.toThrow('disk full');
  expect((await repository.load()).onboarding.completed).toBe(false);
  apply.mockRestore();
  await storage.apply([{ key: 'user_state', value: '{bad' }]);
  await expect(repository.load()).rejects.toThrow(/поврежд|формат/i);
  expect(await storage.get('user_state')).toBe('{bad');
});

test('миграция IndexedDB v1 сохраняет существующую тему и добавляет версию профиля', async () => {
  const factory = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('masstracker', 1);
    request.onupgradeneeded = () =>
      request.result
        .createObjectStore('app_settings', { keyPath: 'key' })
        .put({ key: 'theme_mode', value: 'dark', updatedAt: 'old' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  const storage = await openIndexedDbSettings(factory);
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(await storage.get('user_state_schema')).toBe('1');
});

test('последовательные записи сохраняют последний ввод даже после отказа предыдущей записи', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createProfileRepository(storage);
  const initial = await repository.load();
  jest
    .spyOn(storage, 'apply')
    .mockRejectedValueOnce(new Error('temporary failure'));
  const first = repository.save({
    ...initial,
    onboarding: {
      ...initial.onboarding,
      draft: { ...emptyDraft, name: 'старое' },
    },
  });
  const last = repository.save({
    ...initial,
    onboarding: {
      ...initial.onboarding,
      step: 1,
      draft: { ...emptyDraft, name: 'новое' },
    },
  });
  await expect(first).rejects.toThrow('temporary failure');
  await last;
  expect((await repository.load()).onboarding).toMatchObject({
    step: 1,
    draft: { name: 'новое' },
  });
});

test('обновление PWA ожидает всю очередь принятых черновиков', async () => {
  const storage = await openIndexedDbSettings(new IDBFactory());
  const repository = createProfileRepository(storage);
  const initial = await repository.load();
  const results = [
    repository.save({
      ...initial,
      onboarding: {
        ...initial.onboarding,
        draft: { ...emptyDraft, name: 'A' },
      },
    }),
    repository.save({
      ...initial,
      onboarding: {
        ...initial.onboarding,
        draft: { ...emptyDraft, name: 'AB' },
      },
    }),
  ];
  const outcomes = Promise.allSettled(results);
  try {
    await pauseSettingsWrites();
    expect(await outcomes).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ]);
    expect((await repository.load()).onboarding.draft.name).toBe('AB');
  } finally {
    resumeSettingsWrites();
  }
});
