import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';

import { useAppTheme } from '@/theme';

export function AppTabBar(props: BottomTabBarProps) {
  const { colors } = useAppTheme();
  return (
    <div className="app-tab-bar" style={{ backgroundColor: colors.surface }}>
      <BottomTabBar
        {...props}
        insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
      />
    </div>
  );
}
