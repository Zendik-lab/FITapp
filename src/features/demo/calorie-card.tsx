import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/app-text';
import { useAnimatedNumber } from '@/components/animated-number';
import { Card } from '@/components/card';
import {
  MacroProgressBar,
  ProgressRing,
} from '@/components/progress-indicators';
import { formatNumber } from '@/features/calendar/calendar';
import { radii, spacing, useAppTheme } from '@/theme';

import type { DailyNutrition } from '@/features/nutrition/daily-totals';

export function CalorieCard({
  day,
  dominant = false,
}: {
  day: DailyNutrition;
  dominant?: boolean;
}) {
  const { colors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.35;
  const calories = useAnimatedNumber(day.calories);
  const remaining = useAnimatedNumber(day.calorieGoal - day.calories);

  return (
    <Card style={dominant && styles.hero}>
      <View style={[styles.overview, stacked && styles.stacked]}>
        <View style={styles.metrics}>
          <AppText variant="action">Калории</AppText>
          <View>
            <AppText
              variant={dominant ? 'metric' : 'stat'}
              accessibilityLabel={formatNumber(day.calories)}
            >
              {formatNumber(calories)}
            </AppText>
            <AppText variant="caption" tone="muted">
              ккал из {formatNumber(day.calorieGoal)}
            </AppText>
          </View>
          <AppText variant="caption" tone="accentText">
            {remaining < 0
              ? `На ${formatNumber(-remaining)} ккал больше цели`
              : `${formatNumber(remaining)} ккал осталось`}
          </AppText>
        </View>
        <ProgressRing
          value={day.calories}
          goal={day.calorieGoal}
          size={dominant ? 112 : 90}
        />
      </View>
      <View
        style={[
          styles.macros,
          { borderTopColor: colors.border },
          fontScale > 1.65 && styles.stackedMacros,
        ]}
      >
        {day.macros.map((macro) => (
          <MacroProgressBar key={macro.tone} {...macro} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    padding: spacing.large,
    borderRadius: radii.hero,
    gap: spacing.medium,
  },
  overview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.compact,
  },
  stacked: { flexWrap: 'wrap' },
  metrics: { flexGrow: 1, flexShrink: 1, gap: spacing.small },
  macros: {
    flexDirection: 'row',
    gap: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.compact,
  },
  stackedMacros: { flexDirection: 'column' },
});
