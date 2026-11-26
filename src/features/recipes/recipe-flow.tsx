import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup } from '@/components/form-controls';
import { EmptyState } from '@/components/info-cards';
import { useFoodDiary } from '@/features/food/food-context';
import { FoodForm } from '@/features/food/food-form';
import type { MealType } from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { spacing } from '@/theme';
import { calculateRecipe } from './domain';
import { RecipeDetail } from './recipe-detail';
import { RecipeEditor } from './recipe-editor';
import { RecipeLog } from './recipe-log';
import { SearchField, recipeYield } from './recipe-controls';
import type { Recipe } from './model';

type Page =
  | { kind: 'list' | 'create' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; original: Recipe }
  | { kind: 'log'; id: string; original?: Recipe; fromDetail?: boolean };
const filters = [
  { value: 'all', label: 'Все рецепты' },
  { value: 'favorite', label: 'Избранные рецепты' },
  { value: 'recent', label: 'Недавно использованные' },
] as const;
const sorts = [
  { value: 'name', label: 'По названию' },
  { value: 'created', label: 'По дате создания' },
  { value: 'usage', label: 'По частоте использования' },
] as const;
const pageSize = 20;

export function RecipeFlow({
  date,
  meal = 'breakfast',
  choose = false,
  onClose,
  onLogged,
}: {
  date: string;
  meal?: MealType;
  choose?: boolean;
  onClose(): void;
  onLogged(message: string, date: string): void;
}) {
  const session = useFoodDiary();
  const [page, setPage] = useState<Page>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const [filter, setFilter] =
    useState<(typeof filters)[number]['value']>('all');
  const [sort, setSort] = useState<(typeof sorts)[number]['value']>('created');
  const [sortOpen, setSortOpen] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const [notice, setNotice] = useState('');
  const recipes = session?.state.recipes ?? [];
  const selected =
    'id' in page ? recipes.find((r) => r.id === page.id) : undefined;
  const disabled = session?.pending || session?.loading || !!session?.failure;
  function open(recipe: Recipe) {
    setPage({ kind: 'detail', id: recipe.id });
  }
  function list(message = '') {
    setNotice(message);
    setPage({ kind: 'list' });
  }
  if (page.kind === 'create' || page.kind === 'edit') {
    const original = page.kind === 'edit' ? page.original : undefined;
    return (
      <RecipeEditor
        key={original?.id ?? 'new'}
        original={original}
        onBack={() => (original ? open(original) : list())}
        onSaved={(recipe) =>
          choose && !original
            ? setPage({ kind: 'log', id: recipe.id, original: recipe })
            : open(recipe)
        }
      />
    );
  }
  if (page.kind === 'detail' && selected)
    return (
      <RecipeDetail
        recipe={selected}
        onBack={() => list()}
        onList={list}
        onEdit={() => setPage({ kind: 'edit', original: selected })}
        onAdd={() =>
          setPage({
            kind: 'log',
            id: selected.id,
            original: selected,
            fromDetail: true,
          })
        }
      />
    );
  if (page.kind === 'log' && page.original)
    return (
      <RecipeLog
        recipe={page.original}
        date={date}
        meal={meal}
        onBack={() => (page.fromDetail && selected ? open(selected) : list())}
        onSaved={onLogged}
      />
    );

  const usage = new Map<string, { count: number; last: string }>();
  for (const entry of session?.state.entries ?? []) {
    if (!entry.recipe) continue;
    const previous = usage.get(entry.product.id);
    usage.set(entry.product.id, {
      count: (previous?.count ?? 0) + 1,
      last:
        previous && previous.last > entry.createdAt
          ? previous.last
          : entry.createdAt,
    });
  }
  const term = query.trim().toLocaleLowerCase('ru');
  const visible = recipes
    .filter(
      (recipe) =>
        recipe.name.toLocaleLowerCase('ru').includes(term) &&
        (filter !== 'favorite' || recipe.isFavorite) &&
        (filter !== 'recent' || usage.has(recipe.id)),
    )
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'ru');
      if (filter === 'recent')
        return (
          (usage.get(b.id)?.last ?? '').localeCompare(
            usage.get(a.id)?.last ?? '',
          ) || byName
        );
      if (sort === 'name') return byName;
      if (sort === 'usage')
        return (
          (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0) ||
          byName
        );
      return b.createdAt.localeCompare(a.createdAt) || byName;
    });
  return (
    <FoodForm
      readOnly
      title={choose ? 'Выбрать рецепт' : 'Мои рецепты'}
      onBack={onClose}
      error={
        'id' in page && !selected && !session?.loading
          ? 'Рецепт больше недоступен.'
          : undefined
      }
    >
      {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
      <PrimaryButton
        label="Создать рецепт"
        icon="Plus"
        disabled={disabled}
        onPress={() => setPage({ kind: 'create' })}
      />
      {!recipes.length && !session?.loading && !session?.failure && (
        <EmptyState
          title="Рецептов пока нет"
          description="Сохраните ингредиенты и порции любимого блюда, чтобы быстро добавить его в дневник."
          icon="BookOpen"
        />
      )}
      {!!recipes.length && (
        <>
          <SearchField
            name="recipe-query"
            label="Поиск по названию рецепта"
            value={query}
            onChange={(text) => {
              setQuery(text);
              setLimit(pageSize);
            }}
          />
          <ChoiceGroup
            label="Рецепты"
            value={filter}
            options={filters}
            onChange={(value) => {
              setFilter(value);
              setLimit(pageSize);
            }}
          />
          {filter !== 'recent' && (
            <>
              <PrimaryButton
                secondary
                label={`Сортировка: ${sorts.find((option) => option.value === sort)?.label.toLocaleLowerCase('ru')}`}
                expanded={sortOpen}
                onPress={() => setSortOpen(!sortOpen)}
              />
              {sortOpen && (
                <ChoiceGroup
                  label="Сортировка рецептов"
                  value={sort}
                  options={sorts}
                  onChange={(value) => {
                    setSort(value);
                    setLimit(pageSize);
                    setSortOpen(false);
                  }}
                />
              )}
            </>
          )}
          {visible.length === 0 && (
            <AppText tone="muted" accessibilityLiveRegion="polite">
              {term
                ? 'Рецепты по этому запросу не найдены.'
                : filter === 'favorite'
                  ? 'Избранных рецептов пока нет.'
                  : 'Недавно использованных рецептов пока нет.'}
            </AppText>
          )}
          {visible.slice(0, limit).map((recipe) => (
            <Card key={recipe.id}>
              <View style={styles.heading}>
                <View style={styles.title}>
                  <AppText variant="action">{recipe.name}</AppText>
                  <AppText variant="caption" tone="muted">
                    {recipeYield(recipe.servings, recipe.cookedWeightGrams)}
                    {recipe.isFavorite ? ' · В избранном' : ''}
                  </AppText>
                </View>
                <IconButton
                  icon="Plus"
                  label={`Добавить в дневник: ${recipe.name}`}
                  disabled={disabled}
                  onPress={() =>
                    setPage({ kind: 'log', id: recipe.id, original: recipe })
                  }
                />
              </View>
              <NutritionValues
                caption="На одну порцию"
                values={calculateRecipe(recipe).perServing}
              />
              <PrimaryButton
                secondary
                label={`Открыть: ${recipe.name}`}
                disabled={disabled}
                onPress={() => open(recipe)}
              />
            </Card>
          ))}
          {visible.length > limit && (
            <PrimaryButton
              secondary
              label="Показать ещё рецепты"
              onPress={() => setLimit((n) => n + pageSize)}
            />
          )}
        </>
      )}
    </FoodForm>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  title: { flex: 1, minWidth: 0, gap: spacing.tight },
});
