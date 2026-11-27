import { useState } from 'react';
import { describeError } from '@/database/storage-diagnostics';
import type { ActionMessage } from '@/components/action-notice';
import { useHapticFeedback } from '@/features/settings/feedback';

export function useLocalAction() {
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const feedback = useHapticFeedback();
  function announce(text: string, undo?: () => void, tactile = true) {
    if (tactile) feedback(undo ? 'selection' : 'success');
    setMessage({ text, kind: 'success', undo });
  }
  async function run(
    action: () => Promise<void>,
    text?: string,
    undo?: () => void,
  ) {
    try {
      await action();
      if (text) announce(text, undo);
    } catch (error) {
      setMessage((previous) => ({
        text: describeError(error),
        kind: 'error',
        undo: previous?.undo,
      }));
    }
  }
  return { message, run, announce, clear: () => setMessage(null) };
}
