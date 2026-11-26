import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { StatusScreen } from '@/components/status-screen';
import { createNutritionRepository } from '@/database/repositories/nutrition';
import { getSettingsStorage } from '@/database/settings-storage';
import { describeError } from '@/database/storage-diagnostics';
import { SettingsConflictError } from '@/database/settings-contract';
import { useProfile } from '@/features/profile/profile-context';
import { useSelectedDate } from '@/features/calendar/selected-date';
import {
  defaultPreferences,
  resolveNutrition,
  type NutritionSnapshot,
  type NutritionPreferences,
} from './model';
import { NutritionContext } from './nutrition-context';

type Repository = ReturnType<typeof createNutritionRepository>;
type Loaded = { repository: Repository; snapshot: NutritionSnapshot | null };

export function NutritionProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  // The existing storage-recovery demonstration remains read-only.
  return profile ? <LoadNutrition>{children}</LoadNutrition> : children;
}

function LoadNutrition({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      active = false;
      setFailure('Истекло время загрузки целей питания. Повторите загрузку.');
    }, 10000);
    void (async () => {
      const repository = createNutritionRepository(await getSettingsStorage());
      return { repository, snapshot: await repository.load() };
    })().then(
      (value) => {
        clearTimeout(timer);
        if (active) setLoaded(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (active) setFailure(describeError(error));
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [attempt]);
  if (failure)
    return (
      <NutritionContext
        value={{
          recommendation: null,
          snapshot: null,
          issues: [
            'Не удалось загрузить цели питания. Данные сохранены без изменений.',
          ],
          preferences: defaultPreferences(),
          pending: false,
          loadFailed: true,
          failure,
          save: async () => {
            throw new Error(failure);
          },
          retry: () => {
            setFailure(undefined);
            setAttempt((v) => v + 1);
          },
        }}
      >
        {children}
      </NutritionContext>
    );
  if (!loaded) return <StatusScreen title="Загрузка целей питания…" loading />;
  return <ReadyNutrition initial={loaded}>{children}</ReadyNutrition>;
}

function ReadyNutrition({
  initial,
  children,
}: {
  initial: Loaded;
  children: ReactNode;
}) {
  const profile = useProfile()?.state.profile ?? null;
  const { today } = useSelectedDate();
  const [preferences, setPreferences] = useState(
    initial.snapshot?.preferences ?? defaultPreferences,
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [failedSignature, setFailedSignature] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(initial.snapshot);
  const busy = useRef(false);
  const resolution = useMemo(() => {
    const now = new Date();
    now.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    const result = resolveNutrition(profile, preferences, now);
    if (
      result.snapshot &&
      result.snapshot.profileSignature === saved?.profileSignature
    )
      result.snapshot.calculatedAt = saved.calculatedAt;
    return result;
  }, [profile, preferences, today, saved]);
  const signature = resolution.snapshot?.profileSignature;
  const pending =
    saving ||
    (!!signature &&
      signature !== saved?.profileSignature &&
      signature !== failedSignature);

  function report(error: unknown) {
    setFailure(
      `Не удалось сохранить цели питания. Повторите сохранение. ${describeError(error)}`,
    );
  }

  useEffect(() => {
    const snapshot = resolution.snapshot;
    if (!snapshot || snapshot.profileSignature === saved?.profileSignature)
      return;
    // Every operation joins the storage's existing commit/update queue.
    let active = true;
    void initial.repository.save(snapshot, saved).then(
      () => {
        if (active) setSaved(snapshot);
        if (active) setFailure(null);
      },
      async (error: unknown) => {
        if (!active) return;
        if (error instanceof SettingsConflictError) {
          try {
            const latest = await initial.repository.load();
            if (active) {
              setSaved(latest);
              setPreferences(latest?.preferences ?? defaultPreferences());
              setFailure(null);
              setFailedSignature(undefined);
            }
            return;
          } catch (readError) {
            error = readError;
          }
        }
        if (active) {
          setFailedSignature(snapshot.profileSignature);
          report(error);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [resolution, initial.repository, attempt, saved]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || busy.current) return;
      void initial.repository.load().then(
        (latest) => {
          if (busy.current) return;
          setSaved(latest);
          setPreferences(latest?.preferences ?? defaultPreferences());
        },
        (error: unknown) =>
          setFailure(
            `Не удалось обновить цели питания. ${describeError(error)}`,
          ),
      );
    });
    return () => subscription.remove();
  }, [initial.repository]);

  async function save(next: NutritionPreferences) {
    if (busy.current || pending)
      throw new Error('Дождитесь завершения сохранения.');
    const result = resolveNutrition(profile, next, new Date());
    if (!result.snapshot || result.issues.length)
      throw new Error(result.issues.join(' '));
    busy.current = true;
    setSaving(true);
    try {
      await initial.repository.save(result.snapshot, saved);
      setSaved(result.snapshot);
      setPreferences(next);
      setFailure(null);
    } catch (error) {
      if (error instanceof SettingsConflictError) {
        const latest = await initial.repository.load();
        setSaved(latest);
        setPreferences(latest?.preferences ?? defaultPreferences());
      }
      throw error;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <NutritionContext
      value={{
        ...resolution,
        preferences,
        pending,
        failure,
        loadFailed: false,
        save,
        retry: () => {
          setFailedSignature(undefined);
          setAttempt((v) => v + 1);
        },
      }}
    >
      {children}
    </NutritionContext>
  );
}
