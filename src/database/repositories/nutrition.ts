import type { SettingsStorage } from '../settings-contract';
import type { NutritionSnapshot } from '@/features/nutrition/model';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function number(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function macros(value: unknown) {
  return (
    record(value) &&
    ['protein', 'fat', 'carbs'].every((key) => number(value[key], 0, 5000))
  );
}
function oneOf(value: unknown, options: readonly string[]) {
  return typeof value === 'string' && options.includes(value);
}
function isSnapshot(value: unknown): value is NutritionSnapshot {
  if (!record(value) || !record(value.preferences) || !record(value.targets))
    return false;
  const p = value.preferences;
  return (
    value.version === 1 &&
    value.algorithmVersion === 'mifflin-1' &&
    typeof value.calculatedAt === 'string' &&
    Number.isFinite(Date.parse(value.calculatedAt)) &&
    typeof value.profileSignature === 'string' &&
    oneOf(value.goal, ['gain', 'maintain', 'lose']) &&
    number(value.surplus, -350, 500) &&
    number(value.recommendedCalories, 1, 20000) &&
    oneOf(p.gainMode, ['gentle', 'standard', 'accelerated']) &&
    oneOf(p.calorieMode, ['auto', 'manual']) &&
    oneOf(p.macroMode, ['auto', 'manual']) &&
    (p.manualCalories === null || number(p.manualCalories, 1, 20000)) &&
    (p.manualMacros === null || macros(p.manualMacros)) &&
    (p.calorieMode !== 'manual' || p.manualCalories !== null) &&
    (p.macroMode !== 'manual' || p.manualMacros !== null) &&
    number(value.targets.calories, 1, 20000) &&
    macros(value.targets)
  );
}

export function createNutritionRepository(storage: SettingsStorage) {
  let expected: string | null | undefined;
  const revisions = new WeakMap<NutritionSnapshot, string>();
  const repository = {
    async load(): Promise<NutritionSnapshot | null> {
      const raw = await storage.get('nutrition_state');
      if (raw === null) {
        expected = raw;
        return null;
      }
      try {
        const value: unknown = JSON.parse(raw);
        if (!isSnapshot(value)) throw new Error('schema');
        expected = raw;
        revisions.set(value, raw);
        return value;
      } catch (cause) {
        throw new Error(
          'Цели питания повреждены или имеют неподдерживаемую версию. Данные сохранены без изменений.',
          { cause },
        );
      }
    },
    // A caller may provide its base snapshot so a later refresh cannot authorize a stale write.
    async save(
      snapshot: NutritionSnapshot,
      previous?: NutritionSnapshot | null,
    ): Promise<void> {
      if (!isSnapshot(snapshot))
        throw new Error('Проверьте значения целей питания.');
      if (expected === undefined) await repository.load();
      const value = JSON.stringify(snapshot);
      const expectedValue =
        previous === undefined
          ? (expected ?? null)
          : previous === null
            ? null
            : (revisions.get(previous) ?? JSON.stringify(previous));
      await storage.apply([{ key: 'nutrition_state', value }], {
        key: 'nutrition_state',
        value: expectedValue,
      });
      expected = value;
      revisions.set(snapshot, value);
    },
  };
  return repository;
}
