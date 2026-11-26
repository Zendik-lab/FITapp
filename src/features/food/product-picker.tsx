import { useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { spacing } from '@/theme';
import { useFoodDiary } from './food-context';
import { searchFoods } from './domain';
import type { FoodProduct } from './model';
import { NutritionValues } from './nutrition-values';

type Section = 'search' | 'recent' | 'favorite' | 'custom';
const PAGE_SIZE = 20;
const sections = [
  { value: 'search', label: 'Поиск' },
  { value: 'recent', label: 'Недавние' },
  { value: 'favorite', label: 'Избранное' },
  { value: 'custom', label: 'Мои продукты' },
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
  const [section, setSection] = useState<Section>('search');
  const [category, setCategory] = useState('');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fields = useRef(new Map<string, TextInputInstance>());
  const products = session?.products;
  const state = session?.state;
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
      source = (state?.recent ?? []).flatMap(
        (id) => byId.get(id.productId) ?? [],
      );
    }
    if (section === 'favorite') {
      const favorites = new Set(
        state?.favorites.map((favorite) => favorite.productId),
      );
      source = source.filter((product) => favorites.has(product.id));
    }
    if (section === 'custom')
      source = source.filter((product) => product.isCustom);
    const visibleOnline = new Set(online.map((product) => product.id));
    return searchFoods(
      source.filter(
        (product) =>
          (!category || product.category === category) &&
          !visibleOnline.has(product.id),
      ),
      query,
    );
  }, [products, state, query, section, category, online]);

  function changeQuery(value: string) {
    setQuery(value);
    onQueryChange?.(value);
    setLimit(PAGE_SIZE);
  }
  return (
    <>
      <FieldFocusContext value={fields}>
        <FormField
          name="product-picker-query"
          label={label}
          value={query}
          onChangeText={changeQuery}
        />
      </FieldFocusContext>
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
        value={section}
        options={sections}
        onChange={(value) => {
          setSection(value);
          onQueryChange?.(query);
          setLimit(PAGE_SIZE);
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
            setLimit(PAGE_SIZE);
          }}
        />
      )}
      {extra?.(query, section)}
      {!!online.length && (
        <>
          <AppText variant="section" accessibilityRole="header">
            Результаты Open Food Facts
          </AppText>
          {online.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              onProduct={onProduct}
            />
          ))}
        </>
      )}
      <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
        Найдено локально: {found.length}
      </AppText>
      {found.length === 0 && (
        <AppText tone="muted">
          Продукты не найдены. Измените запрос, раздел или создайте продукт.
        </AppText>
      )}
      {found.slice(0, limit).map((product) => (
        <ProductRow
          key={product.id}
          product={product}
          selected={selectedIds?.includes(product.id)}
          onProduct={onProduct}
        />
      ))}
      {found.length > limit && (
        <PrimaryButton
          secondary
          label="Показать ещё продукты"
          onPress={() => setLimit((n) => n + PAGE_SIZE)}
        />
      )}
    </>
  );
}

function ProductRow({
  product,
  selected,
  onProduct,
}: {
  product: FoodProduct;
  selected?: boolean;
  onProduct(product: FoodProduct): void;
}) {
  return (
    <Card>
      <View style={styles.title}>
        <AppText variant="action">{product.name}</AppText>
        <AppText variant="caption" tone="muted">
          {[product.category, product.brand, product.source]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      <NutritionValues caption="На 100 г" values={product.per100} />
      <PrimaryButton
        secondary
        label={(selected ? 'Убрать: ' : 'Выбрать: ') + product.name}
        onPress={() => onProduct(product)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({ title: { gap: spacing.tight } });
