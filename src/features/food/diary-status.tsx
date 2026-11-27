import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { radii, useAppTheme } from '@/theme';
import { useFoodDiary } from './food-context';

export function DiaryStatus() {
  const session = useFoodDiary();
  const { colors } = useAppTheme();
  if (session?.loading)
    return (
      <Card>
        <AppText
          tone="muted"
          accessibilityRole="status"
          accessibilityLiveRegion="polite"
        >
          Загрузка дневника…
        </AppText>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={[styles.placeholder, { backgroundColor: colors.border }]}
        />
      </Card>
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

const styles = StyleSheet.create({
  placeholder: { height: 8, width: '72%', borderRadius: radii.action },
});
