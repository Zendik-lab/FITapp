import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';

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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { colors } = useAppTheme();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="app-dialog"
      style={{ borderRadius: radii.hero, backgroundColor: colors.surface }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        style={{ display: 'grid', padding: spacing.large, gap: spacing.medium }}
      >
        <AppText
          nativeID={titleId}
          variant="section"
          accessibilityRole="header"
        >
          {title}
        </AppText>
        {children}
      </div>
    </dialog>
  );
}
