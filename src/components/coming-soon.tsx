import { createContext, use, useState, type ReactNode } from 'react';

import { AppText } from './app-text';
import { PrimaryButton } from './buttons';
import { Dialog } from './dialog';

const ComingSoonContext = createContext<((title: string) => void) | null>(null);

export function ComingSoonProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const dismiss = () => setTitle(null);

  return (
    <ComingSoonContext value={setTitle}>
      {children}
      <Dialog open={!!title} title={title ?? ''} onDismiss={dismiss}>
        <AppText tone="muted">Эта функция ещё разрабатывается.</AppText>
        <PrimaryButton label="Понятно" onPress={dismiss} />
      </Dialog>
    </ComingSoonContext>
  );
}

export function useComingSoon() {
  const showComingSoon = use(ComingSoonContext);
  if (!showComingSoon) throw new Error('Не подключён ComingSoonProvider.');
  return showComingSoon;
}
