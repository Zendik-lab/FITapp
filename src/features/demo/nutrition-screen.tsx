import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { DateSelector } from '@/components/date-selector';
import { AppHeader, SectionHeader } from '@/components/headers';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
import { sectionTitles } from '@/constants/sections';
import { formatNumber, sameDay } from '@/features/calendar/calendar';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { spacing } from '@/theme';

import { CalorieCard } from './calorie-card';
import { demoLabel, getDemoDay } from './demo-data';

export function NutritionScreen() {
  const { today, selectedDate, selectDate } = useSelectedDate();
  const showComingSoon = useComingSoon();
  const isToday = sameDay(today, selectedDate);
  const day = getDemoDay(isToday);

  return (
    <ScreenContainer>
      <AppHeader
        title={sectionTitles.nutrition}
        action={
          <View style={styles.buttons}>
            <IconButton
              label="Поиск продуктов"
              icon="magnifyingglass"
              onPress={() => showComingSoon('Поиск продуктов')}
            />
            <IconButton
              label="Сканировать штрихкод"
              icon="barcode.viewfinder"
              onPress={() => showComingSoon('Сканировать штрихкод')}
            />
          </View>
        }
      />
      <DateSelector date={selectedDate} today={today} onChange={selectDate} />
      <View style={styles.group}>
        <AppText variant="caption" tone="muted">
          {demoLabel}
        </AppText>
        <CalorieCard day={day} />
      </View>
      <View style={styles.group}>
        <SectionHeader title="Дневник питания" />
        {!isToday && <AppText tone="muted">Записей нет</AppText>}
        {day.meals.map(({ title, calories, example, icon }) => (
          <Card key={title} style={styles.meal}>
            <Icon name={icon} size={19} />
            <View style={styles.mealDetails}>
              <AppText variant="action">{title}</AppText>
              {example && (
                <AppText variant="caption" tone="muted">
                  {example} · {formatNumber(calories)} ккал
                </AppText>
              )}
            </View>
            <IconButton
              label={`Добавить продукт, ${title.toLocaleLowerCase('ru')}`}
              icon="plus"
              onPress={() => showComingSoon('Добавить продукт')}
            />
          </Card>
        ))}
      </View>
      <EmptyState
        title="Рецепты"
        description="Здесь появятся ваши блюда."
        icon="book.closed"
        action={
          <IconButton
            label="Открыть рецепты"
            icon="chevron.right"
            onPress={() => showComingSoon('Рецепты')}
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.small },
  buttons: { flexDirection: 'row', gap: spacing.small },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.compact,
    paddingVertical: spacing.compact,
  },
  mealDetails: { flex: 1, gap: spacing.tight },
});
