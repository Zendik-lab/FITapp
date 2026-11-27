import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Easing, Platform } from 'react-native';

export const motion = {
  press: 130,
  tab: 160,
  navigation: 210,
  data: 240,
  dialog: 280,
  exit: 180,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  cssEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  spring: { stiffness: 460, damping: 34, mass: 0.7, overshootClamping: true },
  useNativeDriver: Platform.OS !== 'web',
} as const;

const ReducedMotion = createContext(true);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true,
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const root = document.documentElement.style;
      root.setProperty('--motion-press', `${motion.press}ms`);
      root.setProperty('--motion-dialog', `${motion.dialog}ms`);
      root.setProperty('--motion-exit', `${motion.exit}ms`);
      root.setProperty('--motion-easing', motion.cssEasing);
      const update = () => setReduced(media.matches);
      update();
      media.addEventListener('change', update);
      return () => {
        media.removeEventListener('change', update);
        root.removeProperty('--motion-press');
        root.removeProperty('--motion-dialog');
        root.removeProperty('--motion-exit');
        root.removeProperty('--motion-easing');
      };
    }
    let listening = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        listening = false;
        setReduced(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (listening) setReduced(value);
      },
      () => {},
    );
    return () => {
      listening = false;
      subscription.remove();
    };
  }, []);

  return <ReducedMotion value={reduced}>{children}</ReducedMotion>;
}

export function useReducedMotion() {
  return use(ReducedMotion);
}
