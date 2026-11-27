import type { ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '@/theme';

export interface RadioGroupProps {
  label: string;
  children: ReactNode;
  compact?: boolean;
}

export function RadioGroup({ label, children, compact }: RadioGroupProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        gap: spacing.small,
        flexDirection: compact ? 'row' : 'column',
        flexWrap: compact ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </View>
  );
}
