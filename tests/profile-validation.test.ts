import { emptyDraft } from '@/features/profile/model';
import {
  ageFromBirthDate,
  validateDraft,
  toProfile,
  profileWarnings,
} from '@/features/profile/validation';

export const validDraft = {
  ...emptyDraft,
  name: 'Алекс',
  birthDate: '27.11.1996',
  sex: 'male' as const,
  height: '180',
  currentWeight: '70,5',
  goal: 'gain' as const,
  targetWeight: '76',
  activity: 'moderate' as const,
  sessions: '3',
  trainingType: 'strength' as const,
  experience: 'beginner' as const,
};
const now = new Date(2026, 10, 26);

test('вычисляет возраст по календарной дате, учитывая день рождения и високосный год', () => {
  expect(ageFromBirthDate('27.11.1996', now)).toBe(29);
  expect(ageFromBirthDate('26.11.1996', now)).toBe(30);
  expect(ageFromBirthDate('29.02.2000', now)).toBe(26);
  for (const date of [
    '29.02.2001',
    '31.04.2000',
    '00.01.2000',
    '27.11.2026',
    '1996-11-27',
  ])
    expect(ageFromBirthDate(date, now)).toBeNull();
});

test('принимает десятичную запятую и создаёт типизированный профиль без расчёта калорий', () => {
  expect(validateDraft(validDraft, now)).toEqual({});
  expect(toProfile(validDraft, now)).toMatchObject({
    personal: { name: 'Алекс', birthDate: '27.11.1996', sex: 'male' },
    body: { heightCm: 180, currentWeightKg: 70.5 },
    goals: { kind: 'gain', targetWeightKg: 76, paceKgPerWeek: 0.25 },
    training: { sessionsPerWeek: 3 },
  });
});

test.each(['', ' ', 'NaN', 'Infinity', '-1', '70кг', '1e2'])(
  'отклоняет некорректный вес %s',
  (value) => {
    expect(
      validateDraft({ ...validDraft, currentWeight: value }, now).currentWeight,
    ).toBeDefined();
  },
);

test('проверяет направление цели, поддержание веса, целые тренировки и пользовательский темп', () => {
  expect(
    validateDraft({ ...validDraft, targetWeight: '65' }, now).targetWeight,
  ).toBeDefined();
  expect(
    validateDraft({ ...validDraft, goal: 'lose', targetWeight: '65' }, now)
      .targetWeight,
  ).toBeUndefined();
  expect(
    validateDraft(
      {
        ...validDraft,
        goal: 'maintain',
        targetWeight: '70,5',
        paceMode: 'custom',
        pace: '',
      },
      now,
    ).pace,
  ).toBeUndefined();
  expect(
    validateDraft({ ...validDraft, sessions: '2.5' }, now).sessions,
  ).toBeDefined();
  expect(
    validateDraft({ ...validDraft, sessions: '15' }, now).sessions,
  ).toBeDefined();
  expect(
    validateDraft(
      { ...validDraft, sessions: '0', trainingType: '', experience: '' },
      now,
    ).trainingType,
  ).toBeUndefined();
  expect(
    validateDraft({ ...validDraft, paceMode: 'custom', pace: '0' }, now).pace,
  ).toBeDefined();
  expect(validateDraft({ ...validDraft, name: '  ' }, now).name).toBeDefined();
});

test('предупреждает о большом темпе, молодом возрасте и низком целевом весе', () => {
  expect(
    profileWarnings({ ...validDraft, paceMode: 'custom', pace: '2' }, now).join(
      ' ',
    ),
  ).toMatch(/темп/i);
  expect(
    profileWarnings({ ...validDraft, birthDate: '01.01.2010' }, now).join(' '),
  ).toMatch(/специалист/i);
  expect(
    profileWarnings(
      { ...validDraft, goal: 'lose', targetWeight: '45' },
      now,
    ).join(' '),
  ).toMatch(/вес/i);
});
