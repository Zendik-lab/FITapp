import { useId, useLayoutEffect, useRef, useState } from 'react';
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
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement>(null);
  const backdropPressed = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const { colors } = useAppTheme();
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  if (!open && present && reduced) setPresent(false);

  function close(dialog: HTMLDialogElement) {
    if (!dialog.open) return;
    dialog.close();
    if (previousFocus.current?.isConnected) {
      previousFocus.current.focus({ preventScroll: true });
    }
    previousFocus.current = null;
  }

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog) return () => close(dialog);
  }, []);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    backdropPressed.current = false;
    swipe.current = null;
    if (open) {
      if (!dialog.open) {
        const focused = document.activeElement;
        previousFocus.current = focused instanceof HTMLElement ? focused : null;
        dialog.showModal();
      }
      return;
    }
    if (!dialog.open) return;
    if (reduced) {
      close(dialog);
      return;
    }
    const timer = window.setTimeout(() => {
      close(dialog);
      setPresent(false);
    }, motion.exit);
    return () => window.clearTimeout(timer);
  }, [open, reduced]);

  function dismiss() {
    if (open && dismissible) onDismiss();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-presentation={presentation}
      data-closing={open ? undefined : ''}
      className="app-dialog"
      style={{
        width: `min(${dialogWidth}px, 100% - 2 * var(--dialog-gutter, 16px))`,
        borderRadius: radii.hero,
        backgroundColor: colors.surface,
        animationDuration: reduced
          ? '0ms'
          : `${open ? motion.dialog : motion.exit}ms`,
        animationTimingFunction: motion.cssEasing,
      }}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onPointerDown={(event) => {
        backdropPressed.current = event.target === event.currentTarget;
      }}
      onPointerCancel={() => {
        backdropPressed.current = false;
      }}
      onClickCapture={(event) => {
        if (!open) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (backdropPressed.current && event.target === event.currentTarget)
          dismiss();
        backdropPressed.current = false;
      }}
    >
      {present && (
        <div
          className="app-dialog-content"
          style={{ padding: spacing.large, gap: spacing.medium }}
        >
          {presentation === 'sheet' && (
            <div
              aria-hidden="true"
              className="app-sheet-handle"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                swipe.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                swipe.current = null;
              }}
              onPointerUp={(event) => {
                const start = swipe.current;
                swipe.current = null;
                if (!start) return;
                const dy = event.clientY - start.y;
                if (
                  dy >= sheetDismissDistance &&
                  dy > Math.abs(event.clientX - start.x)
                )
                  dismiss();
              }}
            >
              <span style={{ backgroundColor: colors.controlBorder }} />
            </div>
          )}
          <AppText
            nativeID={titleId}
            variant="section"
            accessibilityRole="header"
          >
            {title}
          </AppText>
          {children}
        </div>
      )}
    </dialog>
  );
}
