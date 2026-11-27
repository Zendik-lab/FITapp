import { Platform, Pressable, type PressableProps } from 'react-native';
import { useReducedMotion } from '@/theme/motion';

const webFeedback =
  Platform.OS === 'web' ? { dataSet: { motionPress: '' } } : {};
const pressedFeedback = { transform: [{ scale: 0.98 }] };

export function Touchable({ style, ...props }: PressableProps) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      {...webFeedback}
      {...props}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && !reduced && pressedFeedback,
      ]}
    />
  );
}
