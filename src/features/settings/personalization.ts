export const accentOptions = [
  { value: 'green', label: 'Зелёный' },
  { value: 'blue', label: 'Синий' },
  { value: 'violet', label: 'Фиолетовый' },
  { value: 'orange', label: 'Оранжевый' },
] as const;
export const motionOptions = [
  { value: 'full', label: 'Полные' },
  { value: 'subtle', label: 'Сдержанные' },
  { value: 'off', label: 'Выключены' },
] as const;
export const homeCards = [
  { id: 'recent', label: 'Последние продукты' },
  { id: 'stats', label: 'Вес и вода' },
  { id: 'goal', label: 'Цель веса' },
  { id: 'training', label: 'Тренировка' },
  { id: 'actions', label: 'Быстрые действия' },
] as const;
export type HomeCard = (typeof homeCards)[number]['id'];
export interface Personalization {
  accent: (typeof accentOptions)[number]['value'];
  motion: (typeof motionOptions)[number]['value'];
  greeting: string;
  timeGreeting: boolean;
  haptics: boolean;
  motivation: boolean;
  order: HomeCard[];
  hidden: HomeCard[];
}

export const personalizationKey = 'personalization.v1';
export const defaultPersonalization: Personalization = {
  accent: 'green',
  motion: 'full',
  greeting: '',
  timeGreeting: false,
  haptics: true,
  motivation: true,
  order: homeCards.map((card) => card.id),
  hidden: [],
};

export function moveHomeCard(
  order: HomeCard[],
  id: HomeCard,
  direction: -1 | 1,
) {
  const index = order.indexOf(id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= order.length) return order;
  const next = [...order];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function decodePersonalization(raw: string): Personalization {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object')
    throw new Error('Настройки оформления повреждены.');
  const {
    accent,
    motion,
    greeting,
    timeGreeting,
    haptics,
    motivation,
    order,
    hidden,
  } = value as Record<string, unknown>;
  const ids: readonly string[] = defaultPersonalization.order;
  const cards = (list: unknown): list is HomeCard[] =>
    Array.isArray(list) &&
    list.every((id: unknown) => typeof id === 'string' && ids.includes(id)) &&
    new Set(list).size === list.length;
  if (
    !accentOptions.some((item) => item.value === accent) ||
    !motionOptions.some((item) => item.value === motion) ||
    typeof greeting !== 'string' ||
    greeting.length > 60 ||
    typeof timeGreeting !== 'boolean' ||
    typeof haptics !== 'boolean' ||
    typeof motivation !== 'boolean' ||
    !cards(order) ||
    !cards(hidden)
  )
    throw new Error('Настройки оформления повреждены.');
  return {
    accent: accent as Personalization['accent'],
    motion: motion as Personalization['motion'],
    greeting,
    timeGreeting,
    haptics,
    motivation,
    order: [
      ...order,
      ...defaultPersonalization.order.filter((id) => !order.includes(id)),
    ],
    hidden,
  };
}

export function greetingFor(
  prefs: Personalization,
  name?: string,
  hour = new Date().getHours(),
) {
  if (prefs.greeting.trim()) return prefs.greeting.trim();
  const time =
    hour < 6
      ? 'Доброй ночи'
      : hour < 12
        ? 'Доброе утро'
        : hour < 18
          ? 'Добрый день'
          : 'Добрый вечер';
  return `${prefs.timeGreeting ? time : 'Привет'}${name ? `, ${name}` : ''}!`;
}
