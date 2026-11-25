import type { SettingsStorage } from '../settings-contract';
import {
  emptyDraft,
  initialUserState,
  profileToDraft,
  type ProfileDraft,
  type UserState,
} from '@/features/profile/model';
import { toProfile } from '@/features/profile/validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDraft(value: unknown): value is ProfileDraft {
  return (
    isRecord(value) &&
    Object.keys(emptyDraft).every((key) => typeof value[key] === 'string')
  );
}

export function createProfileRepository(storage: SettingsStorage) {
  function save(state: UserState): Promise<void> {
    const value = JSON.stringify({
      ...state,
      profile: state.profile ? profileToDraft(state.profile) : null,
    });
    return storage.apply([{ key: 'user_state', value }]);
  }
  return {
    async load(): Promise<UserState> {
      const raw = await storage.get('user_state');
      if (raw === null) return initialUserState();
      try {
        const value: unknown = JSON.parse(raw);
        if (
          !isRecord(value) ||
          value.version !== 1 ||
          !isRecord(value.onboarding)
        )
          throw new Error('schema');
        const { completed, step, draft } = value.onboarding;
        if (
          typeof completed !== 'boolean' ||
          typeof step !== 'number' ||
          !Number.isInteger(step) ||
          step < 0 ||
          step > 7 ||
          !isDraft(draft) ||
          (value.profile !== null && !isDraft(value.profile)) ||
          (completed && value.profile === null)
        )
          throw new Error('schema');
        return {
          version: 1,
          profile:
            value.profile === null
              ? null
              : toProfile(value.profile as ProfileDraft),
          onboarding: { completed, step, draft },
        };
      } catch (cause) {
        throw new Error(
          'Формат профиля повреждён или не поддерживается. Данные сохранены без изменений.',
          { cause },
        );
      }
    },
    save,
    async complete(draft: ProfileDraft): Promise<UserState> {
      const profile = toProfile(draft);
      const state: UserState = {
        version: 1,
        profile,
        onboarding: {
          completed: true,
          step: 7,
          draft: profileToDraft(profile),
        },
      };
      await save(state);
      return state;
    },
  };
}
