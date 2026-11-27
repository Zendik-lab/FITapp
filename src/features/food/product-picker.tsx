import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { AppIcon } from '@/components/app-icon';
import { Touchable } from '@/components/touchable';
import { PrimaryButton } from '@/components/buttons';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { radii, spacing, useAppTheme } from '@/theme';
import { useFoodDiary } from './food-context';
import { searchFoods } from './domain';
import type { FoodProduct } from './model';
import { NutritionValues } from './nutrition-values';
import { useDebouncedSearch } from './use-debounced-search';
import { rememberProductQuery } from './operations';
import { ActionNotice, type ActionMessage } from '@/components/action-notice';
import { describeError } from '@/database/storage-diagnostics';

type Section = 'search' | 'recent' | 'frequent' | 'favorite' | 'custom';
const PAGE_SIZE = 20;
const sections = [
  { value: 'search', label: 'Поиск' },
  { value: 'recent', label: 'Недавние' },
  { value: 'frequent', label: 'Частые' },
  { value: 'favorite', label: 'Избранное' },
  { value: 'custom', label: 'Мои продукты' },
] as const;
const sorts = [
  { value: 'default', label: 'По соответствию' },
  { value: 'name', label: 'По названию' },
  { value: 'protein', label: 'По белку' },
  { value: 'calories', label: 'По калорийности' },
] as const;

export function ProductPicker({
  onProduct,
  label = 'Название или штрихкод продукта',
  onQueryChange,
  extra,
  selectedIds,
  onlineResults,
}: {
  onProduct(product: FoodProduct): void;
  label?: string;
  onQueryChange?(value: string): void;
  extra?(query: string, section: Section): ReactNode;
  selectedIds?: readonly string[];
  onlineResults?: readonly FoodProduct[];
}) {
  const session = useFoodDiary();
  const [query, setQuery] = useState('');
  const search = useDebouncedSearch(query);
  const searching = query !== search;
  const [section, setSection] = useState<Section>('search');
  const [category, setCategory] = useState('');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<(typeof sorts)[number]['value']>('default');
  const [sorting, setSorting] = useState(false);
  const [notice, setNotice] = useState<ActionMessage | null>(null);
  const fields = useRef(new Map<string, TextInputInstance>());
  const products = session?.products;
  const recent = session?.state.recent;
  const favorites = session?.state.favorites;
  const entries = session?.state.entries;
  const frequency = useMemo(() => {
    const counts = new Map<string, number>();
    if (section === 'frequent')
      for (const entry of entries ?? []) {
        if (!entry.recipe)
          counts.set(entry.product.id, (counts.get(entry.product.id) ?? 0) + 1);
      }
    return counts;
  }, [entries, section]);
  const online = useMemo(
    () =>
      section === 'search'
        ? (onlineResults ?? []).filter(
            (product) => !category || product.category === category,
          )
        : [],
    [section, onlineResults, category],
  );
  const categories = useMemo(
    () =>
      [...new Set(products?.map((product) => product.category))].sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [products],
  );
  const found = useMemo(() => {
    let source = products ?? [];
    if (section === 'recent') {
      const byId = new Map(source.map((product) => [product.id, product]));
      source = (recent ?? []).flatMap((id) => byId.get(id.productId) ?? []);
    }
    if (section === 'favorite') {
      const ids = new Set(favorites?.map((favorite) => favorite.productId));
      source = source.filter((product) => ids.has(product.id));
    }
    if (section === 'custom')
      source = source.filter((product) => product.isCustom);
    if (section === 'frequent')
      source = source
        .filter((product) => frequency.has(product.id))
        .sort(
          (a, b) => (frequency.get(b.id) ?? 0) - (frequency.get(a.id) ?? 0),
        );
    const visibleOnline = new Set(online.map((product) => product.id));
    const result = searchFoods(
      source.filter(
        (product) =>
          (!category || product.category === category) &&
          !visibleOnline.has(product.id),
      ),
      search,
    );
    if (sort === 'name')
      result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (sort === 'protein')
      result.sort((a, b) => b.per100.protein - a.per100.protein);
    if (sort === 'calories')
      result.sort((a, b) => b.per100.calories - a.per100.calories);
    return result;
  }, [
    products,
    recent,
    favorites,
    search,
    section,
    category,
    online,
    sort,
    frequency,
  ]);
  const pageCount = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
  const page = Math.min(pageIndex, pageCount - 1);
  const start = page * PAGE_SIZE;

  function changeQuery(value: string) {
    setQuery(value);
    onQueryChange?.(value);
    setPageIndex(0);
  }
  function remember() {
    if (
      !query.trim() ||
      !session ||
      session.pending ||
      session.loading ||
      session.failure
    )
      return;
    void session
      .change((state) => rememberProductQuery(state, query))
      .catch((error: unknown) =>
        setNotice({ text: describeError(error), kind: 'error' }),
      );
  }
  function select(product: FoodProduct) {
    remember();
    onProduct(product);
  }
  return (
    <>
      <FieldFocusContext value={fields}>
        <FormField
          name="product-picker-query"
          label={label}
          value={query}
          onChangeText={changeQuery}
          onSubmitEditing={remember}
        />
      </FieldFocusContext>
      <ActionNotice message={notice} dismiss={() => setNotice(null)} />
      {!query &&
        section === 'search' &&
        !!session?.state.productSearchHistory?.length && (
          <>
            <AppText variant="caption" tone="muted">
              Недавние запросы
            </AppText>
            {session.state.productSearchHistory.slice(0, 4).map((item) => (
              <PrimaryButton
                key={item}
                secondary
                label={`Искать снова: ${item}`}
                onPress={() => changeQuery(item)}
              />
            ))}
          </>
        )}
      {!!query && (
        <PrimaryButton
          secondary
          label="Очистить поиск"
          onPress={() => {
            changeQuery('');
            fields.current.get('product-picker-query')?.focus();
          }}
        />
      )}
      <ChoiceGroup
        label="Раздел продуктов"
        compact
        value={section}
        options={sections}
        onChange={(value) => {
          setSection(value);
          onQueryChange?.(query);
          setPageIndex(0);
        }}
      />
      <PrimaryButton
        secondary
        label={category || 'Все категории продуктов'}
        expanded={categoriesOpen}
        onPress={() => setCategoriesOpen(!categoriesOpen)}
      />
      {categoriesOpen && (
        <ChoiceGroup
          label="Категория продукта"
          value={category}
          options={[
            { value: '', label: 'Все категории' },
            ...categories.map((value) => ({ value, label: value })),
          ]}
          onChange={(value) => {
            setCategory(value);
            setCategoriesOpen(false);
            setPageIndex(0);
          }}
        />
      )}
      {extra?.(query, section)}
      <PrimaryButton
        secondary
        label="Сортировка продуктов"
        expanded={sorting}
        onPress={() => setSorting(!sorting)}
      />
      {sorting && (
        <ChoiceGroup
          compact
          label="Порядок продуктов"
          value={sort}
          options={sorts}
          onChange={(value) => {
            setSort(value);
            setPageIndex(0);
            setSorting(false);
          }}
        />
      )}
      {!!online.length && (
        <>
          <AppText variant="section" accessibilityRole="header">
            Результаты Open Food Facts
          </AppText>
          {online.map((product) => (
            <ProductRow key={product.id} product={product} onProduct={select} />
          ))}
        </>
      )}
      {!session?.loading && !searching && (
        <AppText
          variant="caption"
          tone="muted"
          accessibilityRole="status"
          accessibilityLiveRegion="polite"
        >
          Найдено локально: {found.length}
        </AppText>
      )}
      {found.length === 0 && !session?.loading && !searching && (
        <AppText tone="muted">
          Продукты не найдены. Измените запрос, раздел или создайте продукт.
        </AppText>
      )}
      {!searching && pageCount > 1 && (
        <View style={styles.pager}>
          <PrimaryButton
            secondary
            icon="ChevronLeft"
            label="Предыдущие продукты"
            disabled={page === 0}
            onPress={() => setPageIndex(page - 1)}
          />
          <AppText
            variant="caption"
            tone="muted"
            accessibilityLiveRegion="polite"
          >
            {page + 1} / {pageCount}
          </AppText>
          <PrimaryButton
            secondary
            icon="ChevronRight"
            label="Следующие продукты"
            disabled={page + 1 === pageCount}
            onPress={() => setPageIndex(page + 1)}
          />
        </View>
      )}
      {!searching &&
        found
          .slice(start, start + PAGE_SIZE)
          .map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              selected={selectedIds?.includes(product.id)}
              onProduct={select}
            />
          ))}
    </>
  );
}

const ProductRow = memo(function ProductRow({
  product,
  selected,
  onProduct,
}: {
  product: FoodProduct;
  selected?: boolean;
  onProduct(product: FoodProduct): void;
}) {
  const { colors } = useAppTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={(selected ? 'Убрать: ' : 'Выбрать: ') + product.name}
      accessibilityState={{ selected }}
      onPress={() => onProduct(product)}
      style={({ pressed }) => [
        styles.product,
        {
          backgroundColor:
            selected || pressed ? colors.accentSurface : colors.surface,
        },
      ]}
    >
      <View style={styles.title}>
        <AppText variant="action">{product.name}</AppText>
        <AppText variant="caption" tone="muted">
          {[product.category, product.brand, product.source]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        <NutritionValues caption="На 100 г" values={product.per100} />
      </View>
      <AppIcon name={selected ? 'Check' : 'ChevronRight'} size={18} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  title: { flex: 1, minWidth: 0, gap: spacing.tight },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.compact,
    gap: spacing.compact,
    borderRadius: radii.action,
  },
  pager: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.small,
  },
});
