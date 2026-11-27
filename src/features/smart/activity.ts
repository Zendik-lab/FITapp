import { addDays } from '@/features/calendar/calendar';
import {
  addNutrition,
  dateKey,
  entryNutrition,
  nutrientKeys,
  parseDateKey,
  scaleNutrition,
  zeroNutrition,
} from '@/features/food/domain';
import type { FoodDiaryEntry, FoodState } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';

export function reachesGoal(
  totals: NutritionTargets,
  target: NutritionTargets,
) {
  return (
    target.calories > 0 &&
    nutrientKeys.every((key) =>
      target[key] === 0
        ? totals[key] === 0
        : Math.abs(totals[key] / target[key] - 1) <= 0.1 + Number.EPSILON,
    )
  );
}

export function activityReport(
  entries: readonly FoodDiaryEntry[],
  end: string,
  length: number,
  targets?: NutritionTargets,
) {
  const cutoff = parseDateKey(end);
  const dates = Array.from({ length }, (_, index) =>
    dateKey(addDays(cutoff, index + 1 - length)),
  );
  const dateSet = new Set(dates);
  const allDates = new Set<string>();
  const days = new Map<string, NutritionTargets>();
  const meals = new Set<string>();
  const popular = new Map<
    string,
    { name: string; count: number; recipe: boolean }
  >();
  for (const entry of entries) {
    if (entry.date > end) continue;
    allDates.add(entry.date);
    if (!dateSet.has(entry.date)) continue;
    days.set(
      entry.date,
      addNutrition(
        days.get(entry.date) ?? zeroNutrition,
        entryNutrition(entry),
      ),
    );
    meals.add(entry.date + entry.meal);
    const id = entry.product.id;
    popular.set(id, {
      name: entry.product.name,
      count: (popular.get(id)?.count ?? 0) + 1,
      recipe: !!entry.recipe,
    });
  }
  let current = 0;
  let cursor = allDates.has(end) ? cutoff : addDays(cutoff, -1);
  while (allDates.has(dateKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let streak = 0;
  let previous: string | undefined;
  for (const day of [...allDates].sort()) {
    streak =
      previous === dateKey(addDays(parseDateKey(day), -1)) ? streak + 1 : 1;
    longest = Math.max(streak, longest);
    previous = day;
  }
  const total = [...days.values()].reduce(addNutrition, zeroNutrition);
  const average = days.size ? scaleNutrition(total, 1 / days.size) : null;
  const hits = targets
    ? [...days.values()].filter((day) => reachesGoal(day, targets)).length
    : null;
  return {
    activeDays: days.size,
    current,
    longest,
    average,
    hits,
    mealCount: meals.size,
    days: dates.map((date) => ({ date, totals: days.get(date) })),
    popular: [...popular.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'),
    ),
  };
}

export function coachNotes(
  entries: readonly FoodDiaryEntry[],
  end: string,
  targets?: NutritionTargets,
) {
  const week = activityReport(entries, end, 7, targets);
  const notes: string[] = [];
  const today = week.days.at(-1)?.totals;
  if (targets && today) {
    const protein = Math.round(targets.protein - today.protein);
    const calories = Math.round(targets.calories - today.calories);
    if (protein > 0)
      notes.push(`На выбранную дату до цели по белку осталось ${protein} г.`);
    if (calories > 0)
      notes.push(`До цели по калориям осталось ${calories} ккал.`);
  }
  if (week.activeDays < 3)
    notes.push(
      'Для сравнения рациона с целью нужны записи хотя бы за три дня.',
    );
  else if (targets && week.average) {
    const logged = week.days.flatMap((day) => day.totals ?? []);
    const previous = activityReport(
      entries,
      dateKey(addDays(parseDateKey(end), -7)),
      7,
    ).average;
    if (
      logged.filter((day) => day.calories < targets.calories * 0.9).length /
        logged.length >=
      0.75
    ) {
      notes.push(
        'В большинстве записанных дней калорийность ниже текущей цели. Проверьте полноту записей и размеры привычных порций.',
      );
    }
    if (
      previous &&
      Math.abs(previous.calories - targets.calories) >
        Math.abs(week.average.calories - targets.calories)
    ) {
      notes.push(
        'Средняя калорийность записанных дней приблизилась к текущей цели по сравнению с предыдущей неделей.',
      );
    }
    for (const [key, label] of [
      ['protein', 'белкам'],
      ['fat', 'жирам'],
      ['carbs', 'углеводам'],
    ] as const) {
      if (
        targets[key] > 0 &&
        logged.filter((day) => day[key] < targets[key] * 0.9).length /
          logged.length >=
          0.75
      ) {
        notes.push(
          `В большинстве записанных дней показатель по ${label} был ниже текущей цели.`,
        );
      }
    }
  }
  if (week.activeDays && week.activeDays < 7)
    notes.push(
      `За семь дней есть записи за ${week.activeDays}. Средние рассчитаны только по этим дням.`,
    );
  return notes;
}

export const achievements = [
  { id: 'firstEntry', title: 'Первая запись', target: 1 },
  { id: 'firstRecipe', title: 'Первый свой рецепт', target: 1 },
  { id: 'streak3', title: '3 дня подряд', target: 3 },
  { id: 'streak7', title: '7 дней подряд', target: 7 },
  { id: 'streak14', title: '14 дней подряд', target: 14 },
  { id: 'streak30', title: '30 дней подряд', target: 30 },
  { id: 'firstGoal', title: 'Первое выполнение дневной цели', target: 1 },
  { id: 'firstWeek', title: 'Первый недельный отчёт', target: 1 },
] as const;

export function historicalMilestones(state: FoodState, today: string) {
  const dates = [
    ...new Set(
      state.entries.map((row) => row.date).filter((date) => date <= today),
    ),
  ].sort();
  const earned: Record<string, string> = {};
  if (dates.length) earned.firstEntry = dates[0];
  const recipe = [...state.recipes].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )[0];
  if (recipe && Number.isFinite(Date.parse(recipe.createdAt)))
    earned.firstRecipe = dateKey(new Date(recipe.createdAt));
  let streak = 0;
  let previous: string | undefined;
  for (const date of dates) {
    streak =
      previous === dateKey(addDays(parseDateKey(date), -1)) ? streak + 1 : 1;
    previous = date;
    if ([3, 7, 14, 30].includes(streak)) earned[`streak${streak}`] ??= date;
  }
  return { ...earned, ...state.milestones };
}
