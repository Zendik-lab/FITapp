import type { ActivityLevel, GoalKind, ProfileSection } from './model';

export const goalLabels: Record<GoalKind, string> = {
  gain: 'Набор массы',
  maintain: 'Поддержание веса',
  lose: 'Снижение веса',
};
export const activityLabels: Record<ActivityLevel, string> = {
  minimal: 'Минимальная активность',
  low: 'Лёгкая активность',
  moderate: 'Средняя активность',
  high: 'Высокая активность',
  veryHigh: 'Очень высокая активность',
};
export const activityDescriptions: Record<ActivityLevel, string> = {
  minimal:
    'Коэффициент 1,2. Большую часть дня сижу, мало хожу; тренировок почти нет.',
  low: 'Коэффициент 1,375. Немного хожу, лёгкие нагрузки 1–3 раза в неделю.',
  moderate:
    'Коэффициент 1,55. Регулярно двигаюсь, тренировки 3–5 раз в неделю.',
  high: 'Коэффициент 1,725. Большую часть дня на ногах, интенсивные нагрузки 6–7 раз в неделю.',
  veryHigh:
    'Коэффициент 1,9. Ежедневная тяжёлая физическая работа и большие нагрузки. Тренировки уже входят в коэффициент.',
};
export const sectionLabels: Record<ProfileSection, string> = {
  personal: 'Личная информация',
  body: 'Параметры тела',
  goal: 'Моя цель',
  activity: 'Физическая активность',
  training: 'Тренировки',
  nutrition: 'Пищевые предпочтения',
};
export const stepTitles = [
  'Добро пожаловать',
  'Основная информация',
  'Ваша цель',
  'Желаемый результат',
  'Физическая активность',
  'Тренировки',
  'Пищевые предпочтения',
  'Всё готово',
] as const;
