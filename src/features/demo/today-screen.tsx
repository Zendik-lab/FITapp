import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { DateSelector } from '@/components/date-selector';
import { AppHeader, SectionHeader } from '@/components/headers';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { EmptyState, StatCard } from '@/components/info-cards';
import { MacroProgressBar } from '@/components/progress-indicators';
import { ScreenContainer } from '@/components/screen-container';
import { sectionTitles } from '@/constants/sections';
import {
  formatDate,
  formatNumber,
  sameDay,
} from '@/features/calendar/calendar';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { CalorieCard } from './calorie-card';
import { demoLabel, demoTraining, demoWeight, getDemoDay } from './demo-data';
import { useProfile } from '@/features/profile/profile-context';
import { goalLabels } from '@/features/profile/options';
import { NutritionSummary } from '@/features/nutrition/nutrition-summary';
import { CalculatorScreen } from '@/features/nutrition/calculator-screen';
import { useFoodDiary } from '@/features/food/food-context';
import { FoodFlow } from '@/features/food/food-flow';
import { DiaryStatus } from '@/features/food/diary-status';
import { dateKey, entryNutrition, parseDateKey } from '@/features/food/domain';
import { NutritionValues } from '@/features/food/nutrition-values';
import type { FoodDiaryEntry } from '@/features/food/model';
import { formatFoodQuantity } from '@/features/food/units';

const quickActions: readonly { label: string; icon: AppIconName }[] = [
  { label: 'Добавить еду', icon: 'Utensils' },
  { label: 'Записать вес', icon: 'Scale' },
  { label: 'Добавить воду', icon: 'Droplet' },
  { label: 'Начать тренировку', icon: 'Play' },
];

export function TodayScreen() {
  const [calculator, setCalculator] = useState(false);
  const diary = useFoodDiary();
  const [food, setFood] = useState<{ entry?: FoodDiaryEntry } | null>(null);
  const [foodNotice, setFoodNotice] = useState('');
  const profile = useProfile()?.state.profile;
  const { colors } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const { today, selectedDate, selectDate } = useSelectedDate();
  const showComingSoon = useComingSoon();
  const isToday = sameDay(today, selectedDate);
  const day = getDemoDay(isToday);

  if (calculator)
    return <CalculatorScreen onClose={() => setCalculator(false)} />;
  if (food)
    return (
      <FoodFlow
        date={dateKey(selectedDate)}
        entry={food.entry}
        onClose={() => setFood(null)}
        onLogged={(message, date) => {
          selectDate(parseDateKey(date));
          setFoodNotice(message);
          setFood(null);
        }}
      />
    );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText tone="accentText" variant="caption">
          {formatDate(today, {
            day: 'numeric',
            month: 'long',
            weekday: 'long',
          }).toLocaleUpperCase('ru')}
        </AppText>
        <AppHeader
          title={sectionTitles.index}
          subtitle={profile ? `Привет, ${profile.personal.name}!` : 'Привет!'}
        />
      </View>
      <DateSelector date={selectedDate} today={today} onChange={selectDate} />
      {diary && <DiaryStatus />}
      {!!foodNotice && (
        <AppText accessibilityLiveRegion="polite">{foodNotice}</AppText>
      )}
      <View style={styles.group}>
        {profile ? (
          <NutritionSummary dominant onOpen={() => setCalculator(true)} />
        ) : (
          <>
            <AppText variant="caption" tone="muted">
              {demoLabel}
            </AppText>
            <CalorieCard day={day} dominant />
          </>
        )}
      </View>
      {diary && (
        <View style={styles.group}>
          <SectionHeader title="Последние продукты" />
          {diary.state.entries
            .filter((e) => e.date === dateKey(selectedDate))
            .slice(-3)
            .reverse()
            .map((entry) => (
              <Card key={entry.id}>
                <AppText variant="action">
                  {entry.product.name} ·{' '}
                  {entry.recipe && entry.unit === 'serving'
                    ? `${formatFoodQuantity(entry.amount)} порц.`
                    : `${formatFoodQuantity(entry.grams ?? 0)} г`}
                </AppText>
                <NutritionValues values={entryNutrition(entry)} />
                <IconButton
                  icon="ChevronRight"
                  label={`Открыть запись: ${entry.product.name}`}
                  onPress={() => setFood({ entry })}
                />
              </Card>
            ))}
          {!diary.state.entries.some(
            (e) => e.date === dateKey(selectedDate),
          ) && (
            <AppText tone="muted">
              В выбранный день пока нет записей питания.
            </AppText>
          )}
        </View>
      )}
      <View
        style={[
          styles.stats,
          (width < 360 || fontScale > 1.5) && styles.statsStacked,
        ]}
      >
        <StatCard
          label="Текущий вес"
          icon="Scale"
          value={`${formatNumber(profile?.body.currentWeightKg ?? demoWeight.current)} кг`}
          detail={`Цель ${formatNumber(profile?.goals.targetWeightKg ?? demoWeight.goal)} кг`}
        />
        <Card style={styles.water}>
          <MacroProgressBar label="Вода" {...day.water} tone="water" />
          <IconButton
            label="Добавить воду"
            icon="Plus"
            onPress={() => showComingSoon('Добавить воду')}
          />
        </Card>
      </View>
      {profile && (
        <Card>
          <SectionHeader title={goalLabels[profile.goals.kind]} />
          <AppText>
            До целевого веса:{' '}
            {formatNumber(
              Math.abs(
                profile.goals.targetWeightKg - profile.body.currentWeightKg,
              ),
            )}{' '}
            кг
          </AppText>
          <AppText variant="caption" tone="muted">
            Вес указан в профиле. Дневник веса появится позже.
          </AppText>
        </Card>
      )}
      {profile && (
        <AppText variant="caption" tone="muted">
          {demoLabel}: вода и тренировки
        </AppText>
      )}
      <View style={styles.group}>
        <SectionHeader title="Тренировка" />
        <EmptyState
          title={isToday ? demoTraining.next : 'Нет тренировки'}
          description={
            isToday
              ? demoTraining.description
              : 'На выбранную дату тренировок нет.'
          }
          icon="Dumbbell"
          action={
            isToday ? (
              <IconButton
                label="Начать тренировку"
                icon="Play"
                onPress={() => showComingSoon('Начать тренировку')}
              />
            ) : undefined
          }
        />
      </View>
      <View style={styles.group}>
        <SectionHeader title="Быстрые действия" />
        <View style={styles.actions}>
          {quickActions.map(({ label, icon }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() =>
                label === 'Добавить еду' && diary
                  ? setFood({})
                  : showComingSoon(label)
              }
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: pressed
                    ? colors.accentSurface
                    : colors.surface,
                },
                fontScale > 1.5 && styles.fullAction,
              ]}
            >
              <AppIcon name={icon} size={19} />
              <AppText variant="action" style={styles.actionLabel}>
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.tight },
  group: { gap: spacing.small },
  stats: { flexDirection: 'row', gap: spacing.compact },
  statsStacked: { flexDirection: 'column' },
  water: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  action: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: touchSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.compact,
    borderRadius: radii.action,
  },
  fullAction: { flexBasis: '100%' },
  actionLabel: { flex: 1 },
});
