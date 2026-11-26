import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from 'expo-router/testing-library';
import { getSettingsStorage } from '@/database/settings-storage';
import { createProfileRepository } from '@/database/repositories/profile';
import { memoryStorage, sampleDraft } from './fixtures/profile';

jest.mock('@/database/settings-storage', () => ({
  getSettingsStorage: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  jest.mocked(getSettingsStorage).mockResolvedValue(await memoryStorage(false));
});

test('новый пользователь видит приветствие, ошибки возле полей и не видит вкладки', async () => {
  await renderRouter('./app');
  expect(
    await screen.findByRole('header', { name: 'MassTracker' }),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Профиль')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Начать' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Продолжить' }),
  );
  expect(
    await screen.findByText('Укажите имя от 1 до 80 символов.'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Имя')).toBeTruthy();
});

test('быстрые изменения разных полей до нового render не затирают сохранённый черновик', async () => {
  const storage = await memoryStorage(false);
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(await screen.findByRole('button', { name: 'Начать' }));
  const birthDate: (value: string) => void =
    screen.getByLabelText('Дата рождения').props.onChangeText;
  const height: (value: string) => void =
    screen.getByLabelText('Рост, см').props.onChangeText;
  await act(async () => {
    birthDate('01.01.1996');
    height('180');
  });
  const restored = await createProfileRepository(storage).load();
  expect(restored.onboarding.draft).toMatchObject({
    birthDate: '01.01.1996',
    height: '180',
  });
  expect(screen.getByLabelText('Дата рождения')).toHaveProp(
    'value',
    '01.01.1996',
  );
});

test('восстанавливает шаг, завершает анкету и открывает персональное «Сегодня»', async () => {
  const storage = await memoryStorage(false);
  const repository = createProfileRepository(storage);
  const initial = await repository.load();
  await repository.save({
    ...initial,
    onboarding: { completed: false, step: 7, draft: sampleDraft },
  });
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app', { initialUrl: '/nutrition' });
  expect(
    await screen.findByRole('header', { name: 'Всё готово' }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать мой профиль' }),
  );
  expect(await screen.findByText('Привет, Алекс!')).toBeTruthy();
  expect(screen).toHavePathname('/');
  expect((await repository.load()).onboarding.completed).toBe(true);
});

test('редактирует один раздел без новой анкеты и отменяет повторное прохождение', async () => {
  const storage = await memoryStorage();
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(await screen.findByLabelText('Профиль'));
  await fireEvent.press(
    screen.getByRole('button', { name: /Личная информация/ }),
  );
  await fireEvent.changeText(screen.getByLabelText('Имя'), 'Мария');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить изменения' }),
  );
  expect(await screen.findByText('Профиль обновлён.')).toBeTruthy();
  expect(
    (await createProfileRepository(storage).load()).profile?.personal.name,
  ).toBe('Мария');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Пройти анкетирование заново' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Отмена' }));
  expect(
    (await createProfileRepository(storage).load()).onboarding.completed,
  ).toBe(true);
});

test('блокирует поля редактора до подтверждения сохранения', async () => {
  const storage = await memoryStorage();
  jest.mocked(getSettingsStorage).mockResolvedValue(storage);
  await renderRouter('./app');
  await fireEvent.press(await screen.findByLabelText('Профиль'));
  await fireEvent.press(
    screen.getByRole('button', { name: /Личная информация/ }),
  );
  await fireEvent.changeText(screen.getByLabelText('Имя'), 'Мария');
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = storage.apply;
  jest.spyOn(storage, 'apply').mockImplementationOnce(async (changes) => {
    await waiting;
    await original(changes);
  });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить изменения' }),
  );
  expect(screen.getByLabelText('Имя').props.editable).toBe(false);
  expect(screen.getByRole('radio', { name: 'Мужской' })).toBeDisabled();
  await act(async () => {
    release();
  });
  expect(await screen.findByText('Профиль обновлён.')).toBeTruthy();
});
