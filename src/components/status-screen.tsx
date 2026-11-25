import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { PrimaryButton } from './buttons';

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
  const { colors } = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
  },
  centered: { textAlign: 'center' },
});
