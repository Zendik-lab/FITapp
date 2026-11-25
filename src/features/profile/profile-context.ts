import { createContext, use } from 'react';
import type { ProfileDraft, UserState } from './model';

export interface ProfileSession {
  state: UserState;
  pending: boolean;
  failure: string | null;
  updateDraft(draft: ProfileDraft, step?: number): void;
  goToStep(step: number): Promise<void>;
  retrySave(): Promise<void>;
  complete(draft: ProfileDraft): Promise<void>;
  restart(): Promise<void>;
}

export const ProfileContext = createContext<ProfileSession | null>(null);
export function useProfile() {
  return use(ProfileContext);
}
