import { type ProfileDraft, type UserProfile } from './model';

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

export function numeric(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export function ageFromBirthDate(
  value: string,
  now = new Date(),
): number | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const [day, month, year] = [
    Number(dayText),
    Number(monthText),
    Number(yearText),
  ];
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const age =
    now.getFullYear() -
    year -
    (now.getMonth() < month - 1 ||
    (now.getMonth() === month - 1 && now.getDate() < day)
      ? 1
      : 0);
  return date > today || age > 120 ? null : age;
}

export function validateDraft(
  draft: ProfileDraft,
  now = new Date(),
): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!draft.name.trim() || draft.name.trim().length > 80)
    errors.name = 'Укажите имя от 1 до 80 символов.';
  if (ageFromBirthDate(draft.birthDate, now) === null)
    errors.birthDate =
      'Укажите существующую дату ДД.ММ.ГГГГ, не позднее сегодня (возраст до 120 лет).';
  if (!['male', 'female', 'unspecified'].includes(draft.sex))
    errors.sex = 'Выберите вариант.';
  function range(
    key: keyof ProfileDraft,
    min: number,
    max: number,
    message: string,
    integer = false,
  ) {
    const value = numeric(draft[key]);
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      errors[key] = message;
    return value;
  }
  range('height', 80, 250, 'Укажите рост от 80 до 250 см.');
  const current = range(
    'currentWeight',
    20,
    400,
    'Укажите вес от 20 до 400 кг.',
  );
  const target = range(
    'targetWeight',
    20,
    400,
    'Укажите целевой вес от 20 до 400 кг.',
  );
  if (!['gain', 'maintain', 'lose'].includes(draft.goal))
    errors.goal = 'Выберите цель.';
  if (!errors.targetWeight && !errors.currentWeight) {
    if (draft.goal === 'gain' && target <= current)
      errors.targetWeight =
        'Для набора массы целевой вес должен быть выше текущего.';
    if (draft.goal === 'lose' && target >= current)
      errors.targetWeight =
        'Для снижения веса целевой вес должен быть ниже текущего.';
    if (draft.goal === 'maintain' && target !== current)
      errors.targetWeight = 'Для поддержания укажите текущий вес.';
  }
  if (!['recommended', 'custom'].includes(draft.paceMode))
    errors.paceMode = 'Выберите режим темпа.';
  if (draft.goal !== 'maintain' && draft.paceMode === 'custom')
    range('pace', 0.05, 2, 'Укажите темп от 0,05 до 2 кг в неделю.');
  if (
    !['minimal', 'low', 'moderate', 'high', 'veryHigh'].includes(draft.activity)
  )
    errors.activity = 'Выберите уровень активности.';
  const sessions = range(
    'sessions',
    0,
    14,
    'Укажите целое число тренировок от 0 до 14 (0 — без тренировок).',
    true,
  );
  if (sessions > 0) {
    if (!['strength', 'cardio', 'mixed', 'other'].includes(draft.trainingType))
      errors.trainingType = 'Выберите тип тренировок.';
    if (!['beginner', 'intermediate', 'experienced'].includes(draft.experience))
      errors.experience = 'Выберите уровень подготовки.';
  }
  if (draft.meals.trim())
    range(
      'meals',
      1,
      10,
      'Укажите целое число приёмов пищи от 1 до 10 или оставьте поле пустым.',
      true,
    );
  for (const key of [
    'diet',
    'excludedFoods',
    'allergies',
    'restrictions',
  ] as const) {
    if (draft[key].length > 1000)
      errors[key] = 'Сократите текст до 1000 символов.';
  }
  return errors;
}

export function toProfile(draft: ProfileDraft, now = new Date()): UserProfile {
  if (Object.keys(validateDraft(draft, now)).length)
    throw new Error('Проверьте заполнение профиля.');
  return {
    personal: {
      name: draft.name.trim(),
      birthDate: draft.birthDate.trim(),
      sex: draft.sex as UserProfile['personal']['sex'],
    },
    body: {
      heightCm: numeric(draft.height),
      currentWeightKg: numeric(draft.currentWeight),
    },
    goals: {
      kind: draft.goal as UserProfile['goals']['kind'],
      targetWeightKg: numeric(draft.targetWeight),
      paceMode: draft.paceMode,
      paceKgPerWeek:
        draft.goal === 'maintain'
          ? 0
          : draft.paceMode === 'recommended'
            ? 0.25
            : numeric(draft.pace),
    },
    activity: { level: draft.activity as UserProfile['activity']['level'] },
    training: {
      sessionsPerWeek: numeric(draft.sessions),
      type:
        numeric(draft.sessions) === 0
          ? null
          : (draft.trainingType as UserProfile['training']['type']),
      experience:
        numeric(draft.sessions) === 0
          ? null
          : (draft.experience as UserProfile['training']['experience']),
    },
    nutrition: {
      mealsPerDay: draft.meals.trim() ? numeric(draft.meals) : null,
      diet: draft.diet.trim(),
      excludedFoods: draft.excludedFoods.trim(),
      allergies: draft.allergies.trim(),
      restrictions: draft.restrictions.trim(),
    },
  };
}

export function profileWarnings(
  draft: ProfileDraft,
  now = new Date(),
): string[] {
  const warnings: string[] = [];
  const age = ageFromBirthDate(draft.birthDate, now);
  if (age !== null && age < 20)
    warnings.push(
      'В молодом возрасте цель изменения веса лучше выбирать со специалистом.',
    );
  const pace = draft.paceMode === 'recommended' ? 0.25 : numeric(draft.pace);
  if (draft.goal !== 'maintain' && pace > numeric(draft.currentWeight) * 0.01)
    warnings.push(
      'Выбран большой темп изменения веса. Обсудите его со специалистом.',
    );
  const bmi = numeric(draft.targetWeight) / (numeric(draft.height) / 100) ** 2;
  if (age !== null && age >= 20 && (bmi < 18.5 || bmi >= 30))
    warnings.push(
      'Целевой вес требует внимания с учётом роста. Обсудите цель со специалистом: этот ориентир не учитывает состав тела и не является диагнозом.',
    );
  return warnings;
}
