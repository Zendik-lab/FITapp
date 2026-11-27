import { useEffect, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
} from 'react-native';
import { contentWidth, spacing, useAppTheme } from '@/theme';
import { PwaNotices, useUpdateBlocker } from '@/features/pwa/pwa-status';
import { FormDisabledContext } from './form-controls';
import { ScreenSafeArea } from './screen-safe-area';
import { SceneTransition } from './screen-stack';

export function useBeforeUnload(enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [enabled]);
}

export function FormScreen({
  children,
  transitionKey,
  scrollRef,
  disabled = false,
  blockUpdate = false,
  readOnly = false,
  withinTabs = false,
}: {
  children: ReactNode;
  transitionKey: string | number;
  scrollRef: RefObject<ScrollViewInstance | null>;
  disabled?: boolean;
  blockUpdate?: boolean;
  readOnly?: boolean;
  withinTabs?: boolean;
}) {
  useUpdateBlocker(!readOnly || blockUpdate);
  const { isDark } = useAppTheme();
  useBeforeUnload(blockUpdate);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [transitionKey, scrollRef]);
  return (
    <ScreenSafeArea bottomInset={!withinTabs}>
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
          contentInsetAdjustmentBehavior="never"
          indicatorStyle={isDark ? 'white' : 'black'}
          contentContainerStyle={styles.content}
        >
          <SceneTransition transitionKey={transitionKey} style={styles.body}>
            <PwaNotices blockUpdate={blockUpdate} />
            <FormDisabledContext value={disabled}>
              {children}
            </FormDisabledContext>
          </SceneTransition>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: contentWidth,
    alignSelf: 'center',
    padding: spacing.medium,
    paddingBottom: spacing.section,
  },
  body: { gap: spacing.large, flexGrow: 1 },
});
