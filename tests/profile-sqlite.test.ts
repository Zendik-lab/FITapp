/** @jest-environment node */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from '@/database/migrations';
import { getSettingsStorage } from '@/database/settings-storage';
import { createProfileRepository } from '@/database/repositories/profile';
import { initialMigration } from '@/database/migrations/001-initial';
import { sampleDraft } from './fixtures/profile';
import { createNutritionRepository } from '@/database/repositories/nutrition';
import { createFoodRepository } from '@/database/repositories/food';
import { builtinFoods } from '@/features/food/catalog';
import { makeEntry } from '@/features/food/domain';
import { addEntry } from '@/features/food/operations';
import { makeIngredient } from '@/features/recipes/domain';
import { addRecipeEntry, saveRecipe } from '@/features/recipes/operations';
import {
  createPlanDay,
  createPlanMeal,
  markPlanMeal,
  planItemFromProduct,
  readPlanner,
  savePlanDays,
} from '@/features/planner/operations';
import {
  defaultPreferences,
  resolveNutrition,
} from '@/features/nutrition/model';
import { toProfile } from '@/features/profile/validation';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

let sql: DatabaseSync;
function bindings(params: unknown[]): SQLInputValue[] {
  const values: unknown[] =
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values.map((value) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      value === null ||
      value instanceof Uint8Array
    )
      return value;
    if (typeof value === 'boolean') return Number(value);
    throw new Error('Unsupported test binding');
  });
}
const mockDatabase = {
  execAsync: async (statement: string) => {
    sql.exec(statement);
  },
  getFirstAsync: async <T>(statement: string, ...params: unknown[]) =>
    sql.prepare(statement).get(...bindings(params)) as T | null,
  getAllAsync: async <T>(statement: string, ...params: unknown[]) =>
    sql.prepare(statement).all(...bindings(params)) as T[],
  runAsync: async (statement: string, ...params: unknown[]) => {
    const result = sql.prepare(statement).run(...bindings(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  },
  withTransactionAsync: async (operation: () => Promise<void>) => {
    sql.exec('BEGIN');
    try {
      await operation();
      sql.exec('COMMIT');
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  },
  withExclusiveTransactionAsync: async (
    operation: (
      transaction: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>,
    ) => Promise<void>,
  ): Promise<void> => {
    await mockDatabase.withTransactionAsync(() => operation(mockDatabase));
  },
};
jest.mock('@/database/client', () => ({
  getDatabase: async () => mockDatabase,
}));
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
});
afterEach(() => sql.close());

test('реальный SQLite обновляет схему v1 и сохраняет профиль с параметризованным именем', async () => {
  await migrateDatabase(mockDatabase, [initialMigration]);
  sql
    .prepare(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
    )
    .run('theme_mode', 'dark', 'old');
  await migrateDatabase(mockDatabase);
  const storage = await getSettingsStorage();
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(await storage.get('user_state_schema')).toBe('1');
  const repository = createProfileRepository(storage);
  const name = "Алекс'; DROP TABLE app_settings; --";
  await repository.complete({ ...sampleDraft, name });
  const reopened = createProfileRepository(await getSettingsStorage());
  expect((await reopened.load()).profile?.personal.name).toBe(name);
  expect(await storage.get('theme_mode')).toBe('dark');
  expect(
    sql.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
  ).toEqual([
    { version: 1 },
    { version: 2 },
    { version: 3 },
    { version: 4 },
    { version: 5 },
    { version: 6 },
  ]);
});

test('SQLite применяет миграцию планов поверх прежней схемы и сохраняет связанные записи', async () => {
  await migrateDatabase(mockDatabase);
  sql.exec(
    "DELETE FROM schema_migrations WHERE version = 6; DELETE FROM app_settings WHERE key = 'meal_planner_schema'",
  );
  const storage = await getSettingsStorage();
  const repository = createFoodRepository(storage);
  const date = '2026-11-27';
  const product = builtinFoods[0];
  const existing = makeEntry(product, 100, 'g', 'lunch', date);
  await repository.change((state) => addEntry(state, existing));
  await migrateDatabase(mockDatabase);
  expect(await storage.get('meal_planner_schema')).toBe('1');
  const meal = createPlanMeal('breakfast');
  const item = planItemFromProduct(product, 110, 'g', date, meal.kind);
  const populated = { ...meal, items: [item] };
  const day = { ...createPlanDay(date), meals: [populated] };
  await repository.change((state) => savePlanDays(state, [day]));
  await repository.change((state) => markPlanMeal(state, day, populated));
  const loaded = await createFoodRepository(await getSettingsStorage()).load();
  expect(readPlanner(loaded).days[date]).toEqual(day);
  expect(loaded.entries.map(({ id }) => id)).toEqual([
    existing.id,
    item.entry.id,
  ]);
});

test('файловый SQLite восстанавливает профиль, анкету, цель и тему после закрытия соединения', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'masstracker-sqlite-'));
  const file = join(directory, 'masstracker.db');
  sql.close();
  sql = new DatabaseSync(file);
  try {
    await migrateDatabase(mockDatabase);
    const storage = await getSettingsStorage();
    await storage.apply([{ key: 'theme_mode', value: 'dark' }]);
    await createProfileRepository(storage).complete({
      ...sampleDraft,
      name: 'На диске',
      targetWeight: '79',
    });
    const nutrition = resolveNutrition(toProfile(sampleDraft), {
      ...defaultPreferences(),
      calorieMode: 'manual',
      manualCalories: 3100,
    }).snapshot;
    if (!nutrition) throw new Error('Missing test nutrition targets');
    await createNutritionRepository(storage).save(nutrition);
    const entry = makeEntry(
      builtinFoods[0],
      150.5,
      'g',
      'breakfast',
      '2026-11-26',
    );
    await createFoodRepository(storage).change((s) => addEntry(s, entry));
    const recipe = {
      id: 'sqlite-recipe',
      name: 'На диске',
      category: 'Другое' as const,
      servings: 2,
      isFavorite: true,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      ingredients: [makeIngredient(builtinFoods[0], 0.4, 'kg')],
    };
    await createFoodRepository(storage).change((s) => saveRecipe(s, recipe));
    await createFoodRepository(storage).change((s) =>
      addRecipeEntry(
        s,
        recipe.id,
        0.5,
        'serving',
        'lunch',
        entry.date,
        'sqlite-entry',
      ),
    );
    sql.close();
    sql = new DatabaseSync(file);
    await migrateDatabase(mockDatabase);
    const reopened = await getSettingsStorage();
    const state = await createProfileRepository(reopened).load();
    expect(state.onboarding.completed).toBe(true);
    expect(state.profile?.personal.name).toBe('На диске');
    expect(state.profile?.goals.targetWeightKg).toBe(79);
    expect(await reopened.get('theme_mode')).toBe('dark');
    expect(await createNutritionRepository(reopened).load()).toEqual(nutrition);
    const diary = await createFoodRepository(reopened).load();
    expect(await reopened.get('recipes_schema')).toBe('1');
    expect(diary.recipes).toEqual([recipe]);
    expect(diary.entries).toHaveLength(2);
    expect(diary.entries[0]).toEqual(entry);
    expect(diary.entries[1]).toMatchObject({
      id: 'sqlite-entry',
      amount: 0.5,
      grams: null,
      recipe: { servings: 2 },
    });
  } finally {
    sql.close();
    sql = new DatabaseSync(':memory:');
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep))
      throw new Error('Unsafe SQLite test cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite атомарно отклоняет устаревшую цель и сохраняет ручную настройку', async () => {
  await migrateDatabase(mockDatabase);
  const storage = await getSettingsStorage();
  const original = resolveNutrition(
    toProfile(sampleDraft),
    defaultPreferences(),
  ).snapshot!;
  const first = createNutritionRepository(storage);
  await first.save(original);
  const second = createNutritionRepository(await getSettingsStorage());
  const previous = await second.load();
  const manual = resolveNutrition(toProfile(sampleDraft), {
    ...defaultPreferences(),
    calorieMode: 'manual',
    manualCalories: 3000,
  }).snapshot!;
  await first.save(manual);
  await expect(second.save(original, previous)).rejects.toThrow(/изменены/);
  expect((await second.load())?.targets.calories).toBe(3000);
  expect((await second.load())?.preferences.calorieMode).toBe('manual');
});
