import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { getSettingsStorage } from '@/database/settings-storage';
import { initializeApp } from '@/features/startup/initialize-app';
import { createNutritionRepository } from '@/database/repositories/nutrition';
import { createProfileRepository } from '@/database/repositories/profile';
import {
  defaultPreferences,
  resolveNutrition,
} from '@/features/nutrition/model';
import { toProfile } from '@/features/profile/validation';
import { memoryStorage, sampleDraft } from './fixtures/profile';

jest.mock('@/database/settings-storage', () => ({
  getSettingsStorage: jest.fn(),
}));
jest.mock('@/features/startup/initialize-app', () => ({
  initializeApp: jest.fn(),
}));
beforeEach(() => {
  jest.mocked(initializeApp).mockResolvedValue({
    locale: 'ru-KZ',
    units: 'metric',
    currency: 'KZT',
    themeMode: 'system',
  });
});

test('нативная форма сохраняет ручные калории и обновляет общий итог', async () => {
  const storage = await memoryStorage();
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Калории и БЖУ' }),
  );
  const modes = screen.getAllByRole('radio', { name: 'Ручная настройка' });
  await fireEvent.press(modes[0]);
  await fireEvent.changeText(
    screen.getByLabelText('Целевая калорийность, ккал'),
    '3100,4',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить изменения' }),
  );
  expect(await screen.findByRole('header', { name: 'Сегодня' })).toBeTruthy();
  expect(
    (await createNutritionRepository(storage).load())?.targets.calories,
  ).toBe(3100);
  expect(
    screen.getByLabelText('Выполнено 0 процентов дневной цели'),
  ).toBeTruthy();
});

test('повреждение сохранённых целей блокирует запись значениями по умолчанию', async () => {
  const storage = await memoryStorage();
  await storage.apply([{ key: 'nutrition_state', value: '{bad' }]);
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  expect(await screen.findByRole('header', { name: 'Сегодня' })).toBeTruthy();
  expect(screen.getByText(/Не удалось загрузить цели питания/)).toBeTruthy();
  expect(await storage.get('nutrition_state')).toBe('{bad');
  await fireEvent.press(screen.getByLabelText('Профиль'));
  expect(await screen.findByRole('header', { name: 'Профиль' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Параметры тела,/ })).toBeTruthy();
  expect(await storage.get('nutrition_state')).toBe('{bad');
});

test('после изменения веса показывает рекомендованные БЖУ рядом с сохранёнными ручными', async () => {
  const storage = await memoryStorage();
  const draft = {
    ...sampleDraft,
    birthDate: `01.01.${new Date().getFullYear() - 19}`,
    height: '196',
    currentWeight: '72',
  };
  const original = resolveNutrition(toProfile(draft), {
    ...defaultPreferences(),
    calorieMode: 'manual',
    macroMode: 'manual',
    manualCalories: 3000,
    manualMacros: { protein: 150, fat: 80, carbs: 420 },
  }).snapshot;
  if (!original) throw new Error('Missing test nutrition targets');
  await createNutritionRepository(storage).save(original);
  await createProfileRepository(storage).complete({
    ...draft,
    currentWeight: '73',
  });
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Калории и БЖУ' }),
  );
  expect(
    screen.getByRole('header', { name: 'Рекомендуемые калории и БЖУ' }),
  ).toBeTruthy();
  expect(screen.getByText(/Белки · 131,4 г/)).toBeTruthy();
  expect(screen.getByText(/Жиры · 73 г/)).toBeTruthy();
  expect(screen.getByText(/Углеводы · 514,6 г/)).toBeTruthy();
  expect(screen.getByLabelText('Целевая калорийность, ккал').props.value).toBe(
    '3000',
  );
  expect(screen.getByLabelText('Белки, г').props.value).toBe('150');
  expect(screen.getByLabelText('Жиры, г').props.value).toBe('80');
  expect(screen.getByLabelText('Углеводы, г').props.value).toBe('420');
});

test('сбой первого автоматического сохранения показывает ошибку и допускает повтор', async () => {
  const storage = await memoryStorage();
  const apply = jest
    .spyOn(storage, 'apply')
    .mockRejectedValueOnce(new Error('automatic quota'));
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  expect(await screen.findByText(/automatic quota/)).toBeTruthy();
  expect(await storage.get('nutrition_state')).toBeNull();
  apply.mockRestore();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить сохранение целей' }),
  );
  await screen.findByRole('button', { name: 'Калории и БЖУ' });
  expect(
    (await createNutritionRepository(storage).load())?.preferences.calorieMode,
  ).toBe('auto');
});

test('сбой сохранения оставляет ручной ввод и прежнюю цель, повтор сохраняет изменения', async () => {
  const storage = await memoryStorage();
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Калории и БЖУ' }),
  );
  await fireEvent.press(
    screen.getAllByRole('radio', { name: 'Ручная настройка' })[0],
  );
  await fireEvent.changeText(
    screen.getByLabelText('Целевая калорийность, ккал'),
    '3000',
  );
  const repository = createNutritionRepository(storage);
  const previous = await repository.load();
  const apply = jest
    .spyOn(storage, 'apply')
    .mockRejectedValueOnce(new Error('quota'));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить изменения' }),
  );
  expect(await screen.findByText(/quota/)).toBeTruthy();
  expect(screen.getByLabelText('Целевая калорийность, ккал').props.value).toBe(
    '3000',
  );
  expect(await repository.load()).toEqual(previous);
  apply.mockRestore();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить изменения' }),
  );
  expect(await screen.findByRole('header', { name: 'Сегодня' })).toBeTruthy();
  expect((await repository.load())?.targets.calories).toBe(3000);
});
