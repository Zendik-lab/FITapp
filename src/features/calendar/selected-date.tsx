import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { addDays, localDay, sameDay } from './calendar';

const SelectedDateContext = createContext<{
  today: Date;
  selectedDate: Date;
  selectDate: (date: Date) => void;
} | null>(null);

export function SelectedDateProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState(() => localDay(new Date()));
  const [customDate, setCustomDate] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      const day = localDay(now);
      setToday((previous) => (sameDay(previous, day) ? previous : day));
      timer = setTimeout(
        refresh,
        addDays(day, 1).getTime() - now.getTime() + 100,
      );
    }

    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return (
    <SelectedDateContext
      value={{
        today,
        selectedDate: customDate ?? today,
        selectDate: (date) => setCustomDate(sameDay(date, today) ? null : date),
      }}
    >
      {children}
    </SelectedDateContext>
  );
}

export function useSelectedDate() {
  const value = use(SelectedDateContext);
  if (!value) throw new Error('Не подключён SelectedDateProvider.');
  return value;
}
