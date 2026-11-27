import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { SectionHeader } from '@/components/headers';
import { ProgressRing } from '@/components/progress-indicators';
import { SceneTransition } from '@/components/screen-stack';
import { Touchable } from '@/components/touchable';
import { formatDate, formatNumber } from '@/features/calendar/calendar';
import { dateKey, parseDateKey } from '@/features/food/domain';
import type { FoodSession } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import { NutritionValues } from '@/features/food/nutrition-values';
import { useNutrition } from '@/features/nutrition/nutrition-context';
import { useProfile } from '@/features/profile/profile-context';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';
import {
  achievements,
  activityReport,
  coachNotes,
  historicalMilestones,
} from './activity';
import { useLocalAction } from './use-local-action';
import { canShareWrapped, shareWrapped, wrappedText } from './wrapped-share';

export const insights = [
  { mode: 'coach', title: 'Mass Coach' },
  { mode: 'streak', title: 'Серии и календарь' },
  { mode: 'awards', title: 'Достижения' },
  { mode: 'week', title: 'Недельный отчёт' },
  { mode: 'wrapped', title: 'FIT Wrapped' },
] as const;
export type InsightMode = (typeof insights)[number]['mode'];

type Days = ReturnType<typeof activityReport>['days'];
function ActivityChart({ days }: { days: Days }) {
  const [selected, setSelected] = useState<string>();
  const { colors } = useAppTheme();
  const largest = Math.max(1, ...days.map((day) => day.totals?.calories ?? 0));
  const active = days.find((day) => day.date === selected) ?? days.at(-1);
  return (
    <>
      <View style={styles.calendar}>
        {days.map(({ date, totals }) => {
          const day = parseDateKey(date);
          const enabled = active?.date === date;
          return (
            <Touchable
              key={date}
              onPress={() => setSelected(date)}
              accessibilityRole="button"
              accessibilityLabel={`${formatDate(day, { day: 'numeric', month: 'long' })}, ${totals ? `${formatNumber(totals.calories)} ккал` : 'нет записей'}`}
              accessibilityState={{ selected: enabled }}
              style={[
                styles.day,
                {
                  backgroundColor: enabled
                    ? colors.accentSurface
                    : colors.background,
                },
              ]}
            >
              <View style={[styles.axis, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${((totals?.calories ?? 0) / largest) * 100}%`,
                      backgroundColor: colors.accent,
                    },
                  ]}
                />
              </View>
              <AppText
                variant="caption"
                tone={enabled ? 'accentText' : 'muted'}
              >
                {day.getDate()}
              </AppText>
            </Touchable>
          );
        })}
      </View>
      {active && (
        <Card>
          <AppText variant="action" accessibilityLiveRegion="polite">
            {formatDate(parseDateKey(active.date), {
              day: 'numeric',
              month: 'long',
            })}
          </AppText>
          {active.totals ? (
            <NutritionValues values={active.totals} />
          ) : (
            <AppText tone="muted">Записей нет.</AppText>
          )}
        </Card>
      )}
    </>
  );
}

export function ProgressInsights({
  session,
  mode,
  today,
  onBack,
}: {
  session: FoodSession;
  mode: InsightMode;
  today: Date;
  onBack(): void;
}) {
  const nutrition = useNutrition();
  const profile = useProfile()?.state.profile;
  const target = nutrition?.issues.length
    ? undefined
    : nutrition?.snapshot?.targets;
  const date = dateKey(today);
  const { state } = session;
  const week = useMemo(
    () => activityReport(state.entries, date, 7, target),
    [state.entries, date, target],
  );
  const month = useMemo(
    () => activityReport(state.entries, date, today.getDate(), target),
    [state.entries, date, today, target],
  );
  const earned = historicalMilestones(state, date);
  const [step, setStep] = useState(0);
  const [sharing, setSharing] = useState(false);
  const action = useLocalAction();
  const { colors } = useAppTheme();
  const period = formatDate(today, { month: 'long', year: 'numeric' });
  const summary = { period, days: month.activeDays, meals: month.mealCount };

  const popular = (rows: typeof week.popular) =>
    [false, true].map((recipe) => {
      const list = rows.filter((row) => row.recipe === recipe).slice(0, 3);
      return (
        <Card key={String(recipe)}>
          <SectionHeader title={recipe ? 'Частые блюда' : 'Частые продукты'} />
          {list.length ? (
            list.map((item) => (
              <AppText key={item.name}>
                {item.name} · {item.count}
              </AppText>
            ))
          ) : (
            <AppText tone="muted">Записей за период пока нет.</AppText>
          )}
        </Card>
      );
    });
  const notes = coachNotes(state.entries, date, target);
  const motionCards = [
    {
      title: 'Месяц в дневнике',
      content: (
        <AppText>
          {month.activeDays} дней с записями · {month.mealCount} приёмов пищи
        </AppText>
      ),
    },
    {
      title: 'Среднее КБЖУ',
      content: month.average ? (
        <NutritionValues animate values={month.average} />
      ) : (
        <AppText tone="muted">За этот месяц записей нет.</AppText>
      ),
    },
    {
      title: 'Продукты и блюда месяца',
      content: <>{popular(month.popular)}</>,
    },
    {
      title: 'Активность',
      content: (
        <>
          <ActivityChart days={month.days} />
          <AppText>Текущая серия · {month.current} дн.</AppText>
          <AppText>
            Достижения месяца ·{' '}
            {
              Object.entries(earned).filter(
                ([id, day]) =>
                  id !== 'lastGoalDay' && day.slice(0, 7) === date.slice(0, 7),
              ).length
            }
          </AppText>
        </>
      ),
    },
    {
      title: 'Итог месяца',
      content: (
        <>
          <AppText>{wrappedText(summary)}</AppText>
          {canShareWrapped() && (
            <PrimaryButton
              secondary
              label="Поделиться итогом"
              onPress={() => setSharing(true)}
            />
          )}
        </>
      ),
    },
  ];
  const current = motionCards[step];
  return (
    <FoodForm
      title={insights.find((item) => item.mode === mode)?.title ?? 'Прогресс'}
      onBack={onBack}
      pending={session.pending}
      readOnly={mode !== 'week'}
    >
      <ActionNotice message={action.message} dismiss={action.clear} />
      {mode === 'coach' && (
        <>
          <Card>
            <SectionHeader title="Питание за последние 7 дней" />
            {notes.map((note) => (
              <AppText key={note}>{note}</AppText>
            ))}
            {week.average && (
              <NutritionValues
                caption="В среднем за дни с записями"
                values={week.average}
              />
            )}
          </Card>
          <Card>
            <SectionHeader title="Динамика веса" />
            <AppText tone="muted">
              Для оценки динамики нужны измерения за несколько дат.
            </AppText>
            {profile && (
              <AppText>
                Вес из профиля · {formatNumber(profile.body.currentWeightKg)} кг
              </AppText>
            )}
          </Card>
        </>
      )}
      {mode === 'streak' && (
        <>
          <Card>
            <AppText variant="metric">{week.current} дн.</AppText>
            <AppText>Текущая серия · самая длинная {week.longest} дн.</AppText>
            <AppText tone="muted">
              За последние 7 дней есть записи за {week.activeDays} дн.
            </AppText>
          </Card>
          <SectionHeader title={period} />
          <ActivityChart days={month.days} />
        </>
      )}
      {mode === 'awards' &&
        achievements.map(({ id, title, target }) => {
          const progress = earned[id]
            ? target
            : id.startsWith('streak')
              ? Math.min(target, week.longest)
              : 0;
          return (
            <Card key={id}>
              <View style={styles.award}>
                <View style={styles.awardText}>
                  <AppText variant="action">{title}</AppText>
                  <AppText tone={earned[id] ? 'accentText' : 'muted'}>
                    {earned[id] ?? `${progress} / ${target}`}
                  </AppText>
                </View>
                <ProgressRing
                  size={70}
                  value={progress}
                  goal={target}
                  label="Прогресс достижения"
                />
              </View>
            </Card>
          );
        })}
      {mode === 'week' && (
        <>
          <Card>
            <AppText variant="section">
              {week.activeDays} из 7 дней с записями
            </AppText>
            {week.average ? (
              <NutritionValues
                caption="Среднее за дни с записями"
                values={week.average}
              />
            ) : (
              <AppText tone="muted">
                Для отчёта добавьте записи питания.
              </AppText>
            )}
            {week.hits !== null && (
              <AppText>
                Дней в пределах 10% текущих целей КБЖУ · {week.hits}
              </AppText>
            )}
            <AppText tone="muted">
              Для динамики веса пока недостаточно измерений.
            </AppText>
          </Card>
          <ActivityChart days={week.days} />
          {popular(week.popular)}
          <Card>
            <SectionHeader title="Тенденции" />
            {notes.map((note) => (
              <AppText key={note}>{note}</AppText>
            ))}
          </Card>
          {!earned.firstWeek && week.activeDays > 0 && (
            <PrimaryButton
              label="Завершить просмотр отчёта"
              disabled={session.pending || !!session.failure}
              onPress={() =>
                void action.run(
                  () =>
                    session.change((current) => ({
                      ...current,
                      milestones: {
                        ...current.milestones,
                        firstWeek: current.milestones?.firstWeek ?? date,
                      },
                    })),
                  'Недельный отчёт просмотрен.',
                )
              }
            />
          )}
        </>
      )}
      {mode === 'wrapped' && (
        <>
          <AppText tone="muted">
            {period} · {step + 1} / {motionCards.length}
          </AppText>
          <SceneTransition transitionKey={step}>
            <Card>
              <SectionHeader title={current.title} />
              {current.content}
            </Card>
          </SceneTransition>
          {step + 1 < motionCards.length && (
            <PrimaryButton
              label="Следующая карточка"
              onPress={() => setStep(step + 1)}
            />
          )}
          {step > 0 && (
            <PrimaryButton
              secondary
              label="Предыдущая карточка"
              onPress={() => setStep(step - 1)}
            />
          )}
        </>
      )}
      <Dialog
        open={sharing}
        title="Поделиться итогом?"
        onDismiss={() => setSharing(false)}
      >
        <AppText>
          Будут переданы месяц, число дней и приёмов пищи. Имя, вес, калории и
          список блюд останутся в приложении.
        </AppText>
        <PrimaryButton
          secondary
          label="Отмена"
          onPress={() => setSharing(false)}
        />
        <PrimaryButton
          label="Подтвердить отправку"
          onPress={() => {
            setSharing(false);
            void action.run(() => shareWrapped(summary, colors));
          }}
        />
      </Dialog>
    </FoodForm>
  );
}

const styles = StyleSheet.create({
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.tight },
  day: {
    minWidth: touchSize,
    minHeight: touchSize,
    borderRadius: radii.action,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
  },
  axis: {
    height: 27,
    width: 6,
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: { width: 6, borderRadius: 3 },
  award: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  awardText: { flex: 1, gap: spacing.tight },
});
