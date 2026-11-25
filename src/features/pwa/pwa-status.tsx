import type { ComponentType, ReactNode } from 'react';

export function PwaProvider({ children }: { children: ReactNode }) {
  return children;
}

export const PwaNotices: ComponentType<{ blockUpdate?: boolean }> = () => null;

export function InstallAppSection() {
  return null;
}
