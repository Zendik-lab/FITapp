import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AppText } from '@/components/app-text';
import { ScreenSafeArea } from '@/components/screen-safe-area';
import { spacing, useAppTheme } from '@/theme';
import { motion, useReducedMotion } from '@/theme/motion';

const perimeter = 2 * Math.PI * 38;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function LaunchBrand({ loaded }: { loaded: boolean }) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [entry] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [drawing] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [exit] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduced) {
      entry.setValue(1);
      drawing.setValue(1);
      return;
    }
    const reveal = Animated.parallel([
      Animated.timing(entry, {
        toValue: 1,
        duration: motion.launch,
        easing: motion.easing,
        useNativeDriver: motion.useNativeDriver,
        isInteraction: false,
      }),
      Animated.timing(drawing, {
        toValue: 1,
        duration: motion.launch,
        easing: motion.easing,
        useNativeDriver: false,
        isInteraction: false,
      }),
    ]);
    reveal.start();
    return () => reveal.stop();
  }, [drawing, entry, reduced]);

  useEffect(() => {
    if (!loaded) return;
    if (reduced) {
      exit.setValue(0);
      return;
    }
    const fade = Animated.timing(exit, {
      toValue: 0,
      duration: motion.exit,
      useNativeDriver: motion.useNativeDriver,
      isInteraction: false,
    });
    fade.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => fade.stop();
  }, [exit, loaded, reduced]);

  if (!visible || (loaded && reduced)) return null;
  return (
    <Animated.View
      pointerEvents={loaded ? 'none' : 'auto'}
      accessibilityElementsHidden={loaded}
      importantForAccessibility={loaded ? 'no-hide-descendants' : 'auto'}
      aria-hidden={loaded || undefined}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.background, opacity: exit },
      ]}
    >
      <ScreenSafeArea bottomInset>
        <ScrollView
          contentContainerStyle={styles.surface}
          contentInsetAdjustmentBehavior="never"
          pointerEvents={loaded ? 'none' : 'auto'}
        >
          <Animated.View
            style={{
              opacity: entry.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0.4, 1, 1],
              }),
              transform: [
                {
                  scale: entry.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            }}
          >
            <Svg
              width={100}
              height={100}
              viewBox="0 0 100 100"
              aria-hidden
              accessible={false}
            >
              <Circle
                r={38}
                cx={50}
                cy={50}
                fill="none"
                strokeWidth={6}
                stroke={colors.border}
              />
              <AnimatedCircle
                r={38}
                cx={50}
                cy={50}
                fill="none"
                strokeWidth={6}
                stroke={colors.accent}
                strokeLinecap="round"
                strokeDasharray={perimeter}
                strokeDashoffset={drawing.interpolate({
                  inputRange: [0, 1],
                  outputRange: [perimeter, perimeter * 0.105],
                })}
                transform="rotate(-90 50 50)"
              />
              <Path
                d="M36 57 L46 47 L53 53 L65 41"
                stroke={colors.accent}
                strokeWidth={6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
          <Animated.View
            style={[
              styles.caption,
              {
                opacity: entry.interpolate({
                  inputRange: [0, 0.22, 0.75, 1],
                  outputRange: [0.5, 0.55, 1, 1],
                }),
              },
            ]}
          >
            <AppText variant="title">FITapp</AppText>
            <AppText tone="muted">Питание в своём ритме</AppText>
          </Animated.View>
          {!loaded && (
            <AppText
              variant="caption"
              tone="muted"
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              style={styles.centered}
            >
              Загрузка приложения…
            </AppText>
          )}
        </ScrollView>
      </ScreenSafeArea>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
  },
  caption: { alignItems: 'center' },
  centered: { textAlign: 'center' },
});
