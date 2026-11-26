import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import { PwaNotices } from '@/features/pwa/pwa-status';
import { spacing, useAppTheme } from '@/theme';
import { ScreenSafeArea } from './screen-safe-area';

export function ScreenContainer({ children }: { children: ReactNode }) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  return (
    <ScreenSafeArea>
      <ScrollView
        indicatorStyle={isDark ? 'white' : 'black'}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, width < 350 && styles.narrow]}
      >
        <PwaNotices />
        {children}
      </ScrollView>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 640,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.compact,
    paddingBottom: spacing.section,
    gap: spacing.large,
  },
  narrow: { paddingHorizontal: spacing.tight },
});
