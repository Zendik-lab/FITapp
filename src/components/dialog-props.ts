import type { ReactNode } from 'react';

export type DialogProps = {
  title: string;
  children: ReactNode;
  onDismiss: () => void;
  open?: boolean;
  dismissible?: boolean;
  presentation?: 'dialog' | 'sheet';
};

export const sheetDismissDistance = 56;
