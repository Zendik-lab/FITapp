import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme';

export type ScreenSafeAreaProps = {
  children: ReactNode;
  bottomInset?: boolean;
};

export function ScreenSafeArea({
  children,
  bottomInset = false,
}: ScreenSafeAreaProps) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView
      edges={
        bottomInset
          ? ['top', 'left', 'right', 'bottom']
          : ['top', 'left', 'right']
      }
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
