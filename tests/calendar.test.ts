import { addDays, sameDay, weekDays } from '@/features/calendar/calendar';

test('сравнивает календарный день независимо от локального часа', () => {
  const midnight = new Date(2026, 2, 8);
  const morning = new Date(2026, 2, 8, 9);
  const nextDay = new Date(2026, 2, 9);

  expect(sameDay(midnight, morning)).toBe(true);
  expect(sameDay(morning, nextDay)).toBe(false);
});

test('сохраняет выбранный день недели при переходе между месяцами', () => {
  const selected = addDays(new Date(2026, 0, 28), 7);
  expect(sameDay(selected, new Date(2026, 1, 4))).toBe(true);
  expect(weekDays(selected).findIndex((day) => sameDay(day, selected))).toBe(2);
});
