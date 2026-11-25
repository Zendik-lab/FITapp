const locale = 'ru-KZ';

export function localDay(date: Date) {
  return addDays(date, 0);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekDays(date: Date) {
  const monday = addDays(date, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, day) => addDays(monday, day));
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatNumber(value: number) {
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}
