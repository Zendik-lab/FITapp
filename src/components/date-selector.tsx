import { Touchable } from '@/components/touchable';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  addDays,
  formatDate,
  sameDay,
  weekDays,
} from '@/features/calendar/calendar';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { IconButton } from './buttons';
import { Card } from './card';
import { CalendarPicker } from './calendar-picker';

const fullDate = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
} as const;
const shortDate = { day: 'numeric', month: 'long', year: 'numeric' } as const;

export function DateSelector({
  date,
  today,
  onChange,
  daily = false,
  showCalendar = daily,
  hasPlan,
}: {
  date: Date;
  today: Date;
  onChange: (date: Date) => void;
  daily?: boolean;
  showCalendar?: boolean;
  hasPlan?(date: Date): boolean;
}) {
  const [calendar, setCalendar] = useState(false);
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  return (
    <Card style={styles.calendar}>
      <View style={styles.controls}>
        <IconButton
          label={daily ? 'Предыдущий день' : 'Предыдущая неделя'}
          icon="ChevronLeft"
          onPress={() => onChange(addDays(date, daily ? -1 : -7))}
          compact
        />
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={formatDate(date, shortDate)}
          accessibilityHint={
            showCalendar
              ? 'Открывает календарь.'
              : 'Возвращает к сегодняшней дате.'
          }
          onPress={() => (showCalendar ? setCalendar(true) : onChange(today))}
          style={({ pressed }) => [
            styles.current,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <AppText variant="action" style={styles.center}>
            {formatDate(date, shortDate)}
          </AppText>
        </Touchable>
        <IconButton
          label={daily ? 'Следующий день' : 'Следующая неделя'}
          icon="ChevronRight"
          onPress={() => onChange(addDays(date, daily ? 1 : 7))}
          compact
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.week, width >= 350 && styles.weekInset]}
      >
        {weekDays(date).map((day) => {
          const selected = sameDay(day, date);
          const currentDay = sameDay(day, today);
          const planned = hasPlan?.(day);
          return (
            <Touchable
              key={day.getTime()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${formatDate(day, fullDate)}${currentDay ? ', сегодня' : ''}${planned ? ', есть план питания' : ''}`}
              onPress={() => onChange(day)}
              style={({ pressed }) => [
                styles.day,
                {
                  backgroundColor: selected
                    ? colors.accent
                    : pressed
                      ? colors.accentSurface
                      : colors.surface,
                },
              ]}
            >
              <AppText
                variant="caption"
                tone={selected ? 'onAccent' : 'muted'}
                maxFontSizeMultiplier={1.5}
              >
                {formatDate(day, { weekday: 'short' })}
              </AppText>
              <AppText
                variant="action"
                tone={selected ? 'onAccent' : 'text'}
                maxFontSizeMultiplier={1.5}
              >
                {day.getDate()}
              </AppText>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: (hasPlan ? planned : currentDay)
                      ? selected
                        ? colors.onAccent
                        : colors.accentText
                      : 'transparent',
                  },
                ]}
              />
            </Touchable>
          );
        })}
      </ScrollView>
      {showCalendar && (
        <CalendarPicker
          open={calendar}
          date={date}
          today={today}
          onChange={onChange}
          onDismiss={() => setCalendar(false)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  calendar: { padding: 0, paddingBottom: spacing.small, gap: 0 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.tight,
  },
  current: { flex: 1, minHeight: touchSize, justifyContent: 'center' },
  center: { textAlign: 'center' },
  week: { flexGrow: 1 },
  weekInset: { paddingHorizontal: spacing.tight },
  day: {
    flex: 1,
    minWidth: touchSize,
    minHeight: 59,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.tight,
    borderRadius: radii.action,
  },
  dot: { marginTop: spacing.tight, width: 4, height: 4, borderRadius: 2 },
});
