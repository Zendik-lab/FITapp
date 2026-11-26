import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { PrimaryButton } from './buttons';
import { ScreenSafeArea } from './screen-safe-area';

type StatusScreenProps = {
  title: string;
  message?: string;
  loading?: boolean;
  onRetry?: () => void;
};

export function StatusScreen({
  title,
  message,
  loading,
  onRetry,
}: StatusScreenProps) {
  const { colors, isDark } = useAppTheme();

  return (
    <ScreenSafeArea bottomInset>
      <ScrollView
        contentContainerStyle={styles.screen}
        contentInsetAdjustmentBehavior="never"
        indicatorStyle={isDark ? 'white' : 'black'}
      >
        {loading && <ActivityIndicator color={colors.accent} />}
        <AppText
          variant="title"
          accessibilityRole="header"
          style={styles.centered}
        >
          {title}
        </AppText>
        {message && (
          <AppText tone="muted" style={styles.centered}>
            {message}
          </AppText>
        )}
        {onRetry && (
          <PrimaryButton label="Повторить" onPress={onRetry} secondary />
        )}
      </ScrollView>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
  },
  centered: { textAlign: 'center' },
});
