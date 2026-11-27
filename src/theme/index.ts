import { use } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

import { AppSettingsContext } from '@/features/settings/app-settings-context';

const light = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  secondaryText: '#8E8E93',
  accent: '#34C759',
  border: '#E5E5EA',
  controlBorder: '#85858F',
  muted: '#59595F',
  accentText: '#13642C',
  accentSurface: '#E4F6EA',
  onAccent: '#121C14',
  protein: '#288347',
  fat: '#B66A20',
  carbs: '#4B68B3',
  water: '#207EA9',
  error: '#A6262C',
};

const dark: typeof light = {
  background: '#000000',
  surface: '#1C1C1E',
  text: '#FFFFFF',
  secondaryText: '#98989D',
  accent: '#30D158',
  border: '#38383A',
  controlBorder: '#797980',
  muted: '#A7A7AF',
  accentText: '#66DF83',
  accentSurface: '#183524',
  onAccent: '#121C14',
  protein: '#64D387',
  fat: '#F2AB63',
  carbs: '#8FA9F4',
  water: '#69C5EF',
  error: '#FF9699',
};

const accents = {
  blue: [
    { accent: '#74B5FF', accentText: '#1255A2', accentSurface: '#E8F2FF' },
    { accent: '#79B9FF', accentText: '#A1CEFF', accentSurface: '#172E49' },
  ],
  violet: [
    { accent: '#C4A5FF', accentText: '#653F9B', accentSurface: '#F2EAFF' },
    { accent: '#C6ABFF', accentText: '#D8C1FF', accentSurface: '#34264B' },
  ],
  orange: [
    { accent: '#FFB975', accentText: '#813D06', accentSurface: '#FFF0E1' },
    { accent: '#FFC187', accentText: '#FFC58E', accentSurface: '#412B1B' },
  ],
} as const;

const palettes = {
  green: [light, dark],
  blue: [
    { ...light, ...accents.blue[0] },
    { ...dark, ...accents.blue[1] },
  ],
  violet: [
    { ...light, ...accents.violet[0] },
    { ...dark, ...accents.violet[1] },
  ],
  orange: [
    { ...light, ...accents.orange[0] },
    { ...dark, ...accents.orange[1] },
  ],
};

export const typography = {
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  section: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  metric: {
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.3,
    fontVariant: ['tabular-nums'],
  },
  stat: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  body: { fontSize: 16, lineHeight: 22 },
  action: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 17 },
  tab: { fontSize: 10, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export const spacing = {
  tight: 4,
  small: 8,
  compact: 12,
  medium: 16,
  large: 24,
  section: 28,
};
export const radii = { action: 16, card: 20, hero: 24 };
export const touchSize = 44;
export const contentWidth = 640;
export const dialogWidth = 400;

export function useAppTheme() {
  const settings = use(AppSettingsContext)?.settings;
  const mode = settings?.themeMode ?? 'system';
  const system = useColorScheme();
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const accent = settings?.personalization?.accent ?? 'green';
  return { isDark, colors: palettes[accent][isDark ? 1 : 0] };
}
