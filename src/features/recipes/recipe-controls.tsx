import { useRef } from 'react';
import type { TextInputInstance } from 'react-native';
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
  allowEstimatedPer100 = true,
}: {
  nutrition?: ReturnType<typeof calculateRecipe>;
  mode: NutritionMode;
  onChange(mode: NutritionMode): void;
  allowEstimatedPer100?: boolean;
}) {
  const values = nutrition?.[mode];
  return (
    <Card>
      <AppText variant="section">Пищевая ценность</AppText>
      {values ? (
        <NutritionValues
          animate
          values={values}
          caption={
            mode === 'per100' && nutrition?.estimated
              ? 'Приблизительно, по суммарной массе ингредиентов'
              : undefined
          }
        />
      ) : (
        <AppText tone="muted">
          Для расчёта нужны ингредиенты, количество порций и корректный вес,
          если он указан.
        </AppText>
      )}
      <ChoiceGroup
        label="Режим расчёта"
        compact
        value={mode}
        options={
          nutrition?.estimated && !allowEstimatedPer100
            ? modes.filter(({ value }) => value !== 'per100')
            : modes
        }
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
  onSubmit,
}: {
  name: string;
  label: string;
  value: string;
  onChange(text: string): void;
  onSubmit?(): void;
}) {
  const fields = useRef(new Map<string, TextInputInstance>());
  return (
    <FieldFocusContext value={fields}>
      <FormField
        name={name}
        label={label}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
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
