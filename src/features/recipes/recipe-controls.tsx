import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  type TextInputInstance,
} from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { Card } from '@/components/card';
import { NutritionValues } from '@/features/food/nutrition-values';
import { formatFoodQuantity } from '@/features/food/units';
import type { calculateRecipe } from './domain';

const modes = [
  { value: 'total', label: 'Весь рецепт' },
  { value: 'perServing', label: 'Одна порция' },
  { value: 'per100', label: '100 г блюда' },
] as const;
export type NutritionMode = (typeof modes)[number]['value'];

export function RecipeNutrition({
  nutrition,
  mode,
  onChange,
}: {
  nutrition?: ReturnType<typeof calculateRecipe>;
  mode: NutritionMode;
  onChange(mode: NutritionMode): void;
}) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(true);
  const values = nutrition?.[mode];
  const { calories, protein, fat, carbs } = values ?? {};
  useEffect(() => {
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (mounted) setReduceMotion(reduced);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.setValue(0.78);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => {
      animation.stop();
      opacity.setValue(1);
    };
  }, [calories, protein, fat, carbs, mode, opacity, reduceMotion]);
  return (
    <Card>
      <AppText variant="section">Пищевая ценность</AppText>
      {values ? (
        <Animated.View style={{ opacity }}>
          <NutritionValues
            values={values}
            caption={
              mode === 'per100' && nutrition?.estimated
                ? 'Приблизительно, по суммарной массе ингредиентов'
                : undefined
            }
          />
        </Animated.View>
      ) : (
        <AppText tone="muted">
          Для расчёта нужны ингредиенты, количество порций и корректный вес,
          если он указан.
        </AppText>
      )}
      <ChoiceGroup
        label="Режим расчёта"
        value={mode}
        options={modes}
        onChange={onChange}
      />
    </Card>
  );
}

export function SearchField({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange(text: string): void;
}) {
  const fields = useRef(new Map<string, TextInputInstance>());
  return (
    <FieldFocusContext value={fields}>
      <FormField
        name={name}
        label={label}
        value={value}
        onChangeText={onChange}
      />
      {!!value && (
        <PrimaryButton
          secondary
          label="Очистить поиск"
          onPress={() => {
            onChange('');
            fields.current.get(name)?.focus();
          }}
        />
      )}
    </FieldFocusContext>
  );
}

export function recipeYield(servings: number, cookedWeightGrams?: number) {
  const count = `${formatFoodQuantity(servings)} порц.`;
  return cookedWeightGrams === undefined
    ? count
    : `${count} · ${formatFoodQuantity(cookedWeightGrams)} г`;
}
