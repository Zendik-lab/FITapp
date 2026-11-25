import Accessibility from 'lucide-react-native/icons/accessibility';
import Barcode from 'lucide-react-native/icons/barcode';
import Bell from 'lucide-react-native/icons/bell';
import BookOpen from 'lucide-react-native/icons/book-open';
import Carrot from 'lucide-react-native/icons/carrot';
import ChartNoAxesCombined from 'lucide-react-native/icons/chart-no-axes-combined';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import Contrast from 'lucide-react-native/icons/contrast';
import Droplet from 'lucide-react-native/icons/droplet';
import Dumbbell from 'lucide-react-native/icons/dumbbell';
import HardDrive from 'lucide-react-native/icons/hard-drive';
import Heart from 'lucide-react-native/icons/heart';
import History from 'lucide-react-native/icons/history';
import House from 'lucide-react-native/icons/house';
import Images from 'lucide-react-native/icons/images';
import Info from 'lucide-react-native/icons/info';
import List from 'lucide-react-native/icons/list';
import MoonStar from 'lucide-react-native/icons/moon-star';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import Ruler from 'lucide-react-native/icons/ruler';
import Scale from 'lucide-react-native/icons/scale';
import Search from 'lucide-react-native/icons/search';
import Sun from 'lucide-react-native/icons/sun';
import Sunrise from 'lucide-react-native/icons/sunrise';
import Target from 'lucide-react-native/icons/target';
import UserRound from 'lucide-react-native/icons/user-round';
import Utensils from 'lucide-react-native/icons/utensils';

import { useAppTheme } from '@/theme';

const icons = {
  Accessibility,
  Barcode,
  Bell,
  BookOpen,
  Carrot,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleUserRound,
  Contrast,
  Droplet,
  Dumbbell,
  HardDrive,
  Heart,
  History,
  House,
  Images,
  Info,
  List,
  MoonStar,
  Play,
  Plus,
  Ruler,
  Scale,
  Search,
  Sun,
  Sunrise,
  Target,
  UserRound,
  Utensils,
};

export type AppIconName = keyof typeof icons;

export function AppIcon({
  name,
  color,
  size = 20,
}: {
  name: AppIconName;
  color?: string;
  size?: number;
}) {
  const { colors } = useAppTheme();
  const SvgIcon = icons[name];

  return (
    <SvgIcon
      size={size}
      color={color ?? colors.accentText}
      strokeWidth={2}
      accessible={false}
      aria-hidden
      focusable={false}
    />
  );
}
