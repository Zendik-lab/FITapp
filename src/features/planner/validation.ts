import { parseDateKey, validNutrition } from '@/features/food/domain';
import type { FoodDiaryEntry } from '@/features/food/model';
import {
  generationModes,
  planMealKinds,
  type GenerationSettings,
} from './model';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  (!required || !!value.trim());

export const validPlanTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validGeneration(value: unknown): value is GenerationSettings {
  return (
    record(value) &&
    integer(value.days, 1, 14) &&
    integer(value.meals, 1, 12) &&
    integer(value.maxMinutes, 0, 1440) &&
    typeof value.mode === 'string' &&
    Object.hasOwn(generationModes, value.mode) &&
    ['any', 'vegetarian', 'vegan'].includes(String(value.diet)) &&
    text(value.excludes, 2000) &&
    text(value.allergies, 2000) &&
    text(value.preferences, 2000) &&
    typeof value.repeats === 'boolean' &&
    typeof value.sport === 'boolean' &&
    typeof value.stockOnly === 'boolean'
  );
}

export function validPlanner(
  value: unknown,
  validEntry: (value: unknown) => value is FoodDiaryEntry,
) {
  if (
    !record(value) ||
    value.version !== 1 ||
    !record(value.days) ||
    !Array.isArray(value.templates) ||
    (value.generation !== undefined && !validGeneration(value.generation))
  )
    return false;

  function meals(rows: unknown, itemIds: Set<string>, date?: string) {
    const ids = new Set<string>();
    return (
      Array.isArray(rows) &&
      rows.every((row: unknown) => {
        if (
          !record(row) ||
          !text(row.id, 100, true) ||
          ids.has(row.id) ||
          typeof row.kind !== 'string' ||
          !Object.hasOwn(planMealKinds, row.kind) ||
          !text(row.title, 80, true) ||
          typeof row.time !== 'string' ||
          !validPlanTime(row.time) ||
          !Array.isArray(row.items)
        )
          return false;
        ids.add(row.id);
        return row.items.every((item: unknown) => {
          if (
            !record(item) ||
            typeof item.locked !== 'boolean' ||
            !validEntry(item.entry) ||
            itemIds.has(item.entry.id) ||
            (date && item.entry.date !== date)
          )
            return false;
          itemIds.add(item.entry.id);
          return true;
        });
      })
    );
  }

  const itemIds = new Set<string>();
  const templateIds = new Set<string>();
  return (
    Object.entries(value.days).every(([date, day]) => {
      try {
        parseDateKey(date);
      } catch {
        return false;
      }
      return (
        record(day) &&
        date === day.date &&
        (day.target === undefined || validNutrition(day.target)) &&
        meals(day.meals, itemIds, date)
      );
    }) &&
    value.templates.every((template: unknown) => {
      if (
        !record(template) ||
        !text(template.id, 100, true) ||
        templateIds.has(template.id) ||
        !text(template.name, 80, true)
      )
        return false;
      templateIds.add(template.id);
      return meals(template.meals, new Set());
    })
  );
}
