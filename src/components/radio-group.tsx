import type { ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '@/theme';

export interface RadioGroupProps {
  label: string;
  children: ReactNode;
}

export function RadioGroup({ label, children }: RadioGroupProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ gap: spacing.small }}
    >
      {children}
    </View>
  );
}
