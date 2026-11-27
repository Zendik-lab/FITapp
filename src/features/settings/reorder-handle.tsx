import { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/app-text';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';
import { motion, useReducedMotion } from '@/theme/motion';

const touchOnly = { touchAction: 'none' } as ViewStyle;

export function ReorderHandle({
  disabled,
  onMove,
}: {
  disabled: boolean;
  onMove(direction: -1 | 1): void;
}) {
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const start = useRef<number>(null);
  const [offset] = useState(() => new Animated.Value(0));

  function reset() {
    start.current = null;
    if (reduced) offset.setValue(0);
    else
      Animated.spring(offset, {
        ...motion.spring,
        toValue: 0,
        useNativeDriver: motion.useNativeDriver,
      }).start();
  }
  return (
    <View
      accessible={false}
      style={[styles.target, Platform.OS === 'web' && touchOnly]}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={({ nativeEvent }) => {
        offset.stopAnimation();
        start.current = nativeEvent.pageY;
      }}
      onResponderMove={({ nativeEvent }) => {
        if (!reduced && start.current !== null) {
          offset.setValue(
            Math.max(-30, Math.min(30, nativeEvent.pageY - start.current)),
          );
        }
      }}
      onResponderRelease={({ nativeEvent }) => {
        const distance =
          start.current === null ? 0 : nativeEvent.pageY - start.current;
        reset();
        if (!disabled && Math.abs(distance) > 40) onMove(distance > 0 ? 1 : -1);
      }}
      onResponderTerminate={reset}
      onResponderTerminationRequest={() => true}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.grip,
          {
            backgroundColor: colors.background,
            transform: [{ translateY: offset }],
          },
        ]}
      >
        <AppIcon name="List" size={16} />
        <AppText variant="caption" tone="muted">
          Перетащить
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  target: {
    alignSelf: 'flex-start',
    minHeight: touchSize,
    justifyContent: 'center',
  },
  grip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.compact,
    borderRadius: radii.action,
  },
});
