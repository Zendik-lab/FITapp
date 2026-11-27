import { lazy, Suspense, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/app-text';
import { ActionNotice } from '@/components/action-notice';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { CalendarPicker } from '@/components/calendar-picker';
import { DateSelector } from '@/components/date-selector';
import { AppHeader, SectionHeader } from '@/components/headers';
import { ScreenContainer } from '@/components/screen-container';
import { ScreenStack } from '@/components/screen-stack';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { NutritionSummary } from '@/features/nutrition/nutrition-summary';
import { CalculatorScreen } from '@/features/nutrition/calculator-screen';
import { addDays, sameDay } from '@/features/calendar/calendar';
import { spacing } from '@/theme';
import {
  dateKey,
  entryNutrition,
  formatEntryQuantity,
  parseDateKey,
  sumEntries,
} from './domain';
import { useFoodDiary } from './food-context';
import { FoodFlow } from './food-flow';
import { meals, type FoodDiaryEntry, type MealType } from './model';
import { NutritionValues } from './nutrition-values';
import { copyDay, removeEntry, restoreEntry } from './operations';
import { DiaryStatus } from './diary-status';
import { RecipeFlow } from '@/features/recipes/recipe-flow';
import { useLocalAction } from '@/features/smart/use-local-action';
import { PantryScreen } from '@/features/smart/pantry-screen';
import { CompareBudgetScreen } from '@/features/smart/compare-budget-screen';
import { DiaryRow } from './diary-row';
import { AwardNotice } from '@/features/smart/award-notice';

const PlannerScreen = lazy(() => import('@/features/planner/planner-screen'));

export function DiaryScreen() {
  const session = useFoodDiary();
  const { selectedDate, today, selectDate } = useSelectedDate();
  const [flow, setFlow] = useState<{
    meal?: MealType;
    entry?: FoodDiaryEntry;
    scan?: boolean;
  } | null>(null);
  const [calculator, setCalculator] = useState(false);
  const [recipes, setRecipes] = useState(false);
  const [planner, setPlanner] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [copying, setCopying] = useState<MealType | 'day' | null>(null);
  const [tools, setTools] = useState(false);
  const [panel, setPanel] = useState<
    'compare' | 'budget' | 'fridge' | 'shopping'
  >();
  const action = useLocalAction();
  const date = dateKey(selectedDate);
  const disabled =
    !session || session.loading || session.pending || !!session.failure;
  const undo = (entry: FoodDiaryEntry) => () => {
    if (session)
      void action.run(
        () => session.change((state) => restoreEntry(state, entry)),
        'Запись восстановлена.',
      );
  };
  function deleteRow(entry: FoodDiaryEntry) {
    if (session)
      void action.run(
        () => session.change((state) => removeEntry(state, entry.id, entry)),
        'Запись удалена.',
        undo(entry),
      );
  }
  function copy(from: string, to: string, meal?: MealType) {
    if (!session) return;
    let copied = 0;
    void action.run(async () => {
      await session.change((state) => {
        const next = copyDay(state, from, to, meal);
        copied = next.entries.length - state.entries.length;
        return next;
      });
      action.announce(
        copied
          ? `${meal ? 'Приём пищи скопирован' : 'Рацион скопирован'} на ${to}. Записей: ${copied}.`
          : 'Новых записей для копирования нет.',
      );
    });
  }
  function onLogged(
    message: string,
    destination: string,
    deleted?: FoodDiaryEntry,
  ) {
    selectDate(parseDateKey(destination));
    action.announce(message, deleted ? undo(deleted) : undefined, !!deleted);
    setFlow(null);
    setRecipes(false);
  }
  function renderDetail() {
    if (planner && session)
      return (
        <Suspense
          fallback={
            <ScreenContainer>
              <AppText
                accessibilityRole="status"
                accessibilityLiveRegion="polite"
              >
                Открываем план питания…
              </AppText>
            </ScreenContainer>
          }
        >
          <PlannerScreen session={session} onClose={() => setPlanner(false)} />
        </Suspense>
      );
    if (session && (panel === 'fridge' || panel === 'shopping'))
      return (
        <PantryScreen
          session={session}
          mode={panel}
          onBack={() => setPanel(undefined)}
        />
      );
    if (session && (panel === 'budget' || panel === 'compare'))
      return (
        <CompareBudgetScreen
          session={session}
          date={date}
          mode={panel}
          onBack={() => setPanel(undefined)}
        />
      );
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
      return (
        <FoodFlow
          date={date}
          {...flow}
          onClose={() => setFlow(null)}
          onLogged={onLogged}
        />
      );
    if (recipes)
      return (
        <RecipeFlow
          date={date}
          onClose={() => setRecipes(false)}
          onLogged={onLogged}
        />
      );
    return null;
  }
  return (
    <ScreenStack detail={renderDetail()}>
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
        <AwardNotice />
        <ActionNotice
          message={action.message}
          pending={session?.pending}
          dismiss={action.clear}
        />
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
        <PrimaryButton
          secondary
          icon="Utensils"
          label="План питания"
          disabled={disabled}
          onPress={() => setPlanner(true)}
        />
        <PrimaryButton
          secondary
          icon="BookOpen"
          label="Рецепты"
          disabled={disabled}
          onPress={() => setRecipes(true)}
        />
        <PrimaryButton
          secondary
          label="Инструменты питания"
          expanded={tools}
          onPress={() => setTools(!tools)}
        />
        {tools && (
          <Card>
            <PrimaryButton
              secondary
              label="Умный холодильник"
              disabled={disabled}
              onPress={() => setPanel('fridge')}
            />
            <PrimaryButton
              secondary
              label="Сравнение продуктов"
              disabled={disabled}
              onPress={() => setPanel('compare')}
            />
            <PrimaryButton
              secondary
              label="Покупки"
              disabled={disabled}
              onPress={() => setPanel('shopping')}
            />
            <PrimaryButton
              secondary
              label="Бюджет питания"
              disabled={disabled}
              onPress={() => setPanel('budget')}
            />
            <PrimaryButton
              secondary
              label="Скопировать вчерашний рацион"
              disabled={disabled || !sameDay(selectedDate, today)}
              onPress={() => copy(dateKey(addDays(selectedDate, -1)), date)}
            />
            <PrimaryButton
              secondary
              label="Скопировать рацион на дату"
              disabled={disabled}
              onPress={() => setCopying('day')}
            />
          </Card>
        )}
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
              <NutritionValues animate values={sumEntries(entries, date)} />
              {!entries.length && (
                <AppText variant="caption" tone="muted">
                  Пока нет записей. Добавьте первый продукт.
                </AppText>
              )}
              {entries.map((entry) => (
                <DiaryRow
                  key={entry.id}
                  disabled={disabled}
                  onEdit={() => setFlow({ entry })}
                  onRemove={() => deleteRow(entry)}
                >
                  <View style={styles.entry}>
                    <AppText variant="action">{entry.product.name}</AppText>
                    <AppText variant="caption" tone="muted">
                      {formatEntryQuantity(entry)}
                    </AppText>
                    <NutritionValues values={entryNutrition(entry)} />
                    <PrimaryButton
                      secondary
                      label={`Изменить запись: ${entry.product.name}`}
                      onPress={() => setFlow({ entry })}
                      disabled={disabled}
                    />
                    <PrimaryButton
                      secondary
                      label={`Удалить запись: ${entry.product.name}`}
                      disabled={disabled}
                      onPress={() => deleteRow(entry)}
                    />
                  </View>
                </DiaryRow>
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
        <CalendarPicker
          open={copying !== null}
          date={selectedDate}
          today={today}
          onDismiss={() => setCopying(null)}
          onChange={(to) => {
            if (!session || !copying) return;
            copy(date, dateKey(to), copying === 'day' ? undefined : copying);
          }}
        />
      </ScreenContainer>
    </ScreenStack>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.small },
  entry: { gap: spacing.small, paddingVertical: spacing.small },
});
