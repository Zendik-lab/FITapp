import { useEffect, useMemo, useState } from 'react';
import { useDebouncedSearch } from '@/features/food/use-debounced-search';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppText } from '@/components/app-text';
import { ScreenStack } from '@/components/screen-stack';
import { IconButton, PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { ChoiceGroup } from '@/components/form-controls';
import { getSettingsStorage } from '@/database/settings-storage';
import { describeError } from '@/database/storage-diagnostics';
import { formatNumber } from '@/features/calendar/calendar';
import { useFoodDiary } from '@/features/food/food-context';
import { parseDecimal, sumEntries } from '@/features/food/domain';
import { FoodForm } from '@/features/food/food-form';
import { emptyFoodState, type MealType } from '@/features/food/model';
import { NutritionValues } from '@/features/food/nutrition-values';
import { ProductPicker } from '@/features/food/product-picker';
import { ProductEditor } from '@/features/food/product-editor';
import { useNutrition } from '@/features/nutrition/nutrition-context';
import { spacing } from '@/theme';
import {
  builtinRecipeCuisines,
  builtinRecipeSearchInputs,
  getBuiltinRecipe,
  recipeCuisines,
  setRecipeExpansion,
} from './library';
import { recipeExpansion } from './library-expansion-manifest';
import type { Recipe } from './model';
import { rememberRecipeQuery, setRecipeFavorite } from './operations';
import { SearchField } from './recipe-controls';
import { RecipeDetail } from './recipe-detail';
import { RecipeEditor } from './recipe-editor';
import { RecipeLog } from './recipe-log';
import {
  CategoryStrip,
  FilterPanel,
  FilterTags,
  RecipeArtwork,
  ToggleChip,
  toggleValue,
  type IngredientFilter,
  type NumericDraft,
} from './recipe-library-controls';
import {
  buildRecipeIndex,
  collections,
  findRecipes,
  numericFilters,
  recommendations,
  sortOptions,
  type RecipeFilters,
  type RecipeSort,
} from './recipe-search';

type Page =
  | { kind: 'list' | 'create' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; original: Recipe }
  | { kind: 'log'; original: Recipe; fromDetail?: boolean }
  | { kind: 'pick' | 'create-product'; target: IngredientFilter };

const sections = [
  { value: 'all', label: 'Все рецепты' },
  { value: 'own', label: 'Мои рецепты' },
  { value: 'favorite', label: 'Избранное' },
] as const;
const pickerTitles: Record<IngredientFilter, string> = {
  required: 'Обязательные ингредиенты',
  excluded: 'Исключённые ингредиенты',
  pantry: 'Что есть дома',
};
const quickQueries = [
  'Курица',
  'Рис с мясом',
  'Банан молоко овсянка',
  'Коктейль для массы',
];
const pageSize = 16;
const empty = emptyFoodState();
const noProducts = [] as const;

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
  const goals = useNutrition()?.snapshot?.targets;
  const { width } = useWindowDimensions();
  const [page, setPage] = useState<Page>({ kind: 'list' });
  const [query, setQuery] = useState('');
  const search = useDebouncedSearch(query);
  const [section, setSection] =
    useState<NonNullable<RecipeFilters['section']>>('all');
  const [sort, setSort] = useState<RecipeSort>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [filters, setFilters] = useState<RecipeFilters>({});
  const [draft, setDraft] = useState<NumericDraft>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expansionVersion, setExpansionVersion] = useState<string>();
  const [checkingExpansion, setCheckingExpansion] = useState(!choose);
  const [expansionProgress, setExpansionProgress] = useState<number | null>(
    null,
  );
  const [pantry, setPantry] = useState<readonly string[] | null>(null);
  const [ignoreBasics, setIgnoreBasics] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const expanded = expansionVersion !== undefined;
  useEffect(() => {
    if (choose) return;
    let active = true;
    void getSettingsStorage()
      .then(async (storage) =>
        (await import('./recipe-pack')).readRecipePack(storage),
      )
      .then((pack) => {
        if (!active) return;
        setRecipeExpansion(pack?.rows);
        setExpansionVersion(pack?.version);
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      })
      .finally(() => {
        if (active) setCheckingExpansion(false);
      });
    return () => {
      active = false;
    };
  }, [choose]);
  const state = session?.state ?? empty;
  const products = session?.products ?? noProducts;
  const { recipes, entries, favoriteRecipeIds } = state;
  const index = useMemo(
    () =>
      buildRecipeIndex(
        (function* () {
          yield* recipes;
          yield* builtinRecipeSearchInputs(expanded);
        })(),
        products,
        { entries, favoriteRecipeIds },
      ),
    [products, recipes, entries, favoriteRecipeIds, expanded],
  );
  const cuisines = useMemo(
    () => (expanded ? recipeCuisines(true) : builtinRecipeCuisines),
    [expanded],
  );
  const remaining = useMemo(() => {
    if (!goals) return undefined;
    const consumed = sumEntries(state.entries, date);
    return {
      calories: goals.calories - consumed.calories,
      protein: goals.protein - consumed.protein,
    };
  }, [state.entries, date, goals]);
  const visible = useMemo(
    () =>
      findRecipes(index, {
        ...filters,
        query: search,
        section,
        sort: pantry?.length && sort === 'relevance' ? 'pantry' : sort,
        pantry: pantry?.length ? pantry : undefined,
        ignoreBasics,
        remaining,
      }),
    [index, filters, search, section, sort, pantry, ignoreBasics, remaining],
  );
  const resultPage = Math.min(
    pageIndex,
    Math.max(0, Math.ceil(visible.length / pageSize) - 1),
  );
  const start = resultPage * pageSize;
  const disabled =
    !session || session.pending || session.loading || !!session.failure;
  function resolveRecipe(id: string) {
    return (
      getBuiltinRecipe(id) ?? state.recipes.find((recipe) => recipe.id === id)
    );
  }
  const selected = page.kind === 'detail' ? resolveRecipe(page.id) : undefined;

  function list(message = '') {
    setNotice(message);
    setError('');
    setPage({ kind: 'list' });
  }
  async function change(
    operation: Parameters<NonNullable<typeof session>['change']>[0],
  ) {
    if (disabled || !session) return;
    setError('');
    try {
      await session.change(operation);
    } catch (cause) {
      setError(describeError(cause));
    }
  }
  function remember(term: string) {
    if (term.trim() && term.trim() !== state.recipeSearchHistory?.[0])
      void change((current) => rememberRecipeQuery(current, term));
  }
  function setFilterValues(value: RecipeFilters) {
    setFilters(value);
    setPageIndex(0);
  }
  function setSearch(value: string) {
    setQuery(value.slice(0, 120));
    setPageIndex(0);
  }
  async function changeExpansion(remove = false) {
    if (checkingExpansion || expansionProgress !== null) return;
    setError('');
    setCheckingExpansion(true);
    try {
      const { installRecipePack, removeRecipePack } =
        await import('./recipe-pack');
      const storage = await getSettingsStorage();
      if (remove) {
        await removeRecipePack(storage);
        setRecipeExpansion();
        setExpansionVersion(undefined);
        setFilterValues({
          ...filters,
          cuisines: filters.cuisines?.filter((cuisine) =>
            builtinRecipeCuisines.includes(cuisine),
          ),
        });
        setNotice('Пакет рецептов удалён.');
      } else {
        setExpansionProgress(0);
        const pack = await installRecipePack(
          storage,
          undefined,
          setExpansionProgress,
        );
        setRecipeExpansion(pack.rows);
        setExpansionVersion(pack.version);
        setPageIndex(0);
        setNotice('Пакет рецептов доступен офлайн.');
      }
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setCheckingExpansion(false);
      setExpansionProgress(null);
    }
  }
  function setIngredient(target: IngredientFilter, id: string) {
    if (target === 'pantry')
      setPantry((current) => toggleValue(current ?? [], id));
    else
      setFilters((current) => ({
        ...current,
        [target]: toggleValue(current[target] ?? [], id),
      }));
    setPageIndex(0);
  }
  function open(recipe: Pick<Recipe, 'id'>) {
    setPage({ kind: 'detail', id: recipe.id });
  }
  function renderDetail() {
    if (page.kind === 'create' || page.kind === 'edit') {
      const original = page.kind === 'edit' ? page.original : undefined;
      return (
        <RecipeEditor
          key={original?.id ?? 'new'}
          original={original}
          onBack={() => (original ? open(original) : list())}
          onSaved={(recipe) =>
            choose && !original
              ? setPage({ kind: 'log', original: recipe })
              : open(recipe)
          }
        />
      );
    }
    if (page.kind === 'detail' && selected) {
      return (
        <RecipeDetail
          key={selected.id}
          recipe={selected}
          available={pantry?.length ? pantry : undefined}
          ignoreBasics={ignoreBasics}
          onBack={() => list()}
          onList={list}
          onEdit={() => setPage({ kind: 'edit', original: selected })}
          onAdd={() =>
            setPage({ kind: 'log', original: selected, fromDetail: true })
          }
        />
      );
    }
    if (page.kind === 'log') {
      return (
        <RecipeLog
          recipe={page.original}
          date={date}
          meal={meal}
          onBack={() => (page.fromDetail ? open(page.original) : list())}
          onSaved={onLogged}
        />
      );
    }
    if (page.kind === 'create-product') {
      const { target } = page;
      return (
        <ProductEditor
          onBack={() => setPage({ kind: 'pick', target })}
          onSaved={(product) => {
            setIngredient(target, product.id);
            setPage({ kind: 'pick', target });
          }}
        />
      );
    }
    if (page.kind === 'pick') {
      const { target } = page;
      const ids = (target === 'pantry' ? pantry : filters[target]) ?? [];
      return (
        <FoodForm title={pickerTitles[target]} onBack={() => list()}>
          <View style={styles.row}>
            {ids.map((id) => (
              <ToggleChip
                key={id}
                active
                label={
                  (products.find((product) => product.id === id)?.name ?? id) +
                  ' ×'
                }
                onPress={() => setIngredient(target, id)}
              />
            ))}
          </View>
          <PrimaryButton label="Готово" onPress={() => list()} />
          <PrimaryButton
            secondary
            label="Создать продукт"
            onPress={() => setPage({ kind: 'create-product', target })}
          />
          <ProductPicker
            selectedIds={ids}
            onProduct={(product) => setIngredient(target, product.id)}
          />
        </FoodForm>
      );
    }
    return null;
  }
  const active = Object.keys(filters).some((key) => {
    const value = filters[key as keyof RecipeFilters];
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== false;
  });
  const pantryTitle = (missing: number) =>
    missing === 0
      ? 'Все ингредиенты есть'
      : missing === 1
        ? 'Не хватает одного ингредиента'
        : missing === 2
          ? 'Не хватает двух ингредиентов'
          : 'Не хватает трёх или более ингредиентов';

  return (
    <ScreenStack detail={renderDetail()}>
      <FoodForm
        readOnly
        title={choose ? 'Выбрать рецепт' : 'Рецепты'}
        onBack={onClose}
        error={
          error ||
          (page.kind === 'detail' ? 'Рецепт больше недоступен.' : undefined)
        }
      >
        {!!notice && (
          <AppText accessibilityLiveRegion="polite">{notice}</AppText>
        )}
        <SearchField
          name="recipe-query"
          label="Поиск рецептов"
          value={query}
          onChange={setSearch}
          onSubmit={() => remember(query)}
        />
        {!query && (
          <View style={styles.row}>
            {(state.recipeSearchHistory?.length
              ? state.recipeSearchHistory
              : quickQueries
            ).map((term) => (
              <ToggleChip
                key={term}
                label={term}
                active={false}
                onPress={() => {
                  setSearch(term);
                  remember(term);
                }}
              />
            ))}
            {!!state.recipeSearchHistory?.length && (
              <ToggleChip
                label="Очистить историю"
                active={false}
                onPress={() =>
                  void change((current) => ({
                    ...current,
                    recipeSearchHistory: [],
                  }))
                }
              />
            )}
          </View>
        )}
        <View style={styles.row}>
          {sections.map(({ value, label }) => (
            <ToggleChip
              key={value}
              label={label}
              active={section === value}
              onPress={() => {
                setSection(value);
                setPageIndex(0);
              }}
            />
          ))}
        </View>
        <CategoryStrip
          categories={filters.categories ?? []}
          onChange={(categories) => setFilterValues({ ...filters, categories })}
        />
        <View style={styles.row}>
          <PrimaryButton
            secondary
            label="Фильтры"
            expanded={filtersOpen}
            onPress={() => {
              setDraft(
                Object.fromEntries(
                  numericFilters.flatMap(({ key }) =>
                    filters[key] === undefined
                      ? []
                      : [[key, String(filters[key])]],
                  ),
                ),
              );
              setFiltersOpen(!filtersOpen);
            }}
          />
          <PrimaryButton
            secondary
            label="Сортировка"
            expanded={sortOpen}
            onPress={() => setSortOpen(!sortOpen)}
          />
          <PrimaryButton
            secondary
            label="Создать рецепт"
            icon="Plus"
            disabled={disabled}
            onPress={() => setPage({ kind: 'create' })}
          />
        </View>
        {sortOpen && (
          <ChoiceGroup
            label="Сортировка рецептов"
            value={section === 'recent' ? 'recent' : sort}
            options={[
              ...sortOptions,
              { value: 'recent', label: 'Недавно использованные' },
            ]}
            onChange={(value) => {
              if (value === 'recent') setSection('recent');
              else {
                if (section === 'recent') setSection('all');
                setSort(value);
              }
              setPageIndex(0);
              setSortOpen(false);
            }}
          />
        )}
        {filtersOpen && (
          <FilterPanel
            filters={filters}
            cuisines={cuisines}
            draft={draft}
            onDraft={setDraft}
            onChange={setFilterValues}
            onPick={(target) => setPage({ kind: 'pick', target })}
            onApply={() => {
              const values = Object.fromEntries(
                numericFilters.map(({ key }) => [
                  key,
                  draft[key]?.trim() ? parseDecimal(draft[key]) : undefined,
                ]),
              );
              setFilterValues({ ...filters, ...values });
              setFiltersOpen(false);
            }}
          />
        )}
        <FilterTags
          filters={filters}
          products={products}
          onChange={(value) => {
            setFilterValues(value);
            setDraft(
              Object.fromEntries(
                numericFilters.flatMap(({ key }) =>
                  value[key] === undefined ? [] : [[key, String(value[key])]],
                ),
              ),
            );
          }}
        />
        {(active || section !== 'all' || pantry !== null) && (
          <PrimaryButton
            secondary
            label="Сбросить фильтры"
            onPress={() => {
              setFilterValues({});
              setDraft({});
              setSection('all');
              setPantry(null);
              setSort('relevance');
              setIgnoreBasics(true);
            }}
          />
        )}
        <PrimaryButton
          secondary
          label="Что приготовить из того, что есть"
          expanded={pantry !== null}
          onPress={() => {
            setPantry(pantry === null ? [] : null);
            if (pantry !== null && filters.pantryOnly)
              setFilterValues({ ...filters, pantryOnly: undefined });
            setPageIndex(0);
          }}
        />
        {pantry !== null && (
          <Card>
            <AppText tone="muted">
              Совпадения по наличию продуктов. Количество продуктов не
              проверяется.
            </AppText>
            <View style={styles.row}>
              <ToggleChip
                label="Из доступных ингредиентов"
                active={!!filters.pantryOnly}
                onPress={() =>
                  setFilterValues({
                    ...filters,
                    pantryOnly: !filters.pantryOnly,
                  })
                }
              />
              <ToggleChip
                label="Не учитывать воду, соль и чёрный перец"
                active={ignoreBasics}
                onPress={() => {
                  setIgnoreBasics(!ignoreBasics);
                  setPageIndex(0);
                }}
              />
              {pantry.map((id) => (
                <ToggleChip
                  key={id}
                  active
                  label={
                    (products.find((product) => product.id === id)?.name ??
                      id) + ' ×'
                  }
                  onPress={() => setIngredient('pantry', id)}
                />
              ))}
            </View>
            <PrimaryButton
              secondary
              label="Выбрать продукты дома"
              onPress={() => setPage({ kind: 'pick', target: 'pantry' })}
            />
          </Card>
        )}
        {section === 'all' && !query && pantry === null && (
          <View style={styles.section}>
            <AppText variant="section" accessibilityRole="header">
              Подборки
            </AppText>
            <View style={styles.row}>
              {collections.slice(0, 5).map((tag) => (
                <ToggleChip
                  key={tag}
                  label={tag}
                  active={filters.tags?.includes(tag) ?? false}
                  onPress={() =>
                    setFilterValues({
                      ...filters,
                      tags: toggleValue(filters.tags ?? [], tag),
                    })
                  }
                />
              ))}
              {recommendations
                .filter(
                  (value, index) =>
                    index >= 2 ||
                    (index === 0
                      ? (remaining?.calories ?? 0) > 0
                      : (remaining?.protein ?? 0) > 0 &&
                        (remaining?.calories ?? 0) > 0),
                )
                .map((value) => (
                  <ToggleChip
                    key={value}
                    label={value}
                    active={filters.recommendation === value}
                    onPress={() =>
                      setFilterValues({
                        ...filters,
                        recommendation:
                          filters.recommendation === value ? undefined : value,
                      })
                    }
                  />
                ))}
            </View>
          </View>
        )}
        {!choose && (
          <Card>
            <AppText variant="action">Расширенная библиотека</AppText>
            <AppText
              variant="caption"
              tone="muted"
              accessibilityLiveRegion="polite"
            >
              {expansionProgress !== null
                ? `Загрузка · ${expansionProgress}%`
                : expanded
                  ? 'Пакет доступен офлайн'
                  : `${formatNumber(recipeExpansion.count)} рецептов с неполными КБЖУ · ${formatNumber(Math.ceil(recipeExpansion.bytes / 1024))} КБ`}
            </AppText>
            {expansionVersion !== recipeExpansion.version && (
              <PrimaryButton
                secondary
                label={
                  expanded
                    ? 'Обновить пакет рецептов'
                    : 'Скачать пакет рецептов'
                }
                disabled={checkingExpansion}
                onPress={() => void changeExpansion()}
              />
            )}
            {expanded && (
              <PrimaryButton
                secondary
                label="Удалить пакет рецептов"
                disabled={checkingExpansion}
                onPress={() => void changeExpansion(true)}
              />
            )}
          </Card>
        )}
        {session?.loading ? (
          <ActivityIndicator accessibilityLabel="Загрузка рецептов" />
        ) : (
          <AppText
            variant="caption"
            tone="muted"
            accessibilityLiveRegion="polite"
          >
            Найдено рецептов: {visible.length}
          </AppText>
        )}
        {!visible.length && !session?.loading && (
          <AppText tone="muted" accessibilityLiveRegion="polite">
            {query
              ? 'Рецепты по этому запросу не найдены.'
              : section === 'own' && !active
                ? 'Рецептов пока нет'
                : section === 'favorite' && !active
                  ? 'Избранных рецептов пока нет.'
                  : 'Рецепты не найдены. Измените или сбросьте фильтры.'}
          </AppText>
        )}
        {visible.length > pageSize && (
          <View style={styles.row}>
            <PrimaryButton
              secondary
              label="Предыдущая страница"
              disabled={resultPage === 0}
              onPress={() => setPageIndex(resultPage - 1)}
            />
            <PrimaryButton
              secondary
              label="Следующая страница"
              disabled={start + pageSize >= visible.length}
              onPress={() => setPageIndex(resultPage + 1)}
            />
          </View>
        )}
        <View style={styles.grid}>
          {visible
            .slice(start, start + pageSize)
            .map(
              (
                { recipe, nutrition, nutritionComplete, time, favorite, match },
                index,
              ) => {
                const title = match ? pantryTitle(match.missing) : undefined;
                const previous = index
                  ? visible[start + index - 1]?.match
                  : undefined;
                const groupStarts =
                  title &&
                  (!previous || title !== pantryTitle(previous.missing));
                return (
                  <RecipeGridItem
                    key={recipe.id}
                    group={groupStarts ? title : undefined}
                    columns={width >= 540 ? 2 : 1}
                  >
                    <Card style={styles.card}>
                      <RecipeArtwork category={recipe.category} />
                      <View style={styles.heading}>
                        <View style={styles.title}>
                          <AppText variant="action">{recipe.name}</AppText>
                          <AppText variant="caption" tone="muted">
                            {recipe.category}
                            {time !== undefined ? ' · ' + time + ' мин' : ''}
                          </AppText>
                        </View>
                        <IconButton
                          icon={favorite ? 'Check' : 'Heart'}
                          compact
                          label={
                            (favorite
                              ? 'Убрать из избранного: '
                              : 'В избранное: ') + recipe.name
                          }
                          disabled={disabled}
                          onPress={() => {
                            const original = resolveRecipe(recipe.id);
                            if (original)
                              void change((current) =>
                                setRecipeFavorite(current, original, !favorite),
                              );
                          }}
                        />
                      </View>
                      {nutritionComplete ? (
                        <NutritionValues
                          caption="На одну порцию"
                          values={nutrition}
                        />
                      ) : (
                        <AppText variant="caption" tone="muted">
                          КБЖУ рассчитаны частично
                        </AppText>
                      )}
                      {match && (
                        <AppText variant="caption" tone="muted">
                          Есть {match.matched} из {match.total} ·{' '}
                          {match.percent}%
                        </AppText>
                      )}
                      <View style={styles.heading}>
                        <View style={styles.title}>
                          <PrimaryButton
                            secondary
                            label={'Открыть: ' + recipe.name}
                            onPress={() => {
                              open(recipe);
                              remember(query);
                            }}
                          />
                        </View>
                        {nutritionComplete && (
                          <IconButton
                            icon="Plus"
                            label={'Добавить в дневник: ' + recipe.name}
                            disabled={disabled}
                            onPress={() => {
                              const original = resolveRecipe(recipe.id);
                              if (original) setPage({ kind: 'log', original });
                            }}
                          />
                        )}
                      </View>
                    </Card>
                  </RecipeGridItem>
                );
              },
            )}
        </View>
      </FoodForm>
    </ScreenStack>
  );
}

function RecipeGridItem({
  group,
  columns,
  children,
}: {
  group?: string;
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <View style={group || columns === 1 ? styles.full : styles.half}>
      {!!group && (
        <AppText variant="section" accessibilityRole="header">
          {group}
        </AppText>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  section: { gap: spacing.small },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  title: { flex: 1, minWidth: 0, gap: spacing.tight },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.compact },
  full: { width: '100%', gap: spacing.compact },
  half: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%' },
  card: { flex: 1 },
});
