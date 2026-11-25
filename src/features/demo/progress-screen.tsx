import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { AppHeader, SectionHeader } from '@/components/headers';
import { EmptyState, StatCard } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
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
    <ScreenContainer>
      <AppHeader title={sectionTitles.progress} />
      <View style={styles.group}>
        <AppText variant="caption" tone="muted">
          {demoLabel}
        </AppText>
        <View style={styles.stats}>
          <StatCard
            label="Текущий вес"
            icon="scalemass"
            value={`${formatNumber(demoWeight.current)} кг`}
          />
          <StatCard
            label="Целевой вес"
            icon="scope"
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
                <Pressable
                  key={option.days}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
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
                </Pressable>
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
        icon="plus"
        onPress={() => showComingSoon('Добавить измерение')}
      />
      <View style={styles.group}>
        <SectionHeader title="Замеры тела" />
        <EmptyState
          title="Пока нет замеров"
          description="Здесь появятся замеры тела."
          icon="ruler"
        />
      </View>
      <View style={styles.group}>
        <SectionHeader title="Фотографии прогресса" />
        <EmptyState
          title="Пока нет фотографий"
          description="Здесь появятся снимки прогресса."
          icon="photo.on.rectangle"
          action={
            <IconButton
              label="Добавить фотографию"
              icon="plus"
              onPress={() => showComingSoon('Добавить фотографию')}
            />
          }
        />
      </View>
    </ScreenContainer>
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
