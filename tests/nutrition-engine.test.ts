import {
  activityFactors,
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculateMacros,
  calculateMacroCalories,
  calculateMacroDistribution,
  validateNutritionTargets,
} from '@/features/nutrition/engine';
import {
  defaultPreferences,
  resolveNutrition,
} from '@/features/nutrition/model';
import { toProfile } from '@/features/profile/validation';
import { sampleDraft } from './fixtures/profile';

const input = { sex: 'male' as const, age: 19, weightKg: 72, heightCm: 196 };
const now = new Date(2026, 10, 26);
const profile = toProfile(
  {
    ...sampleDraft,
    birthDate: '01.01.2007',
    height: '196',
    currentWeight: '72',
  },
  now,
);

test('коэффициенты активности соответствуют заданию', () => {
  expect(activityFactors).toEqual({
    minimal: 1.2,
    low: 1.375,
    moderate: 1.55,
    high: 1.725,
    veryHigh: 1.9,
  });
});

test('проверяет согласованность сохранённых округлённых БЖУ', () => {
  const result = resolveNutrition(
    profile,
    {
      ...defaultPreferences(),
      calorieMode: 'manual',
      macroMode: 'manual',
      manualCalories: 1000,
      manualMacros: { protein: 0.09, fat: 110.849, carbs: 0 },
    },
    now,
  );
  expect(result.issues.length).toBeGreaterThan(0);
});

test('нулевые углеводы не превращаются в отрицательный процент', () => {
  const distribution = calculateMacroDistribution({
    protein: 30,
    fat: 200,
    carbs: 0,
  });
  expect(distribution.carbs).toBe(0);
  expect(distribution.protein + distribution.fat + distribution.carbs).toBe(
    100,
  );
});

test('недостаточные автоматические калории не блокируют рабочие ручные настройки', () => {
  const low = toProfile(
    {
      ...sampleDraft,
      sex: 'female',
      birthDate: '01.01.1961',
      height: '150',
      currentWeight: '100',
      goal: 'lose',
      targetWeight: '90',
      activity: 'minimal',
    },
    now,
  );
  const auto = resolveNutrition(low, defaultPreferences(), now);
  expect(auto.recommendation).not.toBeNull();
  expect(auto.issues.length).toBeGreaterThan(0);
  const manual = resolveNutrition(
    low,
    {
      ...defaultPreferences(),
      calorieMode: 'manual',
      manualCalories: 3000,
      macroMode: 'manual',
      manualMacros: { protein: 150, fat: 80, carbs: 420 },
    },
    now,
  );
  expect(manual.issues).toEqual([]);
  expect(manual.snapshot?.targets.calories).toBe(3000);
});

test('контрольный пример: BMR, TDEE, округлённая цель и БЖУ', () => {
  expect(calculateBMR(input)).toBe(1855);
  expect(calculateBMR({ ...input, sex: 'female' })).toBe(1689);
  expect(calculateTDEE(1855, 'moderate')).toBe(2875.25);
  const calories = calculateCalorieTarget(2875.25, 'gain');
  expect(calories).toBe(3225);
  expect(calculateMacros(72, calories)).toEqual({
    protein: 129.6,
    fat: 72,
    carbs: 514.7,
  });
  expect(
    validateNutritionTargets({ calories, ...calculateMacros(72, calories) }),
  ).toEqual([]);
});

test.each(Object.entries(activityFactors))('активность %s', (level, factor) => {
  expect(calculateTDEE(1855, level as keyof typeof activityFactors)).toBe(
    1855 * factor,
  );
});

test.each([
  ['gentle', 200],
  ['standard', 350],
  ['accelerated', 500],
] as const)('профицит %s', (mode, delta) => {
  expect(calculateCalorieTarget(2500, 'gain', mode)).toBe(2500 + delta);
});

test('поддержание и снижение сохраняют совместимость', () => {
  expect(calculateCalorieTarget(2500, 'maintain')).toBe(2500);
  expect(calculateCalorieTarget(2500, 'lose')).toBe(2150);
});

test('энергия и процентное распределение, нулевые макросы', () => {
  expect(calculateMacroCalories({ protein: 100, fat: 100, carbs: 100 })).toBe(
    1700,
  );
  const distribution = calculateMacroDistribution({
    protein: 100,
    fat: 100,
    carbs: 100,
  });
  expect(distribution.protein + distribution.fat + distribution.carbs).toBe(
    100,
  );
  expect(calculateMacroDistribution({ protein: 0, fat: 0, carbs: 0 })).toEqual({
    protein: 0,
    fat: 0,
    carbs: 0,
  });
});

test.each([NaN, Infinity, -1, 0, 401])('некорректный вес %s', (weightKg) => {
  expect(() => calculateBMR({ ...input, weightKg })).toThrow();
});
test.each([17, 121, NaN, 19.5])('некорректный возраст %s', (age) => {
  expect(() => calculateBMR({ ...input, age })).toThrow();
});
test('границы и несовместимые цели не создают отрицательные углеводы', () => {
  expect(calculateBMR({ ...input, age: 18 })).toBe(1860);
  expect(() => calculateMacros(72, 500)).toThrow();
  expect(
    validateNutritionTargets({
      calories: 2000,
      protein: NaN,
      fat: Infinity,
      carbs: -1,
    }).length,
  ).toBeGreaterThan(0);
  expect(
    validateNutritionTargets({
      calories: 2000,
      protein: 100,
      fat: 100,
      carbs: 100,
    }).length,
  ).toBeGreaterThan(0);
  expect(() => calculateTDEE(Infinity, 'minimal')).toThrow();
});

test('нет подстановок при отсутствующих данных и неуказанном поле формулы', () => {
  expect(
    resolveNutrition(null, defaultPreferences(), now).issues.length,
  ).toBeGreaterThan(0);
  expect(
    resolveNutrition(
      { ...profile, personal: { ...profile.personal, sex: 'unspecified' } },
      defaultPreferences(),
      now,
    ).snapshot,
  ).toBeNull();
  expect(
    resolveNutrition(
      {
        ...profile,
        personal: { ...profile.personal, birthDate: '01.01.2015' },
      },
      defaultPreferences(),
      now,
    ).snapshot,
  ).toBeNull();
});

test('автоматический пересчёт и неизменность ручных значений при изменении профиля', () => {
  const first = resolveNutrition(profile, defaultPreferences(), now);
  expect(first.snapshot?.targets.calories).toBe(3225);
  const changed = {
    ...profile,
    body: { ...profile.body, currentWeightKg: 73 },
  };
  expect(
    resolveNutrition(changed, defaultPreferences(), now).snapshot?.targets
      .calories,
  ).toBe(3241);
  const manual = {
    ...defaultPreferences(),
    calorieMode: 'manual' as const,
    macroMode: 'manual' as const,
    manualCalories: 3000,
    manualMacros: { protein: 150, fat: 80, carbs: 420 },
  };
  const result = resolveNutrition(changed, manual, now);
  expect(result.snapshot?.targets).toEqual({
    calories: 3000,
    protein: 150,
    fat: 80,
    carbs: 420,
  });
  expect(result.snapshot?.recommendedCalories).toBe(3241);
  expect(result.snapshot?.algorithmVersion).toBe('mifflin-1');
  expect(
    resolveNutrition(
      { ...profile, training: { ...profile.training, sessionsPerWeek: 10 } },
      defaultPreferences(),
      now,
    ).snapshot?.targets,
  ).toEqual(first.snapshot?.targets);
});

test.each([
  [{ height: '195' }, 3216],
  [{ birthDate: '01.01.2006' }, 3218],
  [{ sex: 'female' }, 2968],
  [{ activity: 'high' }, 3550],
  [{ goal: 'maintain', targetWeight: '72' }, 2875],
  [{ goal: 'lose', targetWeight: '65' }, 2525],
] as const)(
  'пересчёт по параметрам профиля %s сохраняет ручную цель',
  (changes, expected) => {
    const changed = toProfile(
      {
        ...sampleDraft,
        birthDate: '01.01.2007',
        height: '196',
        currentWeight: '72',
        ...changes,
      },
      now,
    );
    expect(
      resolveNutrition(changed, defaultPreferences(), now).snapshot?.targets
        .calories,
    ).toBe(expected);
    const manual = resolveNutrition(
      changed,
      {
        ...defaultPreferences(),
        calorieMode: 'manual',
        manualCalories: 3000,
        macroMode: 'manual',
        manualMacros: { protein: 150, fat: 80, carbs: 420 },
      },
      now,
    );
    expect(manual.snapshot?.targets).toEqual({
      calories: 3000,
      protein: 150,
      fat: 80,
      carbs: 420,
    });
    expect(manual.snapshot?.recommendedCalories).toBe(expected);
  },
);
