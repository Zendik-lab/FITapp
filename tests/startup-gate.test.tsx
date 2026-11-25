import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initializeApp } from '@/features/startup/initialize-app';
import { StartupGate } from '@/features/startup/startup-gate';

jest.mock('@/features/startup/initialize-app', () => ({
  initializeApp: jest.fn(),
}));

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

afterEach(() => jest.restoreAllMocks());

test('предлагает повторить запуск после ошибки и открывает разделы после успешной попытки', async () => {
  const failure = new Error('SQLite unavailable');
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest
    .mocked(initializeApp)
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({
      locale: 'ru-KZ',
      units: 'metric',
      currency: 'KZT',
      themeMode: 'system',
    });

  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <StartupGate>
        <Text>Сегодня</Text>
      </StartupGate>
    </SafeAreaProvider>,
  );

  expect(
    await screen.findByRole('header', {
      name: 'Не удалось запустить приложение',
    }),
  ).toBeTruthy();
  expect(screen.queryByText('Сегодня')).toBeNull();
  expect(logError).toHaveBeenCalledWith(
    expect.stringContaining('MassTracker'),
    failure,
  );

  await fireEvent.press(screen.getByRole('button', { name: 'Повторить' }));

  expect(await screen.findByText('Сегодня')).toBeTruthy();
  expect(initializeApp).toHaveBeenCalledTimes(2);
});
