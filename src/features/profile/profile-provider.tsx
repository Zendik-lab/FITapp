import { use, useEffect, useRef, useState, type ReactNode } from 'react';
import { StatusScreen } from '@/components/status-screen';
import { createProfileRepository } from '@/database/repositories/profile';
import { getSettingsStorage } from '@/database/settings-storage';
import {
  describeError,
  recordStorageFailure,
} from '@/database/storage-diagnostics';
import { AppSettingsContext } from '@/features/settings/app-settings-context';
import { profileToDraft, type DraftUpdate, type UserState } from './model';
import { ProfileContext } from './profile-context';
import { useConfirmPwaStartup } from '@/features/pwa/pwa-status';

type Repository = ReturnType<typeof createProfileRepository>;
type Loaded = { repository: Repository; state: UserState };

export async function loadProfileSession(): Promise<Loaded> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const repository = createProfileRepository(await getSettingsStorage());
        return { repository, state: await repository.load() };
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Истекло время загрузки профиля.')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const settings = use(AppSettingsContext);
  // Preserve the existing read-only demo when browser storage is unavailable.
  return settings?.storageRecovery ? (
    children
  ) : (
    <LoadProfile>{children}</LoadProfile>
  );
}

function LoadProfile({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadProfileSession().then(
      (value) => {
        if (active) setLoaded(value);
      },
      (error: unknown) => {
        recordStorageFailure(error);
        console.error('[MassTracker] Не удалось загрузить профиль', error);
        if (active)
          setFailure(
            error instanceof Error
              ? error.message
              : 'Не удалось прочитать локальные данные.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (failure)
    return (
      <StatusScreen
        title="Не удалось загрузить профиль"
        message={failure}
        onRetry={() => {
          setFailure(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (!loaded) return <StatusScreen title="Загрузка профиля…" loading />;
  return <ReadyProfile initial={loaded}>{children}</ReadyProfile>;
}

function ReadyProfile({
  initial,
  children,
}: {
  initial: Loaded;
  children: ReactNode;
}) {
  useConfirmPwaStartup();
  const [state, setState] = useState(initial.state);
  const latest = useRef(state);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const revision = useRef(0);
  const busy = useRef(false);

  function report(error: unknown) {
    console.warn('[MassTracker] Не удалось сохранить профиль', error);
    setFailure(
      `Не удалось сохранить данные. Введённые значения остаются на экране. Повторите сохранение. ${describeError(error)}`,
    );
  }

  async function persist(next: UserState) {
    const id = ++revision.current;
    setPending(true);
    try {
      await initial.repository.save(next);
      if (id === revision.current) setFailure(null);
    } catch (error) {
      if (id === revision.current) report(error);
      throw error;
    } finally {
      if (id === revision.current) setPending(false);
    }
  }

  function updateDraft(
    update: DraftUpdate,
    step = latest.current.onboarding.step,
  ) {
    if (busy.current) return;
    const draft =
      typeof update === 'function'
        ? update(latest.current.onboarding.draft)
        : update;
    const next = {
      ...latest.current,
      onboarding: { ...latest.current.onboarding, draft, step },
    };
    latest.current = next;
    setState(next);
    void persist(next).catch(() => {
      /* persist exposes the failure in context. */
    });
  }

  async function confirmed(operation: () => Promise<UserState>) {
    if (busy.current) return;
    busy.current = true;
    ++revision.current;
    setPending(true);
    try {
      const next = await operation();
      latest.current = next;
      setState(next);
      setFailure(null);
    } catch (error) {
      report(error);
      throw error;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <ProfileContext
      value={{
        state,
        pending,
        failure,
        updateDraft,
        retrySave: () => persist(latest.current),
        goToStep: (step) =>
          confirmed(async () => {
            const next = {
              ...latest.current,
              onboarding: { ...latest.current.onboarding, step },
            };
            await initial.repository.save(next);
            return next;
          }),
        complete: (draft) =>
          confirmed(() => initial.repository.complete(draft)),
        restart: () =>
          confirmed(async () => {
            const next = {
              ...latest.current,
              onboarding: {
                completed: false,
                step: 0,
                draft: latest.current.profile
                  ? profileToDraft(latest.current.profile)
                  : latest.current.onboarding.draft,
              },
            };
            await initial.repository.save(next);
            return next;
          }),
      }}
    >
      {children}
    </ProfileContext>
  );
}
