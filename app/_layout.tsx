import { Slot, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';

import { StatusScreen } from '@/components/status-screen';
import { NavigationAppearance } from '@/theme/navigation-appearance';
import { MotionProvider } from '@/theme/motion';

export default function RootLayout() {
  return (
    <MotionProvider>
      <NavigationAppearance>
        <Slot />
      </NavigationAppearance>
    </MotionProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[MassTracker] Непредвиденная ошибка интерфейса', error);
  }, [error]);

  return (
    <NavigationAppearance>
      <StatusScreen
        title="Произошла ошибка"
        message="Нажмите «Повторить», чтобы снова открыть приложение."
        onRetry={() => void retry()}
      />
    </NavigationAppearance>
  );
}
