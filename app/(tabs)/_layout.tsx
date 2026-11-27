import { Tabs } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { ComingSoonProvider } from '@/components/coming-soon';
import { AppTabBar } from '@/components/app-tab-bar';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { sectionTitles } from '@/constants/sections';
import { SelectedDateProvider } from '@/features/calendar/selected-date';
import { PwaProvider } from '@/features/pwa/pwa-status';
import { useHapticFeedback } from '@/features/settings/feedback';
import { StartupGate } from '@/features/startup/startup-gate';
import { ProfileProvider } from '@/features/profile/profile-provider';
import { OnboardingGate } from '@/features/profile/onboarding-screen';
import { NutritionProvider } from '@/features/nutrition/nutrition-provider';
import { FoodProvider } from '@/features/food/food-provider';
import {
  contentWidth,
  radii,
  touchSize,
  typography,
  useAppTheme,
} from '@/theme';
import { motion, useReducedMotion } from '@/theme/motion';
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
                  <NutritionProvider>
                    <FoodProvider>
                      <AppTabs />
                    </FoodProvider>
                  </NutritionProvider>
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
  const feedback = useHapticFeedback();
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const web = Platform.OS === 'web';

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: reduced ? 'none' : 'fade',
        transitionSpec: reduced
          ? undefined
          : {
              animation: 'timing',
              config: { duration: motion.tab, easing: motion.easing },
            },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: web
          ? [typography.tab, styles.webLabel]
          : typography.tab,
        tabBarAllowFontScaling: false,
        tabBarHideOnKeyboard: !web,
        tabBarStyle: web ? styles.webBar : undefined,
        tabBarItemStyle: styles.tab,
      }}
      screenListeners={({ navigation }) => ({
        tabPress: (event) => {
          if (!event.defaultPrevented && !navigation.isFocused()) {
            feedback('selection');
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
              <TabIcon focused={focused} name={tabIcons[name]} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

function TabIcon({ focused, name }: { focused: boolean; name: AppIconName }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [selection] = useState(() => new Animated.Value(focused ? 1 : 0));
  const previous = useRef(focused);
  useLayoutEffect(() => {
    const changed = previous.current !== focused;
    previous.current = focused;
    if (reduced) {
      selection.setValue(focused ? 1 : 0);
      return;
    }
    if (!changed) return;
    const animation = Animated.spring(selection, {
      ...motion.spring,
      useNativeDriver: motion.useNativeDriver,
      isInteraction: false,
      toValue: focused ? 1 : 0,
    });
    animation.start();
    return () => animation.stop();
  }, [focused, reduced, selection]);
  return (
    <View style={styles.icon}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.pill,
          {
            backgroundColor: colors.accentSurface,
            opacity: selection,
            transform: [
              {
                scale: selection.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.86, 1],
                }),
              },
            ],
          },
        ]}
      />
      <View style={styles.glyph}>
        <AppIcon
          name={name}
          color={focused ? colors.accentText : colors.muted}
          size={19}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webBar: {
    width: '100%',
    maxWidth: contentWidth,
    alignSelf: 'center',
    height: 56,
  },
  webLabel: { lineHeight: 14 },
  tab: { minHeight: touchSize },
  icon: {
    width: 43,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { borderRadius: radii.action },
  glyph: { zIndex: 1 },
});
