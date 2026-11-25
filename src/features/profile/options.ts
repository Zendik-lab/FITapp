import type { ActivityLevel, GoalKind, ProfileSection } from './model';

export const goalLabels: Record<GoalKind, string> = {
  gain: 'Набор массы',
  maintain: 'Поддержание веса',
  lose: 'Снижение веса',
};
export const activityLabels: Record<ActivityLevel, string> = {
  minimal: 'Минимальная активность',
  low: 'Низкая активность',
  moderate: 'Средняя активность',
  high: 'Высокая активность',
  veryHigh: 'Очень высокая активность',
};
export const activityDescriptions: Record<ActivityLevel, string> = {
  minimal: 'Большую часть дня сижу, мало хожу.',
  low: 'Немного хожу и занимаюсь повседневными делами.',
  moderate: 'Много хожу, регулярно двигаюсь в течение дня.',
  high: 'Большую часть дня на ногах или занимаюсь физическим трудом.',
  veryHigh: 'Ежедневная тяжёлая физическая работа и большие нагрузки.',
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
