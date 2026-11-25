import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { formatNumber } from '@/features/calendar/calendar';
import { spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

export function ProgressRing({
  value,
  goal,
  size = 108,
}: {
  value: number;
  goal: number;
  size?: number;
}) {
  const { colors } = useAppTheme();
  const ratio = goal > 0 ? Math.max(0, value / goal) : 0;
  const stroke = 9;
  const center = size / 2;
  const radius = center - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Выполнено ${Math.round(ratio * 100)} процентов дневной цели`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {ratio > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.min(1, ratio))}
            rotation={-90}
            originX={center}
            originY={center}
          />
        )}
      </Svg>
      <View
        style={styles.ringLabel}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <AppText variant="stat" maxFontSizeMultiplier={1.4}>
          {Math.round(ratio * 100)}%
        </AppText>
      </View>
    </View>
  );
}

export function MacroProgressBar({
  label,
  value,
  goal,
  tone,
}: {
  label: string;
  value: number;
  goal: number;
  tone: 'protein' | 'fat' | 'carbs' | 'water';
}) {
  const { colors } = useAppTheme();
  const ratio = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={`${label}, ${formatNumber(value)} из ${formatNumber(goal)} ${tone === 'water' ? 'л' : 'г'}`}
    >
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.track,
            { backgroundColor: colors[tone], width: `${ratio * 100}%` },
          ]}
        />
      </View>
      <AppText variant="caption">
        {formatNumber(value)} / {formatNumber(goal)}{' '}
        {tone === 'water' ? 'л' : 'г'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  ringLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macro: { flex: 1, minWidth: 74, gap: spacing.tight },
  track: { height: 5, borderRadius: 3 },
});
