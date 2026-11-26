import {
  SettingsConflictError,
  type SettingsStorage,
} from '@/database/settings-contract';
import { createProfileRepository } from '@/database/repositories/profile';
import { emptyDraft, type ProfileDraft } from '@/features/profile/model';

export const sampleDraft: ProfileDraft = {
  ...emptyDraft,
  name: 'Алекс',
  birthDate: '01.01.1996',
  sex: 'male',
  height: '180',
  currentWeight: '70',
  goal: 'gain',
  targetWeight: '76',
  activity: 'moderate',
  sessions: '3',
  trainingType: 'strength',
  experience: 'beginner',
};

export async function memoryStorage(
  completed = true,
): Promise<SettingsStorage> {
  const values = new Map<string, string>();
  const storage: SettingsStorage = {
    get: async (key) => values.get(key) ?? null,
    list: async () =>
      [...values].map(([key, value]) => ({ key, value, updatedAt: 'test' })),
    apply: async (changes, expected) => {
      if (expected && (values.get(expected.key) ?? null) !== expected.value)
        throw new SettingsConflictError();
      for (const { key, value } of changes) {
        if (value === null) values.delete(key);
        else values.set(key, value);
      }
    },
  };
  if (completed) await createProfileRepository(storage).complete(sampleDraft);
  return storage;
}
