import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { ComingSoonProvider } from '@/components/coming-soon';
import { AppTabBar } from '@/components/app-tab-bar';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { sectionTitles } from '@/constants/sections';
import { SelectedDateProvider } from '@/features/calendar/selected-date';
import { PwaProvider } from '@/features/pwa/pwa-status';
import { tabFeedback } from '@/features/pwa/tab-feedback';
import { StartupGate } from '@/features/startup/startup-gate';
import { ProfileProvider } from '@/features/profile/profile-provider';
import { OnboardingGate } from '@/features/profile/onboarding-screen';
import { radii, touchSize, typography, useAppTheme } from '@/theme';
import { NavigationAppearance } from '@/theme/navigation-appearance';

const tabIcons = {
  index: 'House',
  nutrition: 'Utensils',
  workouts: 'Dumbbell',
  progress: 'ChartNoAxesCombined',
  profile: 'UserRound',
} satisfies Record<keyof typeof sectionTitles, AppIconName>;

export default function TabLayout() {
  return (
    <StartupGate>
      <NavigationAppearance>
        <SelectedDateProvider>
          <ComingSoonProvider>
            <PwaProvider>
              <ProfileProvider>
                <OnboardingGate>
                  <AppTabs />
                </OnboardingGate>
              </ProfileProvider>
            </PwaProvider>
          </ComingSoonProvider>
        </SelectedDateProvider>
      </NavigationAppearance>
    </StartupGate>
  );
}

function AppTabs() {
  const { colors } = useAppTheme();
  const web = Platform.OS === 'web';

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: web
          ? [typography.tab, styles.webLabel]
          : typography.tab,
        tabBarAllowFontScaling: false,
        tabBarStyle: web ? styles.webBar : undefined,
        tabBarItemStyle: styles.tab,
      }}
      screenListeners={({ navigation }) => ({
        tabPress: (event) => {
          if (!event.defaultPrevented && !navigation.isFocused()) {
            tabFeedback();
          }
        },
      })}
    >
      {(Object.keys(tabIcons) as (keyof typeof tabIcons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: sectionTitles[name],
            tabBarAccessibilityLabel: sectionTitles[name],
            tabBarIcon: ({ focused }) => (
              <View
                style={[
                  styles.icon,
                  focused && { backgroundColor: colors.accent },
                ]}
              >
                <AppIcon
                  name={tabIcons[name]}
                  color={focused ? colors.onAccent : colors.muted}
                  size={19}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webBar: { width: '100%', maxWidth: 640, alignSelf: 'center', height: 56 },
  webLabel: { lineHeight: 14 },
  tab: { minHeight: touchSize },
  icon: {
    width: 34,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.action,
  },
});
