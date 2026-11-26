import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { SectionHeader } from '@/components/headers';
import { CalorieCard } from '@/features/demo/calorie-card';
import { getDailyNutrition } from './daily-totals';
import { useNutrition } from './nutrition-context';

export function NutritionSummary({
  onOpen,
  dominant = false,
}: {
  onOpen: () => void;
  dominant?: boolean;
}) {
  const session = useNutrition();
  return (
    <>
      {session?.snapshot ? (
        <CalorieCard
          dominant={dominant}
          day={getDailyNutrition(session.snapshot.targets)}
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
