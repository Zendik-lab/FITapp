import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, touchSize, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export function SettingsRow({
  label,
  icon,
  value,
  divider,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  value?: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? [label, value].join(', ') : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.accentSurface : colors.surface },
      ]}
    >
      <Icon name={icon} size={19} />
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
        <Icon name="chevron.right" size={12} color={colors.muted} />
      </View>
    </Pressable>
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
