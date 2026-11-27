import { useMemo, useState } from 'react';
import { ActionNotice } from '@/components/action-notice';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { SectionHeader } from '@/components/headers';
import { formatNumber } from '@/features/calendar/calendar';
import { gramsFor, parseDecimal, unitsFor } from '@/features/food/domain';
import type { FoodSession } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import {
  unitLabels,
  type FoodProduct,
  type FoodUnit,
} from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { ProductPicker } from '@/features/food/product-picker';
import {
  findRecipes,
  numericFilters,
  recipeIngredientKey,
  type RecipeFilters,
  type NumericFilter,
  type IndexedRecipe,
} from '@/features/recipes/recipe-search';
import { emptyPantry, positiveValue, type FoodQuantity } from './model';
import {
  estimateCost,
  ingredientQuantities,
  mergeShopping,
  recipeCoverage,
} from './planning';
import { useLocalAction } from './use-local-action';
import { changePantry, resolveRecipe, useSmartRecipes } from './use-smart-food';

export const money = (value: number) => `${formatNumber(value)} ₸`;
export function estimateLabel({
  amount,
  unknown,
}: {
  amount: number;
  unknown: number;
}) {
  return unknown && !amount
    ? 'Цена неизвестна'
    : `Оценка ${money(amount)}${unknown ? ` · без цены: ${unknown}` : ''}`;
}

const pantryFilters = numericFilters.filter(
  ({ key }) => key !== 'maxIngredients',
);
type Mode = 'fridge' | 'shopping';
type RecipeMatch = {
  row: IndexedRecipe;
  match?: ReturnType<typeof recipeCoverage>;
};

export function PantryScreen({
  session,
  mode,
  onBack,
}: {
  session: FoodSession;
  mode: Mode;
  onBack(): void;
}) {
  const { state, products, pending } = session;
  const pantry = state.pantry ?? emptyPantry;
  const [editor, setEditor] = useState<{ row: FoodQuantity; key?: string }>();
  const [picker, setPicker] = useState(false);
  const [recipePicker, setRecipePicker] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fields, setFields] = useState<Partial<Record<NumericFilter, string>>>(
    {},
  );
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<FoodUnit>('g');
  const [picked, setPicked] = useState<FoodProduct>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const action = useLocalAction();
  const recipes = useSmartRecipes(session);
  const categories = useMemo(
    () => new Map(products.map((item) => [item.id, item.category])),
    [products],
  );
  const inventory = useMemo(() => {
    const stock: Record<string, number> = Object.create(null);
    for (const { id, grams } of pantry.stock) {
      const key = recipeIngredientKey(id);
      stock[key] = (stock[key] ?? 0) + grams;
    }
    return stock;
  }, [pantry.stock]);
  const ready = useMemo<RecipeMatch[]>(() => {
    if (mode === 'shopping' && !recipePicker) return [];
    const filters: RecipeFilters = { query };
    for (const { key } of pantryFilters) {
      const number = parseDecimal(fields[key] ?? '');
      if (positiveValue(number)) filters[key] = number;
    }
    const rows = findRecipes(recipes, filters);
    if (mode === 'shopping') return rows.map((row) => ({ row }));
    if (!pantry.stock.length) return [];
    return rows
      .flatMap((row) => {
        if (
          ![...row.ingredientIds].some((id) =>
            Object.hasOwn(inventory, recipeIngredientKey(id)),
          )
        )
          return [];
        const recipe = resolveRecipe(state, row.recipe.id);
        if (!recipe) return [];
        const match = recipeCoverage(
          recipe.ingredients.map((item) => ({
            ...item,
            productId: recipeIngredientKey(item.productId),
          })),
          inventory,
          categories,
        );
        return match.percent > 0 ? [{ row, match }] : [];
      })
      .sort(
        (a, b) =>
          a.match.missing.length - b.match.missing.length ||
          b.match.percent - a.match.percent,
      );
  }, [
    categories,
    fields,
    inventory,
    mode,
    pantry.stock.length,
    query,
    recipePicker,
    recipes,
    state,
  ]);

  function open(row?: FoodQuantity, key?: string, product?: FoodProduct) {
    setPicked(product);
    setAmount(row ? String(row.grams) : '100');
    setName(row?.name ?? product?.name ?? '');
    setCategory(row?.category ?? product?.category ?? '');
    setUnit('g');
    setEditor({
      row: row ?? { id: product?.id ?? '', name: '', category: '', grams: 0 },
      key,
    });
    setPicker(false);
  }

  function save() {
    if (!editor) return;
    void action.run(
      async () => {
        const grams = picked
          ? gramsFor(picked, parseDecimal(amount), unit)
          : parseDecimal(amount);
        const nameText = name.trim();
        if (!positiveValue(grams) || grams > 100000 || !nameText)
          throw new Error('Укажите название и количество до 100 000 г.');
        const categoryText = category.trim() || 'Прочее';
        const row = {
          id:
            editor.row.id ||
            `manual:${nameText.toLocaleLowerCase('ru').replace(/\s+/g, ' ')}`,
          name: nameText,
          category: categoryText,
          grams,
        };
        await session.change((current) =>
          changePantry(current, (data) =>
            mode === 'fridge'
              ? {
                  ...data,
                  stock: [
                    ...data.stock.filter((item) => item.id !== row.id),
                    row,
                  ],
                }
              : {
                  ...data,
                  shopping: editor.key
                    ? data.shopping.map((item) =>
                        item.key === editor.key ? { ...item, ...row } : item,
                      )
                    : mergeShopping(data.shopping, [row]),
                },
          ),
        );
        setEditor(undefined);
      },
      mode === 'fridge' ? 'Запас сохранён.' : 'Список обновлён.',
    );
  }

  const disabled = pending || !!session.failure;
  return (
    <FoodForm
      title={mode === 'fridge' ? 'Умный холодильник' : 'Покупки'}
      onBack={
        editor
          ? () => setEditor(undefined)
          : picker
            ? () => setPicker(false)
            : onBack
      }
      pending={pending}
    >
      <ActionNotice message={action.message} dismiss={action.clear} />
      {editor ? (
        <>
          {picked || editor.row.id ? (
            <SectionHeader title={name} />
          ) : (
            <FormField
              name="shopping-name"
              label="Название покупки"
              value={name}
              onChangeText={setName}
              maxLength={100}
            />
          )}
          <FormField
            name="quantity"
            label={`Количество, ${unitLabels[unit]}`}
            inputMode="decimal"
            value={amount}
            onChangeText={setAmount}
          />
          {picked && unitsFor(picked).length > 1 && (
            <ChoiceGroup
              compact
              label="Единица"
              value={unit}
              onChange={setUnit}
              options={unitsFor(picked).map((value) => ({
                value,
                label: unitLabels[value],
              }))}
            />
          )}
          {mode === 'shopping' && !picked && (
            <FormField
              name="shopping-category"
              label="Категория покупки"
              value={category}
              onChangeText={setCategory}
              maxLength={50}
            />
          )}
          <PrimaryButton
            label="Сохранить количество"
            onPress={save}
            disabled={disabled}
          />
        </>
      ) : picker ? (
        <ProductPicker
          onProduct={(product) =>
            open(
              mode === 'fridge'
                ? pantry.stock.find((item) => item.id === product.id)
                : undefined,
              undefined,
              product,
            )
          }
        />
      ) : (
        <>
          <PrimaryButton
            label="Добавить из каталога"
            onPress={() => setPicker(true)}
            disabled={disabled}
          />
          {mode === 'shopping' && (
            <>
              <PrimaryButton
                secondary
                label="Добавить вручную"
                onPress={() => open()}
                disabled={disabled}
              />
              <Card>
                <AppText variant="section">
                  {estimateLabel(
                    estimateCost(
                      pantry.shopping.filter((item) => !item.bought),
                      pantry.prices,
                    ),
                  )}
                </AppText>
                <AppText tone="muted">Оставшиеся покупки</AppText>
              </Card>
              {!pantry.shopping.length && (
                <AppText tone="muted">
                  Список пуст. Добавьте позицию вручную или из рецепта.
                </AppText>
              )}
              {[...new Set(pantry.shopping.map((row) => row.category))]
                .sort((a, b) => a.localeCompare(b, 'ru'))
                .map((group) => (
                  <Card key={group}>
                    <SectionHeader title={group} />
                    {pantry.shopping
                      .filter((item) => item.category === group)
                      .map((item) => (
                        <Card key={item.key}>
                          <AppText variant="action">
                            {item.name} · {formatNumber(item.grams)} г
                          </AppText>
                          <PrimaryButton
                            secondary
                            label={
                              item.bought
                                ? 'Вернуть в покупки'
                                : 'Отметить купленным'
                            }
                            disabled={disabled}
                            onPress={() =>
                              void action.run(
                                () =>
                                  session.change((s) =>
                                    changePantry(s, (data) => ({
                                      ...data,
                                      shopping: data.shopping.map((row) =>
                                        row.key === item.key
                                          ? { ...row, bought: !row.bought }
                                          : row,
                                      ),
                                    })),
                                  ),
                                item.bought
                                  ? 'Позиция возвращена.'
                                  : 'Позиция куплена.',
                              )
                            }
                          />
                          <PrimaryButton
                            secondary
                            label={`Изменить количество: ${item.name}`}
                            onPress={() => open(item, item.key)}
                            disabled={disabled}
                          />
                          <PrimaryButton
                            secondary
                            label={`Убрать из списка: ${item.name}`}
                            disabled={disabled}
                            onPress={() =>
                              void action.run(
                                () =>
                                  session.change((s) =>
                                    changePantry(s, (data) => ({
                                      ...data,
                                      shopping: data.shopping.filter(
                                        (row) => row.key !== item.key,
                                      ),
                                    })),
                                  ),
                                'Позиция удалена.',
                              )
                            }
                          />
                        </Card>
                      ))}
                  </Card>
                ))}
              {pantry.shopping.some((row) => row.bought) && (
                <PrimaryButton
                  secondary
                  label="Очистить купленные"
                  disabled={disabled}
                  onPress={() =>
                    void action.run(
                      () =>
                        session.change((s) =>
                          changePantry(s, (data) => ({
                            ...data,
                            shopping: data.shopping.filter(
                              (row) => !row.bought,
                            ),
                          })),
                        ),
                      'Купленные позиции очищены.',
                    )
                  }
                />
              )}
              <PrimaryButton
                secondary
                label="Ингредиенты из рецепта"
                expanded={recipePicker}
                onPress={() => {
                  setRecipePicker(!recipePicker);
                  setPage(0);
                }}
              />
            </>
          )}
          {mode === 'fridge' && (
            <>
              <SectionHeader title="Запасы" />
              {!pantry.stock.length && (
                <AppText tone="muted">
                  Добавьте продукты с количеством, чтобы увидеть подходящие
                  рецепты.
                </AppText>
              )}
              {pantry.stock.map((item) => (
                <Card key={item.id}>
                  <AppText variant="action">
                    {item.name} · {formatNumber(item.grams)} г
                  </AppText>
                  <PrimaryButton
                    secondary
                    label={`Изменить запас: ${item.name}`}
                    disabled={disabled}
                    onPress={() =>
                      open(
                        item,
                        undefined,
                        products.find((product) => product.id === item.id),
                      )
                    }
                  />
                  <PrimaryButton
                    secondary
                    label={`Удалить запас: ${item.name}`}
                    disabled={disabled}
                    onPress={() =>
                      void action.run(
                        () =>
                          session.change((s) =>
                            changePantry(s, (data) => ({
                              ...data,
                              stock: data.stock.filter(
                                (row) => row.id !== item.id,
                              ),
                            })),
                          ),
                        'Запас удалён.',
                      )
                    }
                  />
                </Card>
              ))}
            </>
          )}
          {(recipePicker || (mode === 'fridge' && pantry.stock.length > 0)) && (
            <>
              <SectionHeader title="Рецепты" />
              <FormField
                name="pantry-recipe"
                label="Название рецепта"
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setPage(0);
                }}
              />
              <PrimaryButton
                secondary
                label="Фильтры рецептов"
                expanded={filterOpen}
                onPress={() => setFilterOpen(!filterOpen)}
              />
              {filterOpen &&
                pantryFilters.map(({ key, label }) => (
                  <FormField
                    key={key}
                    name={key}
                    label={label}
                    inputMode="decimal"
                    value={fields[key] ?? ''}
                    onChangeText={(value) => {
                      setFields({ ...fields, [key]: value });
                      setPage(0);
                    }}
                  />
                ))}
              {!ready.length && (
                <AppText tone="muted">
                  Подходящих рецептов нет. Измените запрос, фильтры или запасы.
                </AppText>
              )}
              {ready.slice(page * 8, (page + 1) * 8).map(({ row, match }) => {
                return (
                  <Card key={row.recipe.id}>
                    <AppText variant="section">{row.recipe.name}</AppText>
                    <NutritionValues
                      caption="На порцию"
                      values={row.nutrition}
                    />
                    <AppText tone="muted">
                      {row.time
                        ? `${row.time} мин`
                        : 'Время приготовления не указано'}
                    </AppText>
                    {match && (
                      <>
                        <AppText tone="accentText">
                          {match.percent}% по массе ингредиентов · на весь
                          рецепт
                        </AppText>
                        <AppText>
                          {match.missing.length
                            ? match.missing
                                .map(
                                  (item) =>
                                    `${item.name} · ${formatNumber(item.grams)} г`,
                                )
                                .join(', ')
                            : 'Все ингредиенты есть'}
                        </AppText>
                      </>
                    )}
                    {(!match || match.missing.length > 0) && (
                      <PrimaryButton
                        secondary
                        disabled={disabled}
                        label={
                          match
                            ? 'Добавить недостающее в покупки'
                            : 'Добавить ингредиенты в покупки'
                        }
                        onPress={() =>
                          void action.run(
                            () =>
                              session.change((s) =>
                                changePantry(s, (data) => {
                                  const recipe = resolveRecipe(
                                    s,
                                    row.recipe.id,
                                  );
                                  if (!recipe)
                                    throw new Error(
                                      'Рецепт больше недоступен.',
                                    );
                                  const items =
                                    match?.missing ??
                                    ingredientQuantities(
                                      recipe.ingredients,
                                      categories,
                                    );
                                  return {
                                    ...data,
                                    shopping: mergeShopping(
                                      data.shopping,
                                      items,
                                    ),
                                  };
                                }),
                              ),
                            'Ингредиенты добавлены в покупки.',
                          )
                        }
                      />
                    )}
                  </Card>
                );
              })}
              {page > 0 && (
                <PrimaryButton
                  secondary
                  label="Предыдущие рецепты"
                  onPress={() => setPage(page - 1)}
                />
              )}
              {(page + 1) * 8 < ready.length && (
                <PrimaryButton
                  secondary
                  label="Следующие рецепты"
                  onPress={() => setPage(page + 1)}
                />
              )}
            </>
          )}
        </>
      )}
    </FoodForm>
  );
}
