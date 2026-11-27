import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { AppIcon } from '@/components/app-icon';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { SceneTransition } from '@/components/screen-stack';
import { Touchable } from '@/components/touchable';
import { formatNumber } from '@/features/calendar/calendar';
import { entryNutrition, formatEntryQuantity } from '@/features/food/domain';
import type { FoodDiaryEntry } from '@/features/food/model';
import { spacing, touchSize, useAppTheme } from '@/theme';
import type { PlanItem, PlanMeal } from './model';
import { mealProgress, plannedNutrition } from './operations';

export function PlanMealCard({
  meal,
  entries,
  disabled,
  onAdd,
  onSettings,
  onItem,
  onEaten,
  onComplete,
}: {
  meal: PlanMeal;
  entries: ReadonlyMap<string, FoodDiaryEntry>;
  disabled: boolean;
  onAdd(): void;
  onSettings(): void;
  onItem(item: PlanItem): void;
  onEaten(item: PlanItem): void;
  onComplete(): void;
}) {
  const [open, setOpen] = useState(true);
  const { colors } = useAppTheme();
  const { count, total, completed } = mealProgress(meal, entries);
  const calories = plannedNutrition([meal]).calories;
  return (
    <Card>
      <View style={styles.header}>
        <Touchable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${meal.title}, ${meal.time}, ${completed ? 'выполнен' : 'не выполнен'}`}
          onPress={() => setOpen(!open)}
          style={styles.headingPress}
        >
          <AppIcon name={completed ? 'CircleCheck' : 'Utensils'} size={20} />
          <View style={styles.details}>
            <AppText variant="action">{meal.title}</AppText>
            <AppText
              tone={completed ? 'accentText' : 'muted'}
              variant="caption"
            >
              {meal.time} · {formatNumber(calories)} ккал ·{' '}
              {completed
                ? 'Выполнен'
                : total
                  ? `${count} из ${total} отмечено`
                  : 'Пусто'}
            </AppText>
          </View>
          <View style={open && styles.chevronOpen}>
            <AppIcon name="ChevronRight" size={16} color={colors.muted} />
          </View>
        </Touchable>
        <IconButton
          label={`Настройки · ${meal.title}`}
          icon="List"
          disabled={disabled}
          onPress={onSettings}
        />
      </View>
      {open && (
        <SceneTransition
          transitionKey={meal.items.map(({ entry }) => entry.id).join(':')}
          style={styles.body}
        >
          {meal.items.map((item) => {
            const { entry } = item;
            const eaten = entries.get(entry.id);
            return (
              <View
                key={entry.id}
                style={[styles.item, { borderTopColor: colors.border }]}
              >
                <Touchable
                  accessibilityRole="button"
                  accessibilityLabel={`Изменить · ${entry.product.name}`}
                  disabled={disabled}
                  onPress={() => onItem(item)}
                  style={styles.details}
                >
                  <AppText variant="action">{entry.product.name}</AppText>
                  <AppText variant="caption" tone="muted">
                    {formatEntryQuantity(entry)} ·{' '}
                    {formatNumber(entryNutrition(entry).calories)} ккал
                    {item.locked ? ' · Зафиксировано' : ''}
                  </AppText>
                  {eaten && (
                    <AppText variant="caption" tone="accentText">
                      Съедено · {formatEntryQuantity(eaten)}
                      {eaten.date !== entry.date ? ` · ${eaten.date}` : ''}
                    </AppText>
                  )}
                </Touchable>
                {!eaten && (
                  <PrimaryButton
                    secondary
                    label="Съел"
                    disabled={disabled}
                    onPress={() => onEaten(item)}
                  />
                )}
              </View>
            );
          })}
          <PrimaryButton
            secondary
            icon="Plus"
            label="Добавить блюдо"
            disabled={disabled}
            onPress={onAdd}
          />
          {total > 0 && !completed && count < total && (
            <PrimaryButton
              secondary
              label="Отметить приём пищи выполненным"
              disabled={disabled}
              onPress={onComplete}
            />
          )}
        </SceneTransition>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  headingPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchSize,
    gap: spacing.small,
  },
  details: {
    flex: 1,
    minHeight: touchSize,
    justifyContent: 'center',
    gap: spacing.tight,
  },
  body: { gap: spacing.small },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
