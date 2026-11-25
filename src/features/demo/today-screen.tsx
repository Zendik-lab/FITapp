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

const quickActions: readonly { label: string; icon: AppIconName }[] = [
  { label: 'Добавить еду', icon: 'Utensils' },
  { label: 'Записать вес', icon: 'Scale' },
  { label: 'Добавить воду', icon: 'Droplet' },
  { label: 'Начать тренировку', icon: 'Play' },
];

export function TodayScreen() {
  const profile = useProfile()?.state.profile;
  const { colors } = useAppTheme();
  const { fontScale, width } = useWindowDimensions();
  const { today, selectedDate, selectDate } = useSelectedDate();
  const showComingSoon = useComingSoon();
  const isToday = sameDay(today, selectedDate);
  const day = getDemoDay(isToday);

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
      <View style={styles.group}>
        {profile ? (
          <Card>
            <SectionHeader title="Калории и БЖУ" />
            <AppText tone="muted">
              Пока не рассчитаны. Персональные расчёты появятся на следующем
              этапе.
            </AppText>
          </Card>
        ) : (
          <>
            <AppText variant="caption" tone="muted">
              {demoLabel}
            </AppText>
            <CalorieCard day={day} dominant />
          </>
        )}
      </View>
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
              onPress={() => showComingSoon(label)}
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
