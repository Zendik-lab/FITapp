import type { ComponentType, ReactNode } from 'react';

export function PwaProvider({ children }: { children: ReactNode }) {
  return children;
}

export const PwaNotices: ComponentType<{ blockUpdate?: boolean }> = () => null;

export function useUpdateBlocker() {}

export function AppVersionSection() {
  return null;
}

export function InstallAppSection() {
  return null;
}
