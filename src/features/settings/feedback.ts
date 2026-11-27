import { use } from 'react';
import { Platform } from 'react-native';
import {
  notificationAsync,
  NotificationFeedbackType,
  selectionAsync,
} from 'expo-haptics';
import { AppSettingsContext } from './app-settings-context';

export function useHapticFeedback() {
  const enabled =
    use(AppSettingsContext)?.settings.personalization?.haptics ?? true;
  return (event: 'selection' | 'success') => {
    if (Platform.OS === 'web' || !enabled) return;
    void (
      event === 'selection'
        ? selectionAsync()
        : notificationAsync(NotificationFeedbackType.Success)
    ).catch(() => {});
  };
}
