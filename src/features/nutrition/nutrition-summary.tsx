import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { SectionHeader } from '@/components/headers';
import { CalorieCard } from '@/features/demo/calorie-card';
import { getDailyNutrition } from './daily-totals';
import { useNutrition } from './nutrition-context';
import { useFoodDiary } from '@/features/food/food-context';
import { dateKey, sumEntries } from '@/features/food/domain';
import { useSelectedDate } from '@/features/calendar/selected-date';

export function NutritionSummary({
  onOpen,
  dominant = false,
}: {
  onOpen: () => void;
  dominant?: boolean;
}) {
  const session = useNutrition();
  const diary = useFoodDiary();
  const { selectedDate } = useSelectedDate();
  return (
    <>
      {session?.snapshot ? (
        <CalorieCard
          dominant={dominant}
          day={getDailyNutrition(
            session.snapshot.targets,
            sumEntries(diary?.state.entries ?? [], dateKey(selectedDate)),
          )}
        />
      ) : (
        <Card>
          <SectionHeader title="Калории и БЖУ" />
          <AppText tone="muted">
            {session?.issues.join(' ') ||
              'Заполните профиль для расчёта индивидуальных целей.'}
          </AppText>
        </Card>
      )}
      {!!session?.snapshot &&
        session.issues.map((issue) => (
          <AppText key={issue} tone="error" accessibilityRole="alert">
            {issue}
          </AppText>
        ))}
      {session?.failure && (
        <Card>
          <AppText tone="error" accessibilityRole="alert">
            {session.failure}
          </AppText>
          <PrimaryButton
            secondary
            label={
              session.loadFailed
                ? 'Повторить загрузку целей'
                : 'Повторить сохранение целей'
            }
            onPress={session.retry}
            disabled={session.pending}
          />
        </Card>
      )}
      <PrimaryButton secondary label="Калории и БЖУ" onPress={onOpen} />
    </>
  );
}
