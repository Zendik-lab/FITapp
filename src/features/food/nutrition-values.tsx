import { AppText } from '@/components/app-text';
import { AnimatedNumber } from '@/components/animated-number';
import { formatNumber } from '@/features/calendar/calendar';
import type { NutritionTargets } from '@/features/nutrition/engine';

export function NutritionValues({
  values,
  caption,
  animate = false,
}: {
  values: NutritionTargets;
  caption?: string;
  animate?: boolean;
}) {
  const number = (value: number) =>
    animate ? <AnimatedNumber value={value} /> : formatNumber(value);
  return (
    <>
      {!!caption && (
        <AppText variant="caption" tone="muted">
          {caption}
        </AppText>
      )}
      <AppText>
        {number(values.calories)} ккал · Б {number(values.protein)} · Ж{' '}
        {number(values.fat)} · У {number(values.carbs)} г
      </AppText>
    </>
  );
}
