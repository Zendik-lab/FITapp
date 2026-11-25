import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Polygon } from 'react-native-svg';

import { formatNumber } from '@/features/calendar/calendar';
import { spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

type WeightEntry = { daysAgo: number; kg: number };

const plotWidth = 300;
const plotHeight = 128;
const inset = 9;

export function WeightChart({
  entries,
  days,
  period,
  startLabel,
  endLabel,
}: {
  entries: readonly WeightEntry[];
  days: number;
  period: string;
  startLabel: string;
  endLabel: string;
}) {
  const { colors } = useAppTheme();
  if (entries.length === 0)
    return <AppText tone="muted">Нет измерений за этот период</AppText>;

  const lowest = Math.floor(Math.min(...entries.map(({ kg }) => kg)) - 0.25);
  const highest = Math.ceil(Math.max(...entries.map(({ kg }) => kg)) + 0.25);
  const points = entries.map(({ daysAgo, kg }) => ({
    x: inset + (1 - daysAgo / days) * (plotWidth - 2 * inset),
    y:
      inset +
      (1 - (kg - lowest) / (highest - lowest)) * (plotHeight - 2 * inset),
  }));
  const coords = points.map(({ x, y }) => [x, y].join(',')).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = plotHeight - inset;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`График веса, ${period}. С ${startLabel} по ${endLabel}. От ${formatNumber(entries[0].kg)} до ${formatNumber(entries[entries.length - 1].kg)} кг.`}
      style={styles.chart}
    >
      <View style={styles.plotRow}>
        <View style={styles.axis}>
          {[highest, (highest + lowest) / 2, lowest].map((value) => (
            <AppText key={value} tone="muted" variant="caption">
              {formatNumber(value)}
            </AppText>
          ))}
        </View>
        <View style={styles.plot}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${plotWidth} ${plotHeight}`}
            preserveAspectRatio="none"
          >
            {[inset, plotHeight / 2, baseline].map((y) => (
              <Line
                key={y}
                x1={inset}
                x2={plotWidth - inset}
                y1={y}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            ))}
            <Polygon
              points={`${first.x},${baseline} ${coords} ${last.x},${baseline}`}
              fill={colors.accentSurface}
            />
            <Polyline
              points={coords}
              stroke={colors.accentText}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {points.map(({ x, y }) => (
              <Circle
                key={x}
                cx={x}
                cy={y}
                r={x === last.x ? 4.5 : 2.5}
                fill={colors.accentText}
              />
            ))}
          </Svg>
        </View>
      </View>
      <View style={styles.dates}>
        <AppText tone="muted" variant="caption">
          {startLabel}
        </AppText>
        <AppText tone="muted" variant="caption">
          {endLabel}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: spacing.tight },
  plotRow: {
    flexDirection: 'row',
    gap: spacing.small,
    minHeight: plotHeight,
    height: plotHeight,
  },
  axis: { justifyContent: 'space-between', alignItems: 'flex-end' },
  plot: { flex: 1, minWidth: 0 },
  dates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.small,
    paddingLeft: spacing.section,
  },
});
