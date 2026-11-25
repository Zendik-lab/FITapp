import {
  Pressable,
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
}: {
  date: Date;
  today: Date;
  onChange: (date: Date) => void;
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  return (
    <Card style={styles.calendar}>
      <View style={styles.controls}>
        <IconButton
          label="Предыдущая неделя"
          icon="ChevronLeft"
          onPress={() => onChange(addDays(date, -7))}
          compact
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={formatDate(date, shortDate)}
          accessibilityHint="Возвращает к сегодняшней дате."
          onPress={() => onChange(today)}
          style={({ pressed }) => [
            styles.current,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <AppText variant="action" style={styles.center}>
            {formatDate(date, shortDate)}
          </AppText>
        </Pressable>
        <IconButton
          label="Следующая неделя"
          icon="ChevronRight"
          onPress={() => onChange(addDays(date, 7))}
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
          return (
            <Pressable
              key={day.getTime()}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${formatDate(day, fullDate)}${currentDay ? ', сегодня' : ''}`}
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
                    backgroundColor: currentDay
                      ? selected
                        ? colors.onAccent
                        : colors.accentText
                      : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
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
