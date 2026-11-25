import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Card } from './card';
import { AppIcon, type AppIconName } from './app-icon';

export function StatCard({
  label,
  value,
  detail,
  icon,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: AppIconName;
  children?: ReactNode;
}) {
  return (
    <Card style={styles.stat}>
      <View style={styles.heading}>
        <AppIcon name={icon} size={17} />
        <AppText variant="caption" tone="muted" style={styles.flexible}>
          {label}
        </AppText>
      </View>
      <AppText
        variant="stat"
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.7}
      >
        {value}
      </AppText>
      {detail && (
        <AppText variant="caption" tone="muted">
          {detail}
        </AppText>
      )}
      {children}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: AppIconName;
  action?: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.empty}>
      <View
        style={[styles.iconTile, { backgroundColor: colors.accentSurface }]}
      >
        <AppIcon name={icon} />
      </View>
      <View style={styles.flexible}>
        <AppText variant="action">{title}</AppText>
        <AppText variant="caption" tone="muted" style={styles.description}>
          {description}
        </AppText>
      </View>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  stat: { flex: 1, gap: spacing.small },
  flexible: { flex: 1 },
  empty: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: { marginTop: spacing.tight },
});
