import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useComingSoon } from '@/components/coming-soon';
import { AppHeader, SectionHeader } from '@/components/headers';
import { Icon } from '@/components/icon';
import { EmptyState, StatCard } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
import { sectionTitles } from '@/constants/sections';
import { radii, spacing, useAppTheme } from '@/theme';

import { demoLabel, demoTraining } from './demo-data';

export function WorkoutsScreen() {
  const { colors } = useAppTheme();
  const showComingSoon = useComingSoon();

  return (
    <ScreenContainer>
      <AppHeader title={sectionTitles.workouts} />
      <View style={styles.group}>
        <AppText variant="caption" tone="muted">
          {demoLabel}
        </AppText>
        <Card style={styles.next}>
          <View style={styles.nextHeading}>
            <View style={styles.nextText}>
              <AppText variant="caption" tone="muted">
                Следующая тренировка
              </AppText>
              <AppText variant="section">{demoTraining.next}</AppText>
              <AppText tone="muted">{demoTraining.description}</AppText>
            </View>
            <View
              style={[styles.tile, { backgroundColor: colors.accentSurface }]}
            >
              <Icon name="dumbbell" size={28} />
            </View>
          </View>
          <PrimaryButton
            label="Начать тренировку"
            icon="play.fill"
            onPress={() => showComingSoon('Начать тренировку')}
          />
        </Card>
      </View>
      <StatCard
        label="На этой неделе"
        value={`${demoTraining.completed} из ${demoTraining.weeklyGoal}`}
        detail="Тренировок выполнено"
        icon="checkmark.circle"
      >
        <View accessible={false} style={styles.sessions}>
          {Array.from({ length: demoTraining.weeklyGoal }, (_, index) => (
            <View
              key={index}
              style={[
                styles.session,
                {
                  backgroundColor:
                    index < demoTraining.completed
                      ? colors.accent
                      : colors.border,
                },
              ]}
            />
          ))}
        </View>
      </StatCard>
      <View style={styles.group}>
        <SectionHeader title="Программы" />
        <EmptyState
          title="Тренировочные программы"
          description="Здесь появятся ваши планы."
          icon="list.bullet.rectangle"
          action={
            <IconButton
              label="Открыть программы"
              icon="chevron.right"
              onPress={() => showComingSoon('Тренировочные программы')}
            />
          }
        />
      </View>
      <View style={styles.group}>
        <SectionHeader title="История" />
        <EmptyState
          title="Тренировок пока нет"
          description="Завершённые тренировки появятся здесь."
          icon="clock.arrow.circlepath"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.small },
  next: {
    padding: spacing.large,
    gap: spacing.large,
    borderRadius: radii.hero,
  },
  nextHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  nextText: { flex: 1, gap: spacing.tight },
  tile: {
    width: 60,
    height: 60,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessions: {
    flexDirection: 'row',
    gap: spacing.tight,
    marginTop: spacing.tight,
  },
  session: { flex: 1, height: 6, borderRadius: 3 },
});
