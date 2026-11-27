import { useState } from 'react';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/buttons';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { parseDecimal } from '@/features/food/domain';
import { catalogCountryName } from './catalog-format';
import type { CatalogFilters } from './catalog-service';

const countryOptions = [
  '',
  'kazakhstan',
  'russia',
  'belarus',
  'uzbekistan',
  'kyrgyzstan',
  'ukraine',
  'armenia',
  'azerbaijan',
  'tajikistan',
  'turkmenistan',
  'moldova',
  'georgia',
  'united-states',
  'france',
  'germany',
].map((value) => ({
  value,
  label: value ? catalogCountryName(value) : 'Все страны',
}));
const nutrients = {
  calories: 'Калории',
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
} as const;
type Nutrient = keyof typeof nutrients;
type Bounds = Partial<Record<Nutrient, { min?: string; max?: string }>>;

export function ProductCatalogFilters({
  filters,
  offlineOnly,
  onApply,
}: {
  filters: CatalogFilters;
  offlineOnly: boolean;
  onApply(filters: CatalogFilters, offlineOnly: boolean): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [brand, setBrand] = useState('');
  const [country, setCountry] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [bounds, setBounds] = useState<Bounds>({});
  const [onlyOffline, setOnlyOffline] = useState(offlineOnly);
  const active = !!(
    filters.brand ||
    filters.country ||
    Object.keys(filters.ranges ?? {}).length ||
    offlineOnly
  );
  const ranges: CatalogFilters['ranges'] = {};
  let valid = true;
  for (const key of Object.keys(nutrients) as Nutrient[]) {
    const min = bounds[key]?.min?.trim()
      ? parseDecimal(bounds[key]?.min ?? '')
      : undefined;
    const max = bounds[key]?.max?.trim()
      ? parseDecimal(bounds[key]?.max ?? '')
      : undefined;
    if (min !== undefined || max !== undefined) ranges[key] = { min, max };
    if (
      [min, max].some(
        (value) =>
          value !== undefined && (!Number.isFinite(value) || value < 0),
      ) ||
      (min !== undefined && max !== undefined && max < min)
    )
      valid = false;
  }
  return (
    <>
      <PrimaryButton
        secondary
        label={active ? 'Фильтры продуктов включены' : 'Фильтры продуктов'}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <Card>
          <FormField
            name="catalog-filter-brand"
            label="Бренд"
            value={brand}
            onChangeText={setBrand}
          />
          <PrimaryButton
            secondary
            label={country ? catalogCountryName(country) : 'Страна продажи'}
            expanded={countryOpen}
            onPress={() => setCountryOpen(!countryOpen)}
          />
          {countryOpen && (
            <ChoiceGroup
              label="Страна продажи"
              value={country}
              options={countryOptions}
              onChange={(value) => {
                setCountry(value);
                setCountryOpen(false);
              }}
            />
          )}
          {(Object.keys(nutrients) as Nutrient[]).map((key) => (
            <FormField
              key={key}
              name={`catalog-filter-${key}`}
              label={`${nutrients[key]} на 100 г или мл, до`}
              value={bounds[key]?.max ?? ''}
              inputMode="decimal"
              onChangeText={(max) =>
                setBounds((previous) => ({ ...previous, [key]: { max } }))
              }
              error={
                bounds[key]?.max && !(parseDecimal(bounds[key]?.max ?? '') >= 0)
                  ? 'Введите число от нуля.'
                  : undefined
              }
            />
          ))}
          <ChoiceGroup
            compact
            label="Доступность каталога"
            value={onlyOffline ? 'offline' : 'all'}
            options={[
              { value: 'all', label: 'Все источники' },
              { value: 'offline', label: 'Только офлайн' },
            ]}
            onChange={(value) => setOnlyOffline(value === 'offline')}
          />
          <PrimaryButton
            label="Применить фильтры"
            disabled={!valid}
            onPress={() => {
              onApply({ brand: brand.trim(), country, ranges }, onlyOffline);
              setExpanded(false);
            }}
          />
          {active && (
            <PrimaryButton
              secondary
              label="Сбросить фильтры"
              onPress={() => {
                setBrand('');
                setCountry('');
                setBounds({});
                setOnlyOffline(false);
                onApply({}, false);
                setExpanded(false);
              }}
            />
          )}
        </Card>
      )}
    </>
  );
}
