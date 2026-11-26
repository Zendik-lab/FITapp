import type { ReactNode } from 'react';

import { useAppTheme } from '@/theme';

// Expo Router 58 intentionally supplies zero safe-area contexts on web.
// CSS env stays current during rotation without React measurement or remounts.
export function ScreenSafeArea({
  children,
  bottomInset = false,
}: {
  children: ReactNode;
  bottomInset?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <div
      className={`app-safe-area${bottomInset ? ' app-safe-area-bottom' : ''}`}
      style={{ backgroundColor: colors.background }}
    >
      {children}
    </div>
  );
}
