import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { getSettingsStorage } from '@/database/settings-storage';
import { createFoodRepository } from '@/database/repositories/food';
import { describeError } from '@/database/storage-diagnostics';
import { useProfile } from '@/features/profile/profile-context';
import { builtinFoods } from './catalog';
import { FoodContext } from './food-context';
import { emptyFoodState, type FoodState } from './model';
import { dateKey, sumEntries } from './domain';
import {
  achievements,
  historicalMilestones,
  reachesGoal,
} from '@/features/smart/activity';
import { useNutrition } from '@/features/nutrition/nutrition-context';
import { useHapticFeedback } from '@/features/settings/feedback';

export function FoodProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  return profile ? <StoredFood>{children}</StoredFood> : children;
}
function StoredFood({ children }: { children: ReactNode }) {
  const nutrition = useNutrition();
  const haptic = useHapticFeedback();
  const [award, setAward] = useState<FoodSessionAward>();
  const [state, setState] = useState(emptyFoodState);
  const products = useMemo(
    () => [...builtinFoods, ...state.products],
    [state.products],
  );
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const repository = useRef<ReturnType<typeof createFoodRepository> | null>(
    null,
  );
  const busy = useRef(false);
  async function reload() {
    if (busy.current) return;
    busy.current = true;
    try {
      repository.current ??= createFoodRepository(await getSettingsStorage());
      setState(await repository.current.load());
      setFailure(null);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
    const subscription = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reload();
    });
    const focus = () => void reload();
    if (Platform.OS === 'web') window.addEventListener('focus', focus);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', focus);
    };
  }, []);
  async function change(operation: (state: FoodState) => FoodState) {
    if (busy.current || loading)
      throw new Error('Дождитесь завершения сохранения.');
    if (!repository.current || failure)
      throw new Error('Сначала повторите загрузку дневника.');
    busy.current = true;
    setPending(true);
    let rejectedOperation = false;
    try {
      let earned: FoodSessionAward | undefined;
      const date = dateKey(new Date());
      const target = nutrition?.issues.length
        ? undefined
        : nutrition?.snapshot?.targets;
      setState(
        await repository.current.change((current) => {
          let next: FoodState;
          try {
            next = operation(current);
          } catch (error) {
            rejectedOperation = true;
            throw error;
          }
          if (
            next.entries === current.entries &&
            next.recipes === current.recipes &&
            next.milestones === current.milestones
          )
            return next;
          const before = historicalMilestones(current, date);
          const milestones = { ...before, ...historicalMilestones(next, date) };
          const goalEvent =
            target &&
            current.entries !== next.entries &&
            !reachesGoal(sumEntries(current.entries, date), target) &&
            reachesGoal(sumEntries(next.entries, date), target) &&
            milestones.lastGoalDay !== date;
          if (goalEvent) {
            milestones.firstGoal ??= date;
            milestones.lastGoalDay = date;
          }
          const achievement = achievements.find(
            ({ id }) => milestones[id] && !before[id],
          );
          if (goalEvent || achievement)
            earned = {
              key: goalEvent ? `goal:${date}` : (achievement?.id ?? date),
              label: goalEvent
                ? 'Дневная цель выполнена'
                : (achievement?.title ?? ''),
            };
          return Object.keys(milestones).length
            ? { ...next, milestones }
            : next;
        }),
      );
      if (earned) {
        setAward(earned);
        haptic('success');
      }
    } catch (error) {
      if (!rejectedOperation) setFailure(describeError(error));
      throw error;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <FoodContext
      value={{
        state,
        products,
        loading,
        pending,
        failure,
        award,
        dismissAward: () => setAward(undefined),
        change,
        reload,
      }}
    >
      {children}
    </FoodContext>
  );
}

type FoodSessionAward = { key: string; label: string };
