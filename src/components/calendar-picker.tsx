import { Touchable } from '@/components/touchable';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { IconButton, PrimaryButton } from './buttons';
import { Dialog } from './dialog';
import { formatDate, sameDay } from '@/features/calendar/calendar';
import { spacing, touchSize, radii, useAppTheme } from '@/theme';

export function CalendarPicker({
  open,
  date,
  today,
  onChange,
  onDismiss,
}: {
  open: boolean;
  date: Date;
  today: Date;
  onChange(date: Date): void;
  onDismiss(): void;
}) {
  const [month, setMonth] = useState(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
  );
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  const { colors } = useAppTheme();
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  function change(value: Date) {
    onChange(value);
    onDismiss();
  }
  return (
    <Dialog
      open={open}
      presentation="sheet"
      title="Выберите дату"
      onDismiss={onDismiss}
    >
      <View style={styles.row}>
        <IconButton
          compact
          icon="ChevronLeft"
          label="Предыдущий месяц"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        />
        <AppText variant="action" style={styles.month}>
          {formatDate(month, { month: 'long', year: 'numeric' })}
        </AppText>
        <IconButton
          compact
          icon="ChevronRight"
          label="Следующий месяц"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        />
      </View>
      <View style={styles.grid}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <AppText
            key={d}
            tone="muted"
            variant="caption"
            style={styles.heading}
          >
            {d}
          </AppText>
        ))}
        {Array.from({ length: offset + count }, (_, i) => {
          const value = new Date(
            month.getFullYear(),
            month.getMonth(),
            i - offset + 1,
          );
          const selected = sameDay(value, date);
          return i < offset ? (
            <View key={i} style={styles.cell} />
          ) : (
            <Touchable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={formatDate(value, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              onPress={() => change(value)}
              style={({ pressed }) => [
                styles.cell,
                {
                  backgroundColor: selected
                    ? colors.accent
                    : pressed
                      ? colors.accentSurface
                      : colors.surface,
                },
              ]}
            >
              <AppText tone={selected ? 'onAccent' : 'text'}>
                {value.getDate()}
              </AppText>
            </Touchable>
          );
        })}
      </View>
      <PrimaryButton
        secondary
        label="Выбрать сегодня"
        onPress={() => change(today)}
      />
      <PrimaryButton secondary label="Закрыть календарь" onPress={onDismiss} />
    </Dialog>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.tight },
  month: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  heading: { width: '14.2857%', textAlign: 'center' },
  cell: {
    width: '14.2857%',
    minHeight: touchSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.action,
  },
});
