import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useAppTheme } from '@/theme';
import { PwaNotices, useUpdateBlocker } from '@/features/pwa/pwa-status';
import { FormDisabledContext } from './form-controls';

export function FormScreen({
  children,
  transitionKey,
  scrollRef,
  disabled = false,
  blockUpdate = false,
}: {
  children: ReactNode;
  transitionKey: string | number;
  scrollRef: RefObject<ScrollViewInstance | null>;
  disabled?: boolean;
  blockUpdate?: boolean;
}) {
  useUpdateBlocker();
  const { colors, isDark } = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (Platform.OS !== 'web' || !blockUpdate) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [blockUpdate]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (active && !reduced) {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      }
    });
    return () => {
      active = false;
      opacity.stopAnimation();
      opacity.setValue(1);
    };
  }, [transitionKey, opacity, scrollRef]);
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          // React Native Web dismisses on every scroll event in on-drag mode,
          // including Safari's automatic scrolling to keep the caret visible.
          keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          indicatorStyle={isDark ? 'white' : 'black'}
          contentContainerStyle={styles.content}
        >
          <Animated.View
            testID="form-content"
            style={[styles.body, { opacity }]}
          >
            <PwaNotices blockUpdate={blockUpdate} />
            <FormDisabledContext value={disabled}>
              {children}
            </FormDisabledContext>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: spacing.medium,
    paddingBottom: spacing.section,
  },
  body: { gap: spacing.large, flexGrow: 1 },
});
