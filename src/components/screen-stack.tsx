import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { motion, useMotionDistance, useReducedMotion } from '@/theme/motion';

export function ScreenStack({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const { colors } = useAppTheme();
  const covered = Boolean(detail);
  return (
    <View style={[styles.stack, { backgroundColor: colors.background }]}>
      <View
        style={[StyleSheet.absoluteFill, covered && styles.covered]}
        pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        aria-hidden={covered || undefined}
        {...(Platform.OS === 'web' ? { inert: covered } : undefined)}
      >
        {children}
      </View>
      {covered && <View style={styles.stack}>{detail}</View>}
    </View>
  );
}

export function SceneTransition({
  children,
  transitionKey,
  style,
}: {
  children: ReactNode;
  transitionKey?: string | number;
  style?: React.ComponentProps<typeof Animated.View>['style'];
}) {
  const reduced = useReducedMotion();
  const distance = useMotionDistance();
  const [progress] = useState(() => new Animated.Value(1));
  useLayoutEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      useNativeDriver: motion.useNativeDriver,
      toValue: 1,
      duration: motion.navigation,
      easing: motion.easing,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced, transitionKey]);
  return (
    <Animated.View
      testID="form-content"
      style={[
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.85, 1],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  covered: { opacity: 0 },
});
