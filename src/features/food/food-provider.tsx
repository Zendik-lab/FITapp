import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { getSettingsStorage } from '@/database/settings-storage';
import { createFoodRepository } from '@/database/repositories/food';
import { describeError } from '@/database/storage-diagnostics';
import { useProfile } from '@/features/profile/profile-context';
import { builtinFoods } from './catalog';
import { FoodContext } from './food-context';
import { emptyFoodState, type FoodState } from './model';

export function FoodProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  return profile ? <StoredFood>{children}</StoredFood> : children;
}
function StoredFood({ children }: { children: ReactNode }) {
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
    try {
      setState(await repository.current.change(operation));
    } catch (error) {
      setFailure(describeError(error));
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
        change,
        reload,
      }}
    >
      {children}
    </FoodContext>
  );
}
