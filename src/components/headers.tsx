import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { spacing } from '@/theme';

import { AppText } from './app-text';

export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = Boolean(action) && (width < 360 || fontScale > 1.3);
  return (
    <View style={[styles.header, stacked && styles.stacked]}>
      <View style={styles.heading}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle && <AppText tone="muted">{subtitle}</AppText>}
      </View>
      {action}
    </View>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <AppText variant="section" accessibilityRole="header">
      {title}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.compact },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  heading: { flex: 1, gap: spacing.tight },
});
