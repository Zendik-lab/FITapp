import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { parseDecimal } from '@/features/food/domain';
import type { FoodProduct } from '@/features/food/model';
import { radii, spacing, touchSize, useAppTheme } from '@/theme';
import { recipeCategories, type RecipeCategory } from './model';
import {
  collections,
  numericFilters,
  type NumericFilter,
  type RecipeFilters,
} from './recipe-search';

export type IngredientFilter = 'required' | 'excluded' | 'pantry';
export type NumericDraft = Partial<Record<NumericFilter, string>>;

export function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress(): void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accentSurface : colors.surface,
          opacity: pressed ? 0.68 : 1,
        },
      ]}
    >
      <AppText variant="caption" tone={active ? 'accentText' : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

function art(
  category: RecipeCategory,
): [AppIconName, 'accentSurface' | 'surface' | 'background'] {
  switch (category) {
    case 'Завтраки':
      return ['Sunrise', 'accentSurface'];
    case 'Салаты':
    case 'Гарниры':
    case 'Блюда без приготовления':
      return ['Carrot', 'background'];
    case 'Протеиновые коктейли':
    case 'Высококалорийные коктейли':
    case 'Напитки':
      return ['Droplet', 'accentSurface'];
    case 'Выпечка':
    case 'Десерты':
    case 'Перекусы':
      return ['Sun', 'background'];
    default:
      return ['Utensils', 'accentSurface'];
  }
}

export function RecipeArtwork({
  category,
  large = false,
}: {
  category: RecipeCategory;
  large?: boolean;
}) {
  const { colors } = useAppTheme();
  const [icon, surface] = art(category);
  return (
    <View
      accessible={false}
      aria-hidden
      style={[
        styles.art,
        { backgroundColor: colors[surface], height: large ? 124 : 72 },
      ]}
    >
      <AppIcon name={icon} size={large ? 49 : 29} />
    </View>
  );
}

export function CategoryStrip({
  categories,
  onChange,
}: {
  categories: readonly string[];
  onChange(value: readonly string[]): void;
}) {
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.strip}
      accessibilityLabel="Категории рецептов"
    >
      <ToggleChip
        label="Все категории"
        active={!categories.length}
        onPress={() => onChange([])}
      />
      {recipeCategories.map((category) => (
        <ToggleChip
          key={category}
          label={category}
          active={categories.includes(category)}
          onPress={() => onChange(toggleValue(categories, category))}
        />
      ))}
    </ScrollView>
  );
}

export function toggleValue(values: readonly string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

export function FilterPanel({
  filters,
  cuisines,
  draft,
  onDraft,
  onChange,
  onPick,
  onApply,
}: {
  filters: RecipeFilters;
  cuisines: readonly string[];
  draft: NumericDraft;
  onDraft(value: NumericDraft): void;
  onChange(value: RecipeFilters): void;
  onPick(value: IngredientFilter): void;
  onApply(): void;
}) {
  const invalid = (key: NumericFilter) => {
    const text = draft[key]?.trim();
    if (!text) return undefined;
    const number = parseDecimal(text);
    return !Number.isFinite(number) ||
      number < 0 ||
      (key === 'maxIngredients' && !Number.isInteger(number))
      ? 'Введите неотрицательное число.'
      : undefined;
  };
  const badRange = (['Calories', 'Fat', 'Carbs'] as const).some((item) => {
    const min = draft[`min${item}`];
    const max = draft[`max${item}`];
    return (
      !!min?.trim() && !!max?.trim() && parseDecimal(min) > parseDecimal(max)
    );
  });
  return (
    <View style={styles.fields}>
      <AppText variant="section" accessibilityRole="header">
        Фильтры
      </AppText>
      {numericFilters.map(({ key, label }) => (
        <FormField
          key={key}
          name={key}
          label={label}
          inputMode={key === 'maxIngredients' ? 'numeric' : 'decimal'}
          value={draft[key] ?? ''}
          error={invalid(key)}
          onChangeText={(value) => onDraft({ ...draft, [key]: value })}
        />
      ))}
      {badRange && (
        <AppText tone="error" accessibilityRole="alert">
          Минимум должен быть не больше максимума.
        </AppText>
      )}
      <ChoiceGroup
        label="Сложность"
        value={filters.difficulty ?? ''}
        options={['', 'Простой', 'Средний', 'Сложный'].map((value) => ({
          value,
          label: value || 'Любая',
        }))}
        onChange={(value) =>
          onChange({ ...filters, difficulty: value || undefined })
        }
      />
      {!!cuisines.length && (
        <>
          <AppText variant="section" accessibilityRole="header">
            Национальные кухни
          </AppText>
          <View style={styles.chips}>
            {cuisines.map((cuisine) => (
              <ToggleChip
                key={cuisine}
                label={cuisine}
                active={filters.cuisines?.includes(cuisine) ?? false}
                onPress={() =>
                  onChange({
                    ...filters,
                    cuisines: toggleValue(filters.cuisines ?? [], cuisine),
                  })
                }
              />
            ))}
          </View>
        </>
      )}
      <ChoiceGroup
        label="Источник рецепта"
        value={filters.origin ?? 'all'}
        options={[
          { value: 'all', label: 'Любой источник' },
          { value: 'builtin', label: 'Только встроенные' },
          { value: 'own', label: 'Только собственные' },
        ]}
        onChange={(value) =>
          onChange({ ...filters, origin: value === 'all' ? undefined : value })
        }
      />
      <AppText variant="section" accessibilityRole="header">
        Подборки
      </AppText>
      <View style={styles.chips}>
        {collections.map((tag) => (
          <ToggleChip
            key={tag}
            label={tag}
            active={filters.tags?.includes(tag) ?? false}
            onPress={() =>
              onChange({
                ...filters,
                tags: toggleValue(filters.tags ?? [], tag),
              })
            }
          />
        ))}
        <ToggleChip
          label="Только избранные"
          active={!!filters.favorite}
          onPress={() => onChange({ ...filters, favorite: !filters.favorite })}
        />
        <ToggleChip
          label="Без приготовления"
          active={!!filters.noCook}
          onPress={() => onChange({ ...filters, noCook: !filters.noCook })}
        />
      </View>
      <PrimaryButton
        secondary
        label="Обязательные ингредиенты"
        onPress={() => onPick('required')}
      />
      <PrimaryButton
        secondary
        label="Исключённые ингредиенты"
        onPress={() => onPick('excluded')}
      />
      {!!filters.excluded?.length && (
        <AppText variant="caption" tone="muted">
          Для пищевой аллергии сверяйте состав и маркировку всех продуктов.
        </AppText>
      )}
      <PrimaryButton
        label="Применить фильтры"
        disabled={badRange || numericFilters.some(({ key }) => !!invalid(key))}
        onPress={onApply}
      />
    </View>
  );
}

export function FilterTags({
  filters,
  products,
  onChange,
}: {
  filters: RecipeFilters;
  products: readonly FoodProduct[];
  onChange(value: RecipeFilters): void;
}) {
  const tags = [
    ...numericFilters.flatMap(({ key, label }) =>
      filters[key] === undefined
        ? []
        : [
            {
              id: key,
              label: `${label} ${filters[key]}`,
              remove: () => onChange({ ...filters, [key]: undefined }),
            },
          ],
    ),
    ...(
      ['categories', 'cuisines', 'tags', 'required', 'excluded'] as const
    ).flatMap((key) =>
      (filters[key] ?? []).map((value) => {
        const product = products.find((item) => item.id === value);
        return {
          id: `${key}:${value}`,
          label: product
            ? `${key === 'required' ? 'Добавить' : 'Исключить'} ${product.name}`
            : value,
          remove: () =>
            onChange({
              ...filters,
              [key]: toggleValue(filters[key] ?? [], value),
            }),
        };
      }),
    ),
    ...(
      [
        ['difficulty', filters.difficulty],
        ['favorite', filters.favorite && 'Только избранные'],
        ['noCook', filters.noCook && 'Без приготовления'],
        [
          'origin',
          filters.origin &&
            (filters.origin === 'own'
              ? 'Только собственные'
              : 'Только встроенные'),
        ],
        ['recommendation', filters.recommendation],
      ] as const
    ).flatMap(([key, label]) =>
      label
        ? [
            {
              id: key,
              label,
              remove: () => onChange({ ...filters, [key]: undefined }),
            },
          ]
        : [],
    ),
  ];
  if (!tags.length) return null;
  return (
    <View style={styles.chips}>
      {tags.map((tag) => (
        <ToggleChip
          key={tag.id}
          label={`${tag.label} ×`}
          active
          onPress={tag.remove}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchSize,
    paddingHorizontal: spacing.compact,
    borderRadius: radii.action,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chips: { flexDirection: 'row', gap: spacing.tight, flexWrap: 'wrap' },
  strip: { flexDirection: 'row', gap: spacing.tight },
  fields: { gap: spacing.compact },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.action,
  },
});
