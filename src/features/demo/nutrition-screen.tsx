import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { DateSelector } from '@/components/date-selector';
import { AppHeader, SectionHeader } from '@/components/headers';
import { AppIcon } from '@/components/app-icon';
import { EmptyState } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
import { sectionTitles } from '@/constants/sections';
import { formatNumber, sameDay } from '@/features/calendar/calendar';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { spacing } from '@/theme';

import { CalorieCard } from './calorie-card';
import { demoLabel, getDemoDay } from './demo-data';
import { useProfile } from '@/features/profile/profile-context';
import { NutritionSummary } from '@/features/nutrition/nutrition-summary';
import { CalculatorScreen } from '@/features/nutrition/calculator-screen';
import { useFoodDiary } from '@/features/food/food-context';
import { DiaryScreen } from '@/features/food/diary-screen';

export function NutritionScreen() {
  const diary = useFoodDiary();
  return diary ? <DiaryScreen /> : <DemoNutritionScreen />;
}
function DemoNutritionScreen() {
  const profile = useProfile()?.state.profile;
  const [calculator, setCalculator] = useState(false);
  const [updated, setUpdated] = useState(false);
  const { today, selectedDate, selectDate } = useSelectedDate();
  const showComingSoon = useComingSoon();
  const isToday = sameDay(today, selectedDate);
  const day = getDemoDay(isToday);

  if (calculator)
    return (
      <CalculatorScreen
        onClose={(saved) => {
          setCalculator(false);
          setUpdated(saved);
        }}
      />
    );

  return (
    <ScreenContainer>
      <AppHeader
        title={sectionTitles.nutrition}
        action={
          <View style={styles.buttons}>
            <IconButton
              label="Поиск продуктов"
              icon="Search"
              onPress={() => showComingSoon('Поиск продуктов')}
            />
            <IconButton
              label="Сканировать штрихкод"
              icon="Barcode"
              onPress={() => showComingSoon('Сканировать штрихкод')}
            />
          </View>
        }
      />
      <DateSelector date={selectedDate} today={today} onChange={selectDate} />
      {updated && (
        <AppText tone="accentText" accessibilityLiveRegion="polite">
          Цели питания сохранены.
        </AppText>
      )}
      <View style={styles.group}>
        {profile ? (
          <NutritionSummary
            onOpen={() => {
              setUpdated(false);
              setCalculator(true);
            }}
          />
        ) : (
          <>
            <AppText variant="caption" tone="muted">
              {demoLabel}
            </AppText>
            <CalorieCard day={day} />
          </>
        )}
      </View>
      <View style={styles.group}>
        <SectionHeader title="Дневник питания" />
        {profile ? (
          <AppText tone="muted">
            Записей нет. Дневник питания появится на этапе 04.
          </AppText>
        ) : (
          <>
            {!isToday && <AppText tone="muted">Записей нет</AppText>}
            {day.meals.map(({ title, calories, example, icon }) => (
              <Card key={title} style={styles.meal}>
                <AppIcon name={icon} size={19} />
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
                  icon="Plus"
                  onPress={() => showComingSoon('Добавить продукт')}
                />
              </Card>
            ))}
          </>
        )}
      </View>
      <EmptyState
        title="Рецепты"
        description="Здесь появятся ваши блюда."
        icon="BookOpen"
        action={
          <IconButton
            label="Открыть рецепты"
            icon="ChevronRight"
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
