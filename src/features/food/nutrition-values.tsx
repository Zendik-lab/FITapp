import { AppText } from '@/components/app-text';
import { formatNumber } from '@/features/calendar/calendar';
import type { NutritionTargets } from '@/features/nutrition/engine';

export function NutritionValues({
  values,
  caption,
}: {
  values: NutritionTargets;
  caption?: string;
}) {
  return (
    <>
      {!!caption && (
        <AppText variant="caption" tone="muted">
          {caption}
        </AppText>
      )}
      <AppText>
        {formatNumber(values.calories)} ккал · Б {formatNumber(values.protein)}{' '}
        · Ж {formatNumber(values.fat)} · У {formatNumber(values.carbs)} г
      </AppText>
    </>
  );
}
