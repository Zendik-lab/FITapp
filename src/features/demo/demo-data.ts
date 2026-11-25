import type { SFSymbol } from 'expo-symbols';

export const demoLabel = 'Демонстрационные данные';

const macros = [
  { label: 'Белки', value: 105, goal: 150, tone: 'protein' },
  { label: 'Жиры', value: 68, goal: 100, tone: 'fat' },
  { label: 'Углеводы', value: 277, goal: 425, tone: 'carbs' },
] as const;

const sampleMeals: readonly {
  title: string;
  calories: number;
  example: string;
  icon: SFSymbol;
}[] = [
  {
    title: 'Завтрак',
    calories: 590,
    example: 'Овсянка с бананом и йогуртом',
    icon: 'sunrise',
  },
  {
    title: 'Обед',
    calories: 760,
    example: 'Курица, рис и овощи',
    icon: 'sun.max',
  },
  {
    title: 'Ужин',
    calories: 530,
    example: 'Паста с индейкой',
    icon: 'moon.stars',
  },
  {
    title: 'Перекусы',
    calories: 260,
    example: 'Творог и ягоды',
    icon: 'carrot',
  },
];

export const demoTraining = {
  next: 'Верх тела',
  description: 'Силовая · 45 мин',
  completed: 2,
  weeklyGoal: 3,
} as const;

export const demoWeight = {
  current: 72,
  goal: 85,
  entries: [
    { daysAgo: 365, kg: 65.2 },
    { daysAgo: 270, kg: 66.3 },
    { daysAgo: 180, kg: 67.4 },
    { daysAgo: 90, kg: 69 },
    { daysAgo: 60, kg: 69.4 },
    { daysAgo: 45, kg: 70.2 },
    { daysAgo: 30, kg: 70.7 },
    { daysAgo: 21, kg: 70.6 },
    { daysAgo: 14, kg: 71.2 },
    { daysAgo: 7, kg: 71.4 },
    { daysAgo: 5, kg: 71.8 },
    { daysAgo: 3, kg: 71.6 },
    { daysAgo: 1, kg: 71.9 },
    { daysAgo: 0, kg: 72 },
  ],
} as const;

export function getDemoDay(isToday: boolean) {
  return {
    calorieGoal: 3200,
    calories: isToday
      ? sampleMeals.reduce((sum, meal) => sum + meal.calories, 0)
      : 0,
    macros: isToday ? macros : macros.map((macro) => ({ ...macro, value: 0 })),
    water: { value: isToday ? 1.5 : 0, goal: 2.5 },
    meals: isToday
      ? sampleMeals
      : sampleMeals.map((meal) => ({ ...meal, calories: 0, example: '' })),
  };
}

export type DemoDay = ReturnType<typeof getDemoDay>;
