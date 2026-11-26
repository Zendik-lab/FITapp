/** @jest-environment node */
import { currentBuild } from '@/features/pwa/build-info';

afterEach(() => {
  delete process.env.EXPO_PUBLIC_BUILD_ID;
});

test('восстанавливает production ID из самого JS, когда HTML не содержит метаданные', () => {
  process.env.EXPO_PUBLIC_BUILD_ID = '1234567890abcdef1234';
  expect(currentBuild().buildId).toBe('1234567890abcdef1234');
});
