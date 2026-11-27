import { useMemo, useState } from 'react';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup } from '@/components/form-controls';
import { addEntry } from '@/features/food/operations';
import { makeEntry, newId, sumEntries } from '@/features/food/domain';
import { FoodForm } from '@/features/food/food-form';
import { meals, type MealType } from '@/features/food/model';
import type { FoodSession } from '@/features/food/food-context';
import { NutritionValues } from '@/features/food/nutrition-values';
import { useNutrition } from '@/features/nutrition/nutrition-context';
import { useProfile } from '@/features/profile/profile-context';
import { addRecipeEntry } from '@/features/recipes/operations';
import { formatNumber } from '@/features/calendar/calendar';
import { mealAt, remainingTargets, suggestMeals } from './recommend';
import { useSmartRecipes } from './use-smart-food';
import { useLocalAction } from './use-local-action';

export const mealOptions = (Object.keys(meals) as MealType[]).map((value) => ({
  value,
  label: meals[value],
}));

export function SmartMealScreen({
  session,
  date,
  onBack,
}: {
  session: FoodSession;
  date: string;
  onBack(): void;
}) {
  const hour = new Date().getHours();
  const [meal, setMeal] = useState(() => mealAt(hour));
  const profile = useProfile()?.state.profile;
  const nutrition = useNutrition();
  const targets = nutrition?.issues.length
    ? undefined
    : nutrition?.snapshot?.targets;
  const recipes = useSmartRecipes(session);
  const action = useLocalAction();
  const { state, products } = session;
  const remaining = useMemo(
    () => targets && remainingTargets(targets, sumEntries(state.entries, date)),
    [targets, state.entries, date],
  );
  const options = useMemo(
    () =>
      remaining && profile
        ? suggestMeals(
            remaining,
            recipes,
            products,
            state,
            profile.nutrition,
            profile.goals.kind,
            hour,
          )
        : [],
    [remaining, profile, recipes, products, state, hour],
  );
  const restrictions = profile?.nutrition;
  return (
    <FoodForm title="Подбор блюд" onBack={onBack} pending={session.pending}>
      {remaining && (
        <Card>
          <NutritionValues
            caption="Осталось на выбранную дату"
            values={remaining}
          />
        </Card>
      )}
      <ActionNotice message={action.message} dismiss={action.clear} />
      {!options.length && (
        <AppText tone="muted">
          {restrictions?.allergies.trim() || restrictions?.restrictions.trim()
            ? 'В профиле указаны аллергии или ограничения. В каталоге недостаточно сведений, чтобы безопасно подобрать варианты.'
            : !remaining
              ? 'Рассчитайте цели питания в профиле.'
              : 'Подходящих вариантов для текущего остатка и настроек питания нет.'}
        </AppText>
      )}
      {!!options.length && (
        <ChoiceGroup
          compact
          label="Добавить в приём пищи"
          value={meal}
          options={mealOptions}
          onChange={setMeal}
        />
      )}
      {options.map((suggestion) => (
        <Card key={suggestion.parts.map((part) => part.id).join(':')}>
          {suggestion.parts.map((part) => (
            <AppText key={part.id} variant="action">
              {part.name} · {formatNumber(part.amount)}{' '}
              {part.kind === 'recipe' ? 'порц.' : 'г'}
            </AppText>
          ))}
          <NutritionValues values={suggestion.values} />
          <AppText variant="caption" tone="muted">
            {suggestion.reason}
          </AppText>
          <PrimaryButton
            label="Добавить вариант в дневник"
            disabled={session.pending || !!session.failure}
            onPress={() =>
              void action.run(
                () =>
                  session.change((current) =>
                    suggestion.parts.reduce((next, part) => {
                      if (part.kind === 'recipe')
                        return addRecipeEntry(
                          next,
                          part.id,
                          part.amount,
                          'serving',
                          meal,
                          date,
                          newId(),
                        );
                      const product = products.find(
                        (item) => item.id === part.id,
                      );
                      if (!product)
                        throw new Error('Продукт больше недоступен.');
                      return addEntry(
                        next,
                        makeEntry(product, part.amount, 'g', meal, date),
                      );
                    }, current),
                  ),
                'Вариант добавлен в дневник.',
              )
            }
          />
        </Card>
      ))}
    </FoodForm>
  );
}
