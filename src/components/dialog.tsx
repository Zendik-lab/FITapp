import { useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dialogWidth, radii, spacing, useAppTheme } from '@/theme';
import { motion, useReducedMotion } from '@/theme/motion';
import { AppText } from './app-text';
import { sheetDismissDistance, type DialogProps } from './dialog-props';

export function Dialog({
  title,
  children,
  onDismiss,
  open = true,
  dismissible = true,
  presentation = 'dialog',
}: DialogProps) {
  const { isDark, colors } = useAppTheme();
  const reduced = useReducedMotion();
  const sheet = presentation === 'sheet';
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  if (!open && present && reduced) setPresent(false);
  const [progress] = useState(
    () => new Animated.Value(reduced && open ? 1 : 0),
  );
  const swipe = useRef(0);

  useLayoutEffect(() => {
    if (reduced) {
      progress.setValue(open ? 1 : 0);
      return;
    }
    if (!open && !present) return;
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? motion.dialog : motion.exit,
      easing: motion.easing,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setPresent(false);
    });
    return () => animation.stop();
  }, [open, present, progress, reduced]);

  function dismiss() {
    if (open && dismissible) onDismiss();
  }
  if (!open && !present) return null;
  return (
    <Modal
      transparent
      animationType="none"
      onRequestClose={dismiss}
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={styles.frame}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>
        <SafeAreaView
          style={[styles.safeArea, sheet && styles.sheetArea]}
          pointerEvents="box-none"
        >
          <Animated.View
            accessibilityViewIsModal
            pointerEvents={open ? 'auto' : 'none'}
            style={[
              styles.dialog,
              {
                backgroundColor: colors.surface,
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [sheet ? 40 : 8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {sheet && (
              <View
                accessible={false}
                style={styles.handle}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  swipe.current = event.nativeEvent.pageY;
                }}
                onResponderRelease={(event) => {
                  if (
                    event.nativeEvent.pageY - swipe.current >=
                    sheetDismissDistance
                  )
                    dismiss();
                }}
              >
                <View
                  style={[
                    styles.handleLine,
                    { backgroundColor: colors.controlBorder },
                  ]}
                />
              </View>
            )}
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              indicatorStyle={isDark ? 'white' : 'black'}
              contentContainerStyle={styles.content}
            >
              <AppText variant="section" accessibilityRole="header">
                {title}
              </AppText>
              {children}
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#00000066' },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.medium,
  },
  sheetArea: { justifyContent: 'flex-end' },
  dialog: {
    width: '100%',
    maxWidth: dialogWidth,
    maxHeight: '100%',
    borderRadius: radii.hero,
    overflow: 'hidden',
  },
  content: { padding: spacing.large, gap: spacing.medium },
  handle: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handleLine: { width: 32, height: 4, borderRadius: 2 },
});
