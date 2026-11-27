import { Touchable } from '@/components/touchable';
import { StyleSheet } from 'react-native';

import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { AppIcon, type AppIconName } from './app-icon';

type Action = { label: string; onPress: () => void; disabled?: boolean };

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  secondary = false,
  expanded,
}: Action & {
  icon?: AppIconName;
  secondary?: boolean;
  expanded?: boolean;
}) {
  const { colors } = useAppTheme();
  const tone = secondary ? 'accentText' : 'onAccent';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        {
          backgroundColor: secondary ? colors.accentSurface : colors.accent,
          opacity: disabled || pressed ? 0.68 : 1,
        },
      ]}
    >
      {icon && <AppIcon name={icon} size={17} color={colors[tone]} />}
      <AppText variant="action" tone={tone} style={styles.label}>
        {label}
      </AppText>
    </Touchable>
  );
}

export function IconButton({
  label,
  onPress,
  disabled,
  icon,
  compact = false,
}: Action & {
  icon: AppIconName;
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        {
          backgroundColor: compact ? 'transparent' : colors.accentSurface,
          opacity: disabled || pressed ? 0.6 : 1,
        },
      ]}
    >
      <AppIcon name={icon} size={compact ? 16 : 20} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: touchSize,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.compact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    borderRadius: radii.action,
  },
  label: { flexShrink: 1, textAlign: 'center' },
  icon: {
    width: touchSize,
    height: touchSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.action,
  },
});
