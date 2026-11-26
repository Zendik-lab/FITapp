import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { useFoodDiary } from './food-context';

export function DiaryStatus() {
  const session = useFoodDiary();
  if (session?.loading)
    return (
      <AppText accessibilityLiveRegion="polite">Загрузка дневника…</AppText>
    );
  if (!session?.failure) return null;
  return (
    <Card>
      <AppText tone="error" accessibilityRole="alert">
        {session.failure}
      </AppText>
      <PrimaryButton
        secondary
        label="Повторить загрузку дневника"
        onPress={() => void session.reload()}
      />
    </Card>
  );
}
