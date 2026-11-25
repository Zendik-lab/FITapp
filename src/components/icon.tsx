import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { useAppTheme } from '@/theme';

const webSymbols: Partial<Record<SFSymbol, AndroidSymbol>> = {
  'barcode.viewfinder': 'barcode_scanner',
  bell: 'notifications',
  'book.closed': 'menu_book',
  carrot: 'nutrition',
  'chart.xyaxis.line': 'show_chart',
  checkmark: 'check',
  'checkmark.circle': 'check_circle',
  'chevron.left': 'chevron_left',
  'chevron.right': 'chevron_right',
  'circle.lefthalf.filled': 'contrast',
  'clock.arrow.circlepath': 'history',
  drop: 'water_drop',
  dumbbell: 'fitness_center',
  externaldrive: 'hard_drive',
  'figure.stand': 'accessibility_new',
  'fork.knife': 'restaurant',
  heart: 'favorite',
  house: 'home',
  'info.circle': 'info',
  'list.bullet.rectangle': 'list_alt',
  magnifyingglass: 'search',
  'moon.stars': 'bedtime',
  person: 'person',
  'person.crop.circle': 'account_circle',
  'photo.on.rectangle': 'photo_library',
  'play.fill': 'play_arrow',
  plus: 'add',
  ruler: 'straighten',
  scalemass: 'scale',
  scope: 'track_changes',
  'sun.max': 'light_mode',
  sunrise: 'wb_twilight',
};

export function Icon({
  name,
  color,
  size = 20,
}: {
  name: SFSymbol;
  color?: string;
  size?: number;
}) {
  const { colors } = useAppTheme();
  return (
    <SymbolView
      name={{ ios: name, web: webSymbols[name] }}
      tintColor={color ?? colors.accentText}
      size={size}
      weight="medium"
    />
  );
}
