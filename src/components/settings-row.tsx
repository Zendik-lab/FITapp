import { Touchable } from '@/components/touchable';
import { StyleSheet, View } from 'react-native';

import { spacing, touchSize, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { AppIcon, type AppIconName } from './app-icon';

export function SettingsRow({
  label,
  icon,
  value,
  divider,
  onPress,
}: {
  label: string;
  icon: AppIconName;
  value?: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={value ? [label, value].join(', ') : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.accentSurface : colors.surface },
      ]}
    >
      <AppIcon name={icon} size={19} />
      <View
        style={[
          styles.content,
          divider && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.label}>
          <AppText>{label}</AppText>
          {value && (
            <AppText variant="caption" tone="muted">
              {value}
            </AppText>
          )}
        </View>
        <AppIcon name="ChevronRight" size={12} color={colors.muted} />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchSize,
    paddingLeft: spacing.medium,
    gap: spacing.compact,
  },
  content: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.small,
  },
  label: { flex: 1, gap: spacing.tight },
});
