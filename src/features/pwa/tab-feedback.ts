import { selectionAsync } from 'expo-haptics';

export function tabFeedback() {
  void selectionAsync().catch(() => {
    // The device can lack a haptic engine.
  });
}
