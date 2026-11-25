import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PwaNotices } from '@/features/pwa/pwa-status';
import { spacing, useAppTheme } from '@/theme';

export function ScreenContainer({ children }: { children: ReactNode }) {
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        indicatorStyle={isDark ? 'white' : 'black'}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, width < 350 && styles.narrow]}
      >
        <PwaNotices />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
