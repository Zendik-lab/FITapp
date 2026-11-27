import { Touchable } from '@/components/touchable';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { AppHeader, SectionHeader } from '@/components/headers';
import { EmptyState, StatCard } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
import { ScreenStack } from '@/components/screen-stack';
import { useFoodDiary } from '@/features/food/food-context';
import { DiaryStatus } from '@/features/food/diary-status';
import {
  insights,
  ProgressInsights,
  type InsightMode,
} from '@/features/smart/progress-insights';
import { AwardNotice } from '@/features/smart/award-notice';
import { WeightChart } from '@/components/weight-chart';
import { sectionTitles } from '@/constants/sections';
import {
  addDays,
  formatDate,
  formatNumber,
} from '@/features/calendar/calendar';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { demoLabel, demoWeight } from './demo-data';

const periods = [
  { days: 7, label: 'Неделя' },
  { days: 30, label: 'Месяц' },
  { days: 90, label: '3 месяца' },
  { days: 365, label: 'Год' },
] as const;
const dateFormat = { day: 'numeric', month: 'short' } as const;
const dateWithYear = { ...dateFormat, year: 'numeric' } as const;

export function ProgressScreen() {
  const session = useFoodDiary();
  const [panel, setPanel] = useState<InsightMode>();
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[1]);
  const { colors } = useAppTheme();
  const { today } = useSelectedDate();
  const showComingSoon = useComingSoon();
  const entries = demoWeight.entries.filter(
    ({ daysAgo }) => daysAgo <= period.days,
  );
  const difference = demoWeight.current - entries[0].kg;
  const startDate = addDays(today, -period.days);
  const axisDateFormat =
    startDate.getFullYear() === today.getFullYear() ? dateFormat : dateWithYear;

  return (
    <ScreenStack
      detail={
        panel && session ? (
          <ProgressInsights
            mode={panel}
            session={session}
            today={today}
            onBack={() => setPanel(undefined)}
          />
        ) : null
      }
    >
      <ScreenContainer>
        <AppHeader title={sectionTitles.progress} />
        {session && (
          <>
            <DiaryStatus />
            <AwardNotice />
            <Card>
              <SectionHeader title="Прогресс питания" />
              {insights.map(({ mode, title }) => (
                <PrimaryButton
                  key={mode}
                  secondary
                  label={title}
                  onPress={() => setPanel(mode)}
                  disabled={session.loading || !!session.failure}
                />
              ))}
            </Card>
          </>
        )}
        <View style={styles.group}>
          <AppText variant="caption" tone="muted">
            {demoLabel}
          </AppText>
          <View style={styles.stats}>
            <StatCard
              label="Текущий вес"
              icon="Scale"
              value={`${formatNumber(demoWeight.current)} кг`}
            />
            <StatCard
              label="Целевой вес"
              icon="Target"
              value={`${formatNumber(demoWeight.goal)} кг`}
            />
          </View>
        </View>
        <View style={styles.group}>
          <SectionHeader title="Динамика веса" />
          <Card>
            <View
              accessibilityRole="tablist"
              style={[styles.periods, { backgroundColor: colors.background }]}
            >
              {periods.map((option) => {
                const selected = period.days === option.days;
                return (
                  <Touchable
                    key={option.days}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    aria-selected={selected}
                    onPress={() => setPeriod(option)}
                    style={({ pressed }) => [
                      styles.period,
                      {
                        backgroundColor:
                          selected || pressed
                            ? colors.accentSurface
                            : 'transparent',
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      tone={selected ? 'accentText' : 'muted'}
                      style={styles.periodLabel}
                    >
                      {option.label}
                    </AppText>
                  </Touchable>
                );
              })}
            </View>
            <View style={styles.change}>
              <AppText variant="stat" tone="accentText">
                {difference > 0 ? '+' : ''}
                {formatNumber(difference)} кг
              </AppText>
              <AppText variant="caption" tone="muted">
                Изменение за период
              </AppText>
            </View>
            <WeightChart
              entries={entries}
              days={period.days}
              period={period.label}
              startLabel={formatDate(startDate, axisDateFormat)}
              endLabel={formatDate(today, axisDateFormat)}
            />
          </Card>
        </View>
        <PrimaryButton
          label="Добавить измерение"
          icon="Plus"
          onPress={() => showComingSoon('Добавить измерение')}
        />
        <View style={styles.group}>
          <SectionHeader title="Замеры тела" />
          <EmptyState
            title="Пока нет замеров"
            description="Здесь появятся замеры тела."
            icon="Ruler"
          />
        </View>
        <View style={styles.group}>
          <SectionHeader title="Фотографии прогресса" />
          <EmptyState
            title="Пока нет фотографий"
            description="Здесь появятся снимки прогресса."
            icon="Images"
            action={
              <IconButton
                label="Добавить фотографию"
                icon="Plus"
                onPress={() => showComingSoon('Добавить фотографию')}
              />
            }
          />
        </View>
      </ScreenContainer>
    </ScreenStack>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.small },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.compact },
  periods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
    borderRadius: radii.action,
    padding: spacing.tight,
  },
  period: {
    flex: 1,
    minWidth: 52,
    minHeight: touchSize,
    borderRadius: radii.action,
    padding: spacing.tight,
    justifyContent: 'center',
  },
  periodLabel: { textAlign: 'center', fontWeight: '600' },
  change: { gap: spacing.tight },
});
