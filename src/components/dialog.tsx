import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radii, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

export function Dialog({
  title,
  children,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  onDismiss: () => void;
}) {
  const { isDark, colors } = useAppTheme();

  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.frame}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessible={false}
          importantForAccessibility="no"
        />
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <View
            accessibilityViewIsModal
            style={[styles.dialog, { backgroundColor: colors.surface }]}
          >
            <ScrollView
              bounces={false}
              indicatorStyle={isDark ? 'white' : 'black'}
              contentContainerStyle={styles.content}
            >
              <AppText variant="section" accessibilityRole="header">
                {title}
              </AppText>
              {children}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: '#00000066' },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.medium,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    borderRadius: radii.hero,
    overflow: 'hidden',
  },
  content: { padding: spacing.large, gap: spacing.medium },
});
