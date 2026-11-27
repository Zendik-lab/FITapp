import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedNumber } from '@/components/animated-number';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { SectionHeader } from '@/components/headers';
import { addDays, formatNumber } from '@/features/calendar/calendar';
import {
  dateKey,
  isMassBased,
  parseDateKey,
  parseDecimal,
  portion,
} from '@/features/food/domain';
import type { FoodSession } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import type { FoodProduct } from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { ProductPicker } from '@/features/food/product-picker';
import { emptyPantry, positiveValue } from './model';
import { diaryCost, portionCost, recipeCost } from './planning';
import { estimateLabel, money } from './pantry-screen';
import { changePantry, resolveRecipe, useSmartRecipes } from './use-smart-food';
import { useLocalAction } from './use-local-action';
import { spacing, useAppTheme } from '@/theme';
import type { NutritionTargets } from '@/features/nutrition/engine';

const bases = [
  { value: '100', label: 'На 100 г' },
  { value: 'custom', label: 'На порцию' },
] as const;
const metrics = [
  { key: 'calories', title: 'Калории', unit: 'ккал', tone: 'accent' },
  { key: 'protein', title: 'Белки', unit: 'г', tone: 'protein' },
  { key: 'fat', title: 'Жиры', unit: 'г', tone: 'fat' },
  { key: 'carbs', title: 'Углеводы', unit: 'г', tone: 'carbs' },
] as const;

function ComparisonBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: (typeof metrics)[number]['tone'];
}) {
  const { colors } = useAppTheme();
  const ratio = useAnimatedNumber(max > 0 ? value / max : 0);
  return (
    <View
      aria-hidden
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors[tone],
            transformOrigin: 'left center',
            transform: [{ scaleX: ratio }],
          },
        ]}
      />
    </View>
  );
}

function ComparisonTable({
  rows,
}: {
  rows: { name: string; id: string; values: NutritionTargets }[];
}) {
  if (rows.length < 2) return null;
  return (
    <Card>
      <SectionHeader title="Сопоставление КБЖУ" />
      {metrics.map(({ key, title, unit, tone }) => {
        const max = Math.max(...rows.map((row) => row.values[key]));
        return (
          <View key={key} style={styles.metric}>
            <AppText variant="action">{title}</AppText>
            {rows.map(({ id, name, values }) => (
              <View key={id} style={styles.metric}>
                <AppText variant="caption">
                  {name} · {formatNumber(values[key])} {unit}
                </AppText>
                <ComparisonBar value={values[key]} max={max} tone={tone} />
              </View>
            ))}
          </View>
        );
      })}
    </Card>
  );
}

export function CompareBudgetScreen({
  mode,
  session,
  date,
  onBack,
}: {
  mode: 'compare' | 'budget';
  session: FoodSession;
  date: string;
  onBack(): void;
}) {
  const [picker, setPicker] = useState(false);
  const [basis, setBasis] = useState<'100' | 'custom'>('100');
  const [selected, setSelected] = useState<
    { product: FoodProduct; amount: string }[]
  >([]);
  const [editing, setEditing] = useState<FoodProduct>();
  const pantry = session.state.pantry ?? emptyPantry;
  const [daily, setDaily] = useState(String(pantry.dailyBudget ?? ''));
  const [weekly, setWeekly] = useState(String(pantry.weeklyBudget ?? ''));
  const [price, setPrice] = useState('');
  const [packageWeight, setPackageWeight] = useState('');
  const [showRecipes, setShowRecipes] = useState(false);
  const [limit, setLimit] = useState(6);
  const action = useLocalAction();
  const entries = session.state.entries;
  const disabled = session.pending || !!session.failure;
  const dayEntries = entries.filter((row) => row.date === date);
  const weekStart = dateKey(addDays(parseDateKey(date), -6));
  const weekEntries = entries.filter(
    (row) => row.date >= weekStart && row.date <= date,
  );
  const day = diaryCost(dayEntries, pantry.prices);
  const week = diaryCost(weekEntries, pantry.prices);
  const recipes = useSmartRecipes(session);
  const comparison = selected.flatMap(({ product, amount }) => {
    const grams = basis === '100' ? 100 : parseDecimal(amount);
    return positiveValue(grams) && grams <= 100000
      ? [
          {
            name: product.name,
            id: product.id,
            values: portion(product, grams, 'g'),
          },
        ]
      : [];
  });
  const affordable = useMemo(() => {
    if (mode !== 'budget' || !showRecipes) return [];
    const left = Math.max(
      0,
      Math.min(
        (pantry.dailyBudget ?? Infinity) - day.amount,
        (pantry.weeklyBudget ?? Infinity) - week.amount,
      ),
    );
    return recipes
      .flatMap((row) => {
        if (
          [...row.ingredientIds].some((id) => !Object.hasOwn(pantry.prices, id))
        )
          return [];
        const recipe = resolveRecipe(session.state, row.recipe.id);
        if (!recipe) return [];
        const cost = recipeCost(recipe, pantry.prices);
        return !cost.unknown && cost.amount <= left
          ? [{ ...row, cost: cost.amount }]
          : [];
      })
      .sort((a, b) => a.cost - b.cost);
  }, [
    day.amount,
    mode,
    pantry.dailyBudget,
    pantry.weeklyBudget,
    pantry.prices,
    recipes,
    session.state,
    showRecipes,
    week.amount,
  ]);

  function choose(product: FoodProduct) {
    if (mode === 'compare') {
      setSelected((rows) =>
        rows.some((row) => row.product.id === product.id)
          ? rows.filter((row) => row.product.id !== product.id)
          : [
              ...rows,
              { product, amount: String(product.servingGrams ?? 100) },
            ].slice(0, 4),
      );
    } else {
      setEditing(product);
      const saved = pantry.prices[product.id];
      setPrice(String(saved?.amount ?? ''));
      setPackageWeight(String(saved?.grams ?? ''));
    }
    setPicker(false);
  }

  function savePrice(remove = false) {
    if (!editing) return;
    void action.run(
      async () => {
        const amount = parseDecimal(price);
        const grams = parseDecimal(packageWeight);
        if (!remove && (!positiveValue(amount) || !positiveValue(grams)))
          throw new Error('Укажите цену и массу упаковки.');
        await session.change((state) =>
          changePantry(state, (data) => {
            const prices = { ...data.prices, [editing.id]: { amount, grams } };
            if (remove) delete prices[editing.id];
            return { ...data, prices };
          }),
        );
        setEditing(undefined);
      },
      remove ? 'Цена удалена.' : 'Цена сохранена.',
    );
  }
  function saveBudgets() {
    void action.run(async () => {
      const dailyBudget = daily.trim() ? parseDecimal(daily) : undefined;
      const weeklyBudget = weekly.trim() ? parseDecimal(weekly) : undefined;
      if (
        (dailyBudget !== undefined && !positiveValue(dailyBudget)) ||
        (weeklyBudget !== undefined && !positiveValue(weeklyBudget))
      )
        throw new Error(
          'Укажите положительный бюджет или оставьте поле пустым.',
        );
      await session.change((s) =>
        changePantry(s, (data) => ({ ...data, dailyBudget, weeklyBudget })),
      );
    }, 'Бюджет сохранён.');
  }
  return (
    <FoodForm
      title={mode === 'compare' ? 'Сравнение продуктов' : 'Бюджет питания'}
      onBack={
        editing
          ? () => setEditing(undefined)
          : picker
            ? () => setPicker(false)
            : onBack
      }
      pending={session.pending}
    >
      <ActionNotice message={action.message} dismiss={action.clear} />
      {picker ? (
        <ProductPicker
          acceptProduct={isMassBased}
          onProduct={choose}
          selectedIds={selected.map((row) => row.product.id)}
        />
      ) : editing ? (
        <>
          <SectionHeader title={editing.name} />
          <FormField
            name="package-price"
            label="Цена упаковки, ₸"
            inputMode="decimal"
            value={price}
            onChangeText={setPrice}
          />
          <FormField
            name="package-weight"
            label="Масса упаковки, г"
            inputMode="decimal"
            value={packageWeight}
            onChangeText={setPackageWeight}
          />
          <PrimaryButton
            label="Сохранить цену"
            disabled={disabled}
            onPress={() => savePrice()}
          />
          {pantry.prices[editing.id] && (
            <PrimaryButton
              secondary
              label="Удалить цену"
              disabled={disabled}
              onPress={() => savePrice(true)}
            />
          )}
        </>
      ) : mode === 'compare' ? (
        <>
          {selected.length < 2 && (
            <AppText tone="muted">
              Выберите от двух до четырёх продуктов. Сравните КБЖУ и цену на
              одинаковый вес или на свои порции.
            </AppText>
          )}
          <PrimaryButton
            label="Выбрать продукт для сравнения"
            onPress={() => setPicker(true)}
            disabled={selected.length >= 4}
          />
          <ChoiceGroup
            compact
            label="Основа сравнения"
            value={basis}
            options={bases}
            onChange={setBasis}
          />
          <ComparisonTable rows={comparison} />
          {selected.map(({ product, amount }) => {
            const grams = basis === '100' ? 100 : parseDecimal(amount);
            const valid = positiveValue(grams) && grams <= 100000;
            const { calories, protein } = product.per100;
            const cost = valid
              ? portionCost(pantry.prices[product.id], grams)
              : null;
            return (
              <Card key={product.id}>
                <SectionHeader title={product.name} />
                {basis === 'custom' && (
                  <FormField
                    name={`portion-${product.id}`}
                    label={`Порция, г · ${product.name}`}
                    inputMode="decimal"
                    value={amount}
                    onChangeText={(value) =>
                      setSelected((rows) =>
                        rows.map((row) =>
                          row.product.id === product.id
                            ? { ...row, amount: value }
                            : row,
                        ),
                      )
                    }
                    error={
                      valid ? undefined : 'Укажите количество до 100 000 г.'
                    }
                  />
                )}
                {valid && (
                  <NutritionValues values={portion(product, grams, 'g')} />
                )}
                <AppText>
                  {calories
                    ? `${formatNumber((protein / calories) * 100)} г белка на 100 ккал`
                    : 'Белок на 100 ккал не рассчитывается'}
                </AppText>
                <AppText tone="muted">
                  {cost === null
                    ? 'Цена порции неизвестна'
                    : `Оценка порции ${money(cost)}`}
                </AppText>
                <PrimaryButton
                  secondary
                  label={`Убрать из сравнения: ${product.name}`}
                  onPress={() =>
                    setSelected((rows) =>
                      rows.filter((row) => row.product.id !== product.id),
                    )
                  }
                />
              </Card>
            );
          })}
        </>
      ) : (
        <>
          <Card>
            <SectionHeader title="Стоимость записей" />
            <AppText>
              {date} · {estimateLabel(day)}
              {pantry.dailyBudget ? ` / ${money(pantry.dailyBudget)}` : ''}
            </AppText>
            <AppText>
              Последние 7 дней · {estimateLabel(week)}
              {pantry.weeklyBudget ? ` / ${money(pantry.weeklyBudget)}` : ''}
            </AppText>
            <AppText variant="caption" tone="muted">
              Расчёт по вашим текущим ценам. Для старых записей рецептов может
              не быть снимка ингредиентов.
            </AppText>
          </Card>
          <PrimaryButton
            label="Указать цену продукта"
            onPress={() => setPicker(true)}
            disabled={disabled}
          />
          {session.products
            .filter(
              (product) =>
                isMassBased(product) &&
                Object.hasOwn(pantry.prices, product.id),
            )
            .map((product) => {
              const price = pantry.prices[product.id];
              const costProtein = product.per100.protein
                ? portionCost(price, 10000 / product.per100.protein)
                : null;
              return (
                <Card key={product.id}>
                  <AppText variant="action">
                    {product.name} · {money(price.amount)} за{' '}
                    {formatNumber(price.grams)} г
                  </AppText>
                  <AppText>
                    {money(portionCost(price, 100) ?? 0)} за 100 г
                    {costProtein !== null
                      ? ` · ${money(costProtein)} за 100 г белка`
                      : ''}
                  </AppText>
                  <PrimaryButton
                    secondary
                    label={`Изменить цену: ${product.name}`}
                    onPress={() => choose(product)}
                    disabled={disabled}
                  />
                </Card>
              );
            })}
          <Card>
            <SectionHeader title="Лимиты" />
            <FormField
              name="daily-budget"
              label="Дневной бюджет, ₸"
              inputMode="decimal"
              value={daily}
              onChangeText={setDaily}
            />
            <FormField
              name="weekly-budget"
              label="Недельный бюджет, ₸"
              inputMode="decimal"
              value={weekly}
              onChangeText={setWeekly}
            />
            <PrimaryButton
              secondary
              label="Сохранить бюджет"
              onPress={saveBudgets}
              disabled={disabled}
            />
          </Card>
          <PrimaryButton
            secondary
            label="Рецепты по стоимости"
            expanded={showRecipes}
            onPress={() => setShowRecipes(!showRecipes)}
          />
          {showRecipes && !affordable.length && (
            <AppText tone="muted">
              Подходящих рецептов со всеми ценами пока нет. Добавьте цены
              ингредиентов или проверьте остаток бюджета.
            </AppText>
          )}
          {showRecipes &&
            affordable.slice(0, limit).map(({ recipe, nutrition, cost }) => (
              <Card key={recipe.id}>
                <AppText variant="action">
                  {recipe.name} · {money(cost)} за порцию
                </AppText>
                <NutritionValues values={nutrition} />
              </Card>
            ))}
          {showRecipes && limit < affordable.length && (
            <PrimaryButton
              secondary
              label="Ещё рецепты"
              onPress={() => setLimit(limit + 6)}
            />
          )}
        </>
      )}
    </FoodForm>
  );
}

const styles = StyleSheet.create({
  metric: { gap: spacing.tight },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
});
