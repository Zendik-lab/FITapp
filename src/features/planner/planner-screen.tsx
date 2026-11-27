import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { DateSelector } from '@/components/date-selector';
import { Dialog } from '@/components/dialog';
import { EmptyState } from '@/components/info-cards';
import { ScreenContainer } from '@/components/screen-container';
import { SceneTransition, ScreenStack } from '@/components/screen-stack';
import { describeError } from '@/database/storage-diagnostics';
import { weekDays } from '@/features/calendar/calendar';
import { useSelectedDate } from '@/features/calendar/selected-date';
import { DiaryStatus } from '@/features/food/diary-status';
import { dateKey, newId, parseDateKey } from '@/features/food/domain';
import type { FoodSession } from '@/features/food/food-context';
import { useNutrition } from '@/features/nutrition/nutrition-context';
import { useProfile } from '@/features/profile/profile-context';
import { useLocalAction } from '@/features/smart/use-local-action';
import { spacing } from '@/theme';
import {
  type PlanDay,
  type PlanItem,
  type PlanMeal,
  type PlanMealKind,
  type PlanTemplate,
} from './model';
import {
  copyMeals,
  createPlanDay,
  markPlanMeal,
  readPlanner,
  removePlanDay,
  removePlanTemplate,
  replacePlanMeal,
  savePlanDays,
  savePlanTemplate,
  undoPlanItem,
} from './operations';
import {
  CopyPlanForm,
  PlanTemplates,
  SavePlanTemplateForm,
} from './plan-day-forms';
import {
  PlanItemPicker,
  PlanMealEditor,
  PlanPortionEditor,
} from './plan-editors';
import {
  PlanGenerationForm,
  type GenerationScope,
} from './plan-generation-form';
import { PlanMealCard } from './plan-meal-card';
import { PlanSummary, WeekSummary } from './plan-summary';

type DayContext = { day: PlanDay; previous?: PlanDay };
type Detail =
  | ({ kind: 'meal'; meal?: PlanMeal } & DayContext)
  | ({ kind: 'pick'; meal: PlanMeal; item?: PlanItem } & DayContext)
  | ({ kind: 'portion' | 'eaten'; meal: PlanMeal; item: PlanItem } & DayContext)
  | ({ kind: 'copy' } & DayContext)
  | { kind: 'generate'; scope: GenerationScope }
  | { kind: 'save-template'; meals: PlanMeal[] }
  | { kind: 'templates' };

type Menu =
  | { kind: 'day' }
  | { kind: 'meal'; meal: PlanMeal }
  | { kind: 'item'; meal: PlanMeal; item: PlanItem };
type Confirmation = {
  title: string;
  text: string;
  label: string;
  run(): Promise<void>;
};
const mealOrder: PlanMealKind[] = [
  'breakfast',
  'lunch',
  'dinner',
  'afternoon',
  'secondBreakfast',
  'snack',
  'preWorkout',
  'postWorkout',
];

export default function PlannerScreen({
  session,
  onClose,
}: {
  session: FoodSession;
  onClose(): void;
}) {
  const { today, selectedDate, selectDate } = useSelectedDate();
  const nutrition = useNutrition();
  const profile = useProfile()?.state.profile?.nutrition;
  const target = nutrition?.issues.length
    ? undefined
    : nutrition?.snapshot?.targets;
  const [detail, setDetail] = useState<Detail>();
  const [menu, setMenu] = useState<Menu>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [confirmError, setConfirmError] = useState('');
  const action = useLocalAction();
  const planner = readPlanner(session.state);
  const date = dateKey(selectedDate);
  const previous = planner.days[date];
  const day = previous ?? createPlanDay(date, target);
  const context = { day, previous };
  const week = weekDays(selectedDate);
  const weekPlans = week.flatMap((day) => planner.days[dateKey(day)] ?? []);
  const disabled = session.pending || session.loading || !!session.failure;
  const closeDetail = () => setDetail(undefined);

  function openDetail(next: Detail) {
    setMenu(undefined);
    setDetail(next);
  }
  function generate(scope: GenerationScope) {
    if (target) openDetail({ kind: 'generate', scope });
  }
  async function commitDay(
    next: PlanDay,
    previous?: PlanDay,
    message = 'План сохранён.',
  ) {
    await session.change((state) =>
      savePlanDays(state, [next], previous ? { [next.date]: previous } : {}),
    );
    closeDetail();
    action.announce(message);
  }
  async function commitMeal(
    context: DayContext,
    meal: PlanMeal,
    message?: string,
  ) {
    await commitDay(
      replacePlanMeal(context.day, meal),
      context.previous,
      message,
    );
  }
  function updateItem(
    context: DayContext,
    meal: PlanMeal,
    next: PlanItem,
    original?: PlanItem,
  ) {
    const items = original
      ? meal.items.map((row) =>
          row.entry.id === original.entry.id ? next : row,
        )
      : [...meal.items, next];
    return commitMeal(
      context,
      { ...meal, items },
      original ? 'Блюдо обновлено.' : 'Блюдо добавлено в план.',
    );
  }
  const replaceMeals = (
    meals: PlanMeal[],
    dates: string[],
    dayTarget = target,
  ) =>
    dates.map((date) => ({
      ...createPlanDay(date, dayTarget),
      meals: copyMeals(meals, date),
    }));

  function ask(confirmation: Confirmation) {
    setMenu(undefined);
    setConfirmError('');
    setConfirmation(confirmation);
  }
  async function confirm() {
    if (!confirmation || disabled) return;
    try {
      await confirmation.run();
      setConfirmation(undefined);
    } catch (cause) {
      setConfirmError(describeError(cause));
    }
  }
  async function applyDays(next: PlanDay[], message: string) {
    const expected = Object.fromEntries(
      next.flatMap(({ date }) =>
        planner.days[date] ? [[date, planner.days[date]]] : [],
      ),
    );
    const count = Object.keys(expected).length;
    async function save() {
      await session.change((state) => savePlanDays(state, next, expected));
      closeDetail();
      selectDate(parseDateKey(next[0].date));
      action.announce(message);
    }
    if (count)
      ask({
        title: 'Заменить планы на выбранные даты?',
        text: `Будет заменено планов: ${count}. Записи о съеденных блюдах останутся в дневнике.`,
        label: 'Подтвердить замену',
        run: save,
      });
    else await save();
  }
  async function applyTemplate(template: PlanTemplate, append: boolean) {
    if (append) {
      await commitDay(
        { ...day, meals: [...day.meals, ...copyMeals(template.meals, date)] },
        previous,
        'Шаблон добавлен к плану.',
      );
    } else {
      await applyDays(replaceMeals(template.meals, [date]), 'Шаблон применён.');
    }
  }
  function moveMeal(meal: PlanMeal, offset: number) {
    const meals = [...day.meals];
    const index = meals.findIndex((row) => row.id === meal.id);
    [meals[index], meals[index + offset]] = [
      meals[index + offset],
      meals[index],
    ];
    setMenu(undefined);
    void action.run(() =>
      commitDay({ ...day, meals }, previous, 'Порядок приёмов изменён.'),
    );
  }
  function mark(context: DayContext, meal: PlanMeal, item?: PlanItem) {
    return session
      .change((state) => markPlanMeal(state, context.day, meal, item))
      .then(() => {
        closeDetail();
        action.announce(
          item
            ? 'Блюдо добавлено в дневник.'
            : 'Приём пищи отмечен в дневнике.',
        );
      });
  }
  function renderDetail() {
    if (!detail) return null;
    switch (detail.kind) {
      case 'meal': {
        const nextKind =
          mealOrder.find(
            (kind) => !detail.day.meals.some((meal) => meal.kind === kind),
          ) ?? 'snack';
        return (
          <PlanMealEditor
            initial={detail.meal}
            nextKind={nextKind}
            pending={session.pending}
            onClose={closeDetail}
            save={(meal) => commitMeal(detail, meal)}
          />
        );
      }
      case 'pick':
        return (
          <PlanItemPicker
            session={session}
            day={detail.day}
            meal={detail.meal}
            replacing={detail.item}
            onClose={closeDetail}
            save={(item) => updateItem(detail, detail.meal, item, detail.item)}
          />
        );
      case 'portion':
      case 'eaten':
        return (
          <PlanPortionEditor
            item={detail.item}
            title={
              detail.kind === 'eaten' ? 'Фактическая порция' : 'Изменить порцию'
            }
            submitLabel={
              detail.kind === 'eaten'
                ? 'Записать в дневник'
                : 'Сохранить порцию'
            }
            pending={session.pending}
            onClose={closeDetail}
            save={(item) =>
              detail.kind === 'eaten'
                ? mark(detail, detail.meal, item)
                : updateItem(detail, detail.meal, item, detail.item)
            }
          />
        );
      case 'generate':
        return (
          target && (
            <PlanGenerationForm
              session={session}
              target={target}
              profile={profile}
              scope={detail.scope}
              onClose={closeDetail}
              onSaved={(date) => {
                closeDetail();
                selectDate(parseDateKey(date));
                action.announce('Рацион сохранён.');
              }}
            />
          )
        );
      case 'copy':
        return (
          <CopyPlanForm
            day={detail.day}
            pending={session.pending}
            onClose={closeDetail}
            onCopy={(dates) =>
              applyDays(
                replaceMeals(detail.day.meals, dates),
                'Рацион скопирован.',
              )
            }
          />
        );
      case 'save-template':
        return (
          <SavePlanTemplateForm
            meals={detail.meals}
            pending={session.pending}
            onClose={closeDetail}
            onSave={async (name) => {
              await session.change((state) =>
                savePlanTemplate(state, {
                  id: newId(),
                  name,
                  meals: detail.meals,
                }),
              );
              closeDetail();
              action.announce('Шаблон сохранён.');
            }}
          />
        );
      case 'templates':
        return (
          <PlanTemplates
            session={session}
            onClose={closeDetail}
            onApply={applyTemplate}
            onRemove={(template) =>
              ask({
                title: 'Удалить шаблон?',
                text: template.name,
                label: 'Удалить шаблон',
                run: async () => {
                  await session.change((state) =>
                    removePlanTemplate(state, template.id),
                  );
                  action.announce('Шаблон удалён.');
                },
              })
            }
          />
        );
    }
  }

  const logged = new Map(
    session.state.entries.map((entry) => [entry.id, entry]),
  );
  const hasItems = day.meals.some((meal) => meal.items.length);
  const dayMenu = menu?.kind === 'day';
  const mealMenu = menu?.kind === 'meal' ? menu.meal : undefined;
  const itemMenu = menu?.kind === 'item' ? menu : undefined;
  const menuTitle = dayMenu
    ? 'Действия с планом'
    : mealMenu
      ? mealMenu.title
      : (itemMenu?.item.entry.product.name ?? '');
  return (
    <>
      <ScreenStack detail={renderDetail()}>
        <ScreenContainer>
          <View style={styles.header}>
            <IconButton
              label="Назад к дневнику"
              icon="ChevronLeft"
              onPress={onClose}
            />
            <AppText
              variant="title"
              accessibilityRole="header"
              style={styles.heading}
            >
              План питания
            </AppText>
            <IconButton
              label="Действия с планом"
              icon="List"
              disabled={disabled}
              onPress={() => setMenu({ kind: 'day' })}
            />
          </View>
          <DateSelector
            date={selectedDate}
            today={today}
            onChange={selectDate}
            showCalendar
            hasPlan={(value) => !!planner.days[dateKey(value)]}
          />
          <DiaryStatus />
          <ActionNotice
            message={action.message}
            pending={session.pending}
            dismiss={action.clear}
          />
          {!session.loading && (
            <SceneTransition transitionKey={date} style={styles.body}>
              {previous && (
                <PlanSummary
                  day={day}
                  entries={session.state.entries}
                  target={target}
                />
              )}
              <PrimaryButton
                label="Автоподбор рациона"
                icon="Utensils"
                disabled={disabled || !target}
                onPress={() => generate({ start: date })}
              />
              {!target && (
                <AppText variant="caption" tone="muted">
                  Для автоподбора задайте цели калорий и БЖУ в калькуляторе
                  питания.
                </AppText>
              )}
              {!previous && (
                <EmptyState
                  title="День пока без плана"
                  description="Подберите рацион автоматически или добавьте первый приём пищи."
                  icon="BookOpen"
                />
              )}
              {day.meals.map((meal) => (
                <PlanMealCard
                  key={meal.id}
                  meal={meal}
                  entries={logged}
                  disabled={disabled}
                  onAdd={() => openDetail({ ...context, kind: 'pick', meal })}
                  onSettings={() => setMenu({ kind: 'meal', meal })}
                  onItem={(item) => setMenu({ kind: 'item', meal, item })}
                  onEaten={(item) =>
                    openDetail({ ...context, kind: 'eaten', meal, item })
                  }
                  onComplete={() => void action.run(() => mark(context, meal))}
                />
              ))}
              <PrimaryButton
                secondary
                icon="Plus"
                label="Добавить приём пищи"
                disabled={disabled}
                onPress={() => openDetail({ ...context, kind: 'meal' })}
              />
              <WeekSummary days={weekPlans} entries={session.state.entries} />
            </SceneTransition>
          )}
        </ScreenContainer>
      </ScreenStack>

      {menu && (
        <Dialog
          title={menuTitle || 'Действия'}
          presentation="sheet"
          onDismiss={() => setMenu(undefined)}
        >
          {dayMenu && (
            <>
              <PrimaryButton
                secondary
                label={
                  hasItems ? 'Перегенерировать день' : 'Сгенерировать день'
                }
                disabled={!target || disabled}
                onPress={() => generate({ start: date, count: 1 })}
              />
              <PrimaryButton
                secondary
                label={
                  weekPlans.length
                    ? 'Перегенерировать неделю'
                    : 'Сгенерировать неделю'
                }
                disabled={!target || disabled}
                onPress={() => generate({ start: dateKey(week[0]), count: 7 })}
              />
              <PrimaryButton
                secondary
                label="Шаблоны питания"
                disabled={disabled}
                onPress={() => openDetail({ kind: 'templates' })}
              />
              {previous && (
                <>
                  <PrimaryButton
                    secondary
                    label="Копировать или повторить"
                    disabled={!hasItems || disabled}
                    onPress={() => openDetail({ ...context, kind: 'copy' })}
                  />
                  <PrimaryButton
                    secondary
                    label="Сохранить день как шаблон"
                    disabled={!hasItems || disabled}
                    onPress={() =>
                      openDetail({ kind: 'save-template', meals: day.meals })
                    }
                  />
                  <PrimaryButton
                    secondary
                    label="Удалить план на день"
                    disabled={disabled}
                    onPress={() =>
                      ask({
                        title: 'Удалить план на день?',
                        text: 'Съеденные блюда останутся в дневнике.',
                        label: 'Удалить план',
                        run: async () => {
                          await session.change((state) =>
                            removePlanDay(state, day),
                          );
                          action.announce('План удалён.');
                        },
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          {mealMenu && (
            <>
              <PrimaryButton
                secondary
                label="Настроить приём пищи"
                disabled={disabled}
                onPress={() =>
                  openDetail({ ...context, kind: 'meal', meal: mealMenu })
                }
              />
              <PrimaryButton
                secondary
                label="Перегенерировать приём пищи"
                disabled={!target || disabled}
                onPress={() =>
                  generate({ start: date, count: 1, mealId: mealMenu.id })
                }
              />
              <PrimaryButton
                secondary
                label="Поднять выше"
                disabled={disabled || day.meals[0]?.id === mealMenu.id}
                onPress={() => moveMeal(mealMenu, -1)}
              />
              <PrimaryButton
                secondary
                label="Опустить ниже"
                disabled={disabled || day.meals.at(-1)?.id === mealMenu.id}
                onPress={() => moveMeal(mealMenu, 1)}
              />
              <PrimaryButton
                secondary
                label="Сохранить приём как шаблон"
                disabled={disabled || !mealMenu.items.length}
                onPress={() =>
                  openDetail({ kind: 'save-template', meals: [mealMenu] })
                }
              />
              <PrimaryButton
                secondary
                label="Удалить приём пищи"
                disabled={disabled}
                onPress={() =>
                  ask({
                    title: 'Удалить приём пищи?',
                    text: 'Съеденные блюда останутся в дневнике.',
                    label: 'Удалить приём пищи',
                    run: () =>
                      commitDay(
                        {
                          ...day,
                          meals: day.meals.filter(
                            (meal) => meal.id !== mealMenu.id,
                          ),
                        },
                        previous,
                        'Приём пищи удалён.',
                      ),
                  })
                }
              />
            </>
          )}
          {itemMenu &&
            (() => {
              const { meal, item } = itemMenu;
              const eaten = logged.get(item.entry.id);
              return (
                <>
                  <PrimaryButton
                    secondary
                    label="Изменить порцию"
                    disabled={disabled}
                    onPress={() =>
                      openDetail({ ...context, kind: 'portion', meal, item })
                    }
                  />
                  <PrimaryButton
                    secondary
                    label="Заменить блюдо или продукт"
                    disabled={disabled || !!eaten}
                    onPress={() =>
                      openDetail({ ...context, kind: 'pick', meal, item })
                    }
                  />
                  <PrimaryButton
                    secondary
                    label={
                      item.locked ? 'Снять фиксацию' : 'Зафиксировать блюдо'
                    }
                    disabled={disabled}
                    onPress={() => {
                      setMenu(undefined);
                      void action.run(() =>
                        updateItem(
                          context,
                          meal,
                          { ...item, locked: !item.locked },
                          item,
                        ),
                      );
                    }}
                  />
                  {eaten && (
                    <PrimaryButton
                      secondary
                      label="Отменить отметку «Съел»"
                      disabled={disabled}
                      onPress={() => {
                        setMenu(undefined);
                        void action.run(
                          () =>
                            session.change((state) =>
                              undoPlanItem(state, item.entry.id, eaten),
                            ),
                          'Отметка отменена.',
                        );
                      }}
                    />
                  )}
                  <PrimaryButton
                    secondary
                    label="Удалить из плана"
                    disabled={disabled}
                    onPress={() =>
                      ask({
                        title: 'Удалить блюдо из плана?',
                        text: eaten
                          ? 'Запись о съеденном блюде останется в дневнике.'
                          : item.entry.product.name,
                        label: 'Удалить блюдо',
                        run: () =>
                          commitMeal(
                            context,
                            {
                              ...meal,
                              items: meal.items.filter(
                                (row) => row.entry.id !== item.entry.id,
                              ),
                            },
                            'Блюдо удалено из плана.',
                          ),
                      })
                    }
                  />
                </>
              );
            })()}
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={confirmation?.title ?? 'Подтверждение'}
          dismissible={!session.pending}
          onDismiss={() => setConfirmation(undefined)}
        >
          <AppText>{confirmation?.text}</AppText>
          {!!confirmError && (
            <AppText tone="error" accessibilityRole="alert">
              {confirmError}
            </AppText>
          )}
          <PrimaryButton
            secondary
            label="Отмена"
            disabled={session.pending}
            onPress={() => setConfirmation(undefined)}
          />
          <PrimaryButton
            label={confirmation?.label ?? 'Подтвердить'}
            disabled={disabled}
            onPress={() => void confirm()}
          />
        </Dialog>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.compact },
  heading: { flex: 1, minWidth: 0 },
  body: { gap: spacing.large },
});
