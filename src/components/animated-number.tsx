import { useLayoutEffect, useRef, useState } from 'react';
import { formatNumber } from '@/features/calendar/calendar';
import { motion, useReducedMotion } from '@/theme/motion';
import { StyleSheet, Text } from 'react-native';

export function useAnimatedNumber(target: number) {
  const reduced = useReducedMotion();
  const current = useRef(target);
  const [display, setDisplay] = useState(target);

  useLayoutEffect(() => {
    if (reduced) {
      current.current = target;
      setDisplay(target);
      return;
    }
    const from = current.current;
    if (from === target) return;
    let start: number | undefined;
    let frame = requestAnimationFrame(function update(time) {
      start ??= time;
      const progress = Math.min(1, (time - start) / motion.data);
      current.current =
        progress === 1
          ? target
          : from + (target - from) * motion.easing(progress);
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(update);
    });
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);

  return reduced ? target : display;
}

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const display = useAnimatedNumber(value);
  return (
    <Text
      style={styles.digits}
      accessibilityLabel={prefix + formatNumber(value) + suffix}
    >
      {prefix}
      {formatNumber(display)}
      {suffix}
    </Text>
  );
}

const styles = StyleSheet.create({ digits: { fontVariant: ['tabular-nums'] } });
