import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { CalendarPicker } from '@/components/calendar-picker';
import { DateSelector } from '@/components/date-selector';
import { AppHeader, SectionHeader } from '@/components/headers';
import { ScreenContainer } from '@/components/screen-container';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { NutritionSummary } from '@/features/nutrition/nutrition-summary';
import { CalculatorScreen } from '@/features/nutrition/calculator-screen';
import { formatNumber, sameDay } from '@/features/calendar/calendar';
import { describeError } from '@/database/storage-diagnostics';
import { spacing } from '@/theme';
import { dateKey, portion, sumEntries } from './domain';
import { useFoodDiary } from './food-context';
import { FoodFlow } from './food-flow';
import { meals, type FoodDiaryEntry, type MealType } from './model';
import { NutritionValues } from './nutrition-values';
import { copyMeal } from './operations';
import { DiaryStatus } from './diary-status';

export function DiaryScreen() {
  const session = useFoodDiary();
  const { selectedDate, today, selectDate } = useSelectedDate();
  const [flow, setFlow] = useState<{
    meal?: MealType;
    entry?: FoodDiaryEntry;
    scan?: boolean;
  } | null>(null);
  const [calculator, setCalculator] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [copying, setCopying] = useState<MealType | null>(null);
  const [notice, setNotice] = useState('');
  const date = dateKey(selectedDate);
  const disabled =
    !session || session.loading || session.pending || !!session.failure;
  if (calculator)
    return (
      <CalculatorScreen
        onClose={(saved) => {
          setCalculator(false);
          setUpdated(saved);
        }}
      />
    );
  if (flow)
    return <FoodFlow date={date} {...flow} onClose={() => setFlow(null)} />;
  return (
    <ScreenContainer>
      <AppHeader
        title="Питание"
        action={
          <View style={styles.row}>
            <IconButton
              icon="Search"
              label="Поиск продуктов"
              disabled={disabled}
              onPress={() => setFlow({})}
            />
            <IconButton
              icon="Barcode"
              label="Сканировать штрихкод"
              disabled={disabled}
              onPress={() => setFlow({ scan: true })}
            />
          </View>
        }
      />
      <DateSelector
        daily
        date={selectedDate}
        today={today}
        onChange={selectDate}
      />
      {!sameDay(selectedDate, today) && (
        <PrimaryButton
          secondary
          label="Вернуться к сегодня"
          onPress={() => selectDate(today)}
        />
      )}
      <DiaryStatus />
      {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
      {updated && (
        <AppText tone="accentText" accessibilityLiveRegion="polite">
          Цели питания сохранены.
        </AppText>
      )}
      <NutritionSummary
        onOpen={() => {
          setUpdated(false);
          setCalculator(true);
        }}
      />
      <SectionHeader title="Дневник питания" />
      {Object.entries(meals).map(([key, title]) => {
        const meal = key as MealType;
        const entries =
          session?.state.entries.filter(
            (e) => e.date === date && e.meal === meal,
          ) ?? [];
        return (
          <Card key={meal}>
            <SectionHeader title={title} />
            <NutritionValues values={sumEntries(entries, date)} />
            {!entries.length && (
              <AppText variant="caption" tone="muted">
                Пока нет записей. Добавьте первый продукт.
              </AppText>
            )}
            {entries.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <AppText variant="action">{entry.product.name}</AppText>
                <AppText variant="caption" tone="muted">
                  {formatNumber(entry.grams)} г
                </AppText>
                <NutritionValues
                  values={portion(entry.product, entry.amount, entry.unit)}
                />
                <PrimaryButton
                  secondary
                  label={`Изменить запись: ${entry.product.name}`}
                  onPress={() => setFlow({ entry })}
                  disabled={disabled}
                />
              </View>
            ))}
            <PrimaryButton
              secondary
              icon="Plus"
              label={`Добавить продукт, ${title.toLocaleLowerCase('ru')}`}
              disabled={disabled}
              onPress={() => setFlow({ meal })}
            />
            {!!entries.length && (
              <PrimaryButton
                secondary
                label={`Скопировать ${title.toLocaleLowerCase('ru')} на дату`}
                disabled={disabled}
                onPress={() => setCopying(meal)}
              />
            )}
          </Card>
        );
      })}
      {copying && (
        <CalendarPicker
          date={selectedDate}
          today={today}
          onDismiss={() => setCopying(null)}
          onChange={(to) => {
            if (!session) return;
            const meal = copying;
            void session
              .change((s) => copyMeal(s, date, meal, dateKey(to)))
              .then(
                () => setNotice(`Приём пищи скопирован на ${dateKey(to)}.`),
                (error: unknown) => setNotice(describeError(error)),
              );
          }}
        />
      )}
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.small },
  entry: { gap: spacing.small, paddingVertical: spacing.small },
});
