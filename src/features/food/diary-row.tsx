import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';

export function DiaryRow({
  children,
  onEdit,
  onRemove,
  disabled,
}: {
  children: ReactNode;
  onEdit(): void;
  onRemove(): void;
  disabled: boolean;
}) {
  const origin = useRef<{ x: number; y: number }>(null);
  return (
    <View
      onTouchStart={({ nativeEvent }) => {
        origin.current =
          !disabled && nativeEvent.touches.length <= 1
            ? { x: nativeEvent.pageX, y: nativeEvent.pageY }
            : null;
      }}
      onTouchCancel={() => {
        origin.current = null;
      }}
      onTouchEnd={({ nativeEvent }) => {
        const start = origin.current;
        origin.current = null;
        if (!start || disabled) return;
        const x = nativeEvent.pageX - start.x;
        const y = nativeEvent.pageY - start.y;
        if (Math.abs(x) < 75 || Math.abs(y) * 2 > Math.abs(x)) return;
        if (x > 0) onEdit();
        else onRemove();
      }}
    >
      {children}
    </View>
  );
}
