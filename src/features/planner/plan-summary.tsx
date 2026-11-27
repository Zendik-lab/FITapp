import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import {
  MacroProgressBar,
  ProgressRing,
} from '@/components/progress-indicators';
import { formatNumber } from '@/features/calendar/calendar';
import {
  addNutrition,
  scaleNutrition,
  zeroNutrition,
} from '@/features/food/domain';
import type { FoodDiaryEntry } from '@/features/food/model';
import type { NutritionTargets } from '@/features/nutrition/engine';
import { spacing } from '@/theme';
import type { PlanDay } from './model';
import { planStats } from './operations';

const signed = (value: number) =>
  `${value > 0 ? '+' : ''}${formatNumber(value)}`;

export function PlanSummary({
  day,
  entries,
  target,
}: {
  day: PlanDay;
  entries: readonly FoodDiaryEntry[];
  target?: NutritionTargets;
}) {
  const stats = planStats(day, entries, target);
  const { planned, delta, actual, percent } = stats;
  const goal = stats.target;
  const deviation =
    delta && goal && goal.calories > 0
      ? (100 * delta.calories) / goal.calories
      : 0;
  return (
    <Card>
      <View style={styles.summary}>
        {goal && (
          <ProgressRing
            size={94}
            value={planned.calories}
            goal={goal.calories}
            label="Запланированная калорийность"
          />
        )}
        <View style={styles.totals}>
          <AppText variant="caption" tone="muted">
            Запланировано
          </AppText>
          <AppText variant="stat">
            {formatNumber(planned.calories)} ккал
          </AppText>
          {goal && (
            <AppText variant="caption" tone="muted">
              Цель · {formatNumber(goal.calories)} ккал
            </AppText>
          )}
        </View>
      </View>
      {goal ? (
        <View style={styles.macros}>
          <MacroProgressBar
            label="Белки"
            tone="protein"
            value={planned.protein}
            goal={goal.protein}
          />
          <MacroProgressBar
            label="Жиры"
            tone="fat"
            value={planned.fat}
            goal={goal.fat}
          />
          <MacroProgressBar
            label="Углеводы"
            tone="carbs"
            value={planned.carbs}
            goal={goal.carbs}
          />
        </View>
      ) : (
        <AppText variant="caption">
          Б {formatNumber(planned.protein)} · Ж {formatNumber(planned.fat)} · У{' '}
          {formatNumber(planned.carbs)} г
        </AppText>
      )}
      {delta && (
        <AppText
          variant="caption"
          tone={Math.abs(deviation) > 5 ? 'error' : 'muted'}
        >
          Отклонение {signed(delta.calories)} ккал ({signed(deviation)}%) · Б{' '}
          {signed(delta.protein)} · Ж {signed(delta.fat)} · У{' '}
          {signed(delta.carbs)} г
        </AppText>
      )}
      <AppText variant="action">
        В дневнике · {formatNumber(actual.calories)} ккал
      </AppText>
      <AppText
        variant="caption"
        tone={stats.completed ? 'accentText' : 'muted'}
      >
        План выполнен на {percent}%
      </AppText>
    </Card>
  );
}

export function WeekSummary({
  days,
  entries,
}: {
  days: readonly PlanDay[];
  entries: readonly FoodDiaryEntry[];
}) {
  if (!days.length) return null;
  const stats = days.map((day) => planStats(day, entries));
  const average = scaleNutrition(
    stats.reduce((sum, day) => addNutrition(sum, day.planned), zeroNutrition),
    1 / stats.length,
  );
  const actual =
    stats.reduce((sum, day) => sum + day.actual.calories, 0) / stats.length;
  const completed = stats.filter((row) => row.completed).length;
  return (
    <Card>
      <AppText variant="action">Итоги недели</AppText>
      <AppText variant="caption" tone="muted">
        Выполнено дней · {completed} из {days.length} запланированных
      </AppText>
      <AppText variant="caption">
        В среднем по дням с планом · {formatNumber(average.calories)} ккал · Б{' '}
        {formatNumber(average.protein)} · Ж {formatNumber(average.fat)} · У{' '}
        {formatNumber(average.carbs)} г
      </AppText>
      <AppText variant="caption" tone="muted">
        В дневнике · {formatNumber(actual)} ккал в день
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  totals: { flex: 1, gap: spacing.tight },
  macros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.medium },
});
