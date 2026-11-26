import { formatNumber } from '@/features/calendar/calendar';

export type FoodUnit = 'g' | 'ml' | 'piece' | 'serving';
export const unitLabels: Record<FoodUnit, string> = {
  g: 'г',
  ml: 'мл',
  piece: 'шт.',
  serving: 'порция',
};

export function formatFoodQuantity(value: number): string {
  return value > 0 && value < 0.1
    ? value.toLocaleString('ru-KZ', { maximumSignificantDigits: 3 })
    : formatNumber(value);
}
