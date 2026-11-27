import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { categories, type FoodProduct } from './model';
import {
  newId,
  nutrientKeys,
  parseDecimal,
  validateProduct,
  validBarcode,
} from './domain';
import { saveProduct } from './operations';

const labels = {
  calories: 'Калории',
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
};
const conversionLabels = {
  gramsPerMl: 'Плотность, г/мл (необязательно)',
  pieceGrams: 'Вес штуки, г (необязательно)',
  servingGrams: 'Вес порции, г (необязательно)',
  servingMl: 'Объём порции, мл (необязательно)',
} as const;
const massConversions = ['gramsPerMl', 'pieceGrams', 'servingGrams'] as const;
const volumeConversions = ['servingMl'] as const;
const optionalDecimal = (text: string) =>
  text.trim() ? parseDecimal(text) : undefined;
export function ProductEditor({
  product,
  barcode = '',
  massOnly = false,
  onBack,
  onSaved,
}: {
  product?: FoodProduct;
  barcode?: string;
  massOnly?: boolean;
  onBack(): void;
  onSaved(product: FoodProduct): void;
}) {
  const session = useFoodDiary();
  const [initial] = useState(() => ({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    category: product?.category ?? categories[0],
    barcode: product?.barcode ?? barcode,
    baseUnit: product?.baseUnit ?? 'g',
    calories: product ? String(product.per100.calories) : '',
    protein: product ? String(product.per100.protein) : '',
    fat: product ? String(product.per100.fat) : '',
    carbs: product ? String(product.per100.carbs) : '',
    gramsPerMl: product?.gramsPerMl?.toString() ?? '',
    pieceGrams: product?.pieceGrams?.toString() ?? '',
    servingGrams: product?.servingGrams?.toString() ?? '',
    servingMl: product?.servingMl?.toString() ?? '',
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const fields = useRef(new Map<string, TextInputInstance>());
  const [id] = useState(() => product?.id ?? `custom-${newId()}`);
  const now = new Date().toISOString();
  const volume = draft.baseUnit === 'ml';
  const conversionKeys = volume ? volumeConversions : massConversions;
  const value: FoodProduct = {
    ...product,
    id,
    name: draft.name.trim(),
    brand: draft.brand.trim() || undefined,
    barcode: draft.barcode.trim() || undefined,
    baseUnit: draft.baseUnit,
    category: draft.category,
    per100: {
      calories: parseDecimal(draft.calories),
      protein: parseDecimal(draft.protein),
      fat: parseDecimal(draft.fat),
      carbs: parseDecimal(draft.carbs),
    },
    source: 'Пользователь · по этикетке',
    isCustom: true,
    createdAt: product?.createdAt ?? now,
    updatedAt: now,
    gramsPerMl: volume ? undefined : optionalDecimal(draft.gramsPerMl),
    pieceGrams: volume ? undefined : optionalDecimal(draft.pieceGrams),
    servingGrams: volume ? undefined : optionalDecimal(draft.servingGrams),
    servingMl: volume ? optionalDecimal(draft.servingMl) : undefined,
  };
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  function field<K extends keyof typeof draft>(
    name: K,
    text: (typeof draft)[K],
  ) {
    setDraft((d) => ({ ...d, [name]: text }));
  }
  async function save() {
    if (!session || session.pending) return;
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Укажите название продукта.';
    if (value.barcode && !validBarcode(value.barcode))
      next.barcode = 'Проверьте длину и контрольную цифру штрихкода.';
    for (const key of nutrientKeys)
      if (!Number.isFinite(value.per100[key]) || value.per100[key] < 0)
        next[key] = 'Введите неотрицательное число, например 12,5.';
    for (const key of conversionKeys) {
      const amount = value[key];
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0))
        next[key] = 'Введите положительное число или оставьте поле пустым.';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      fields.current.get(Object.keys(next)[0])?.focus();
      return;
    }
    try {
      await session.change((s) => saveProduct(s, value));
      onSaved(value);
    } catch (error) {
      setFailure(describeError(error));
    }
  }
  return (
    <FieldFocusContext value={fields}>
      <FoodForm
        title={product ? 'Редактировать продукт' : 'Новый продукт'}
        onBack={onBack}
        dirty={dirty}
        pending={session?.pending}
        error={failure}
      >
        <FormField
          name="name"
          label="Название продукта"
          value={draft.name}
          onChangeText={(v) => field('name', v)}
          error={errors.name}
        />
        <FormField
          name="brand"
          label="Бренд (необязательно)"
          value={draft.brand}
          onChangeText={(v) => field('brand', v)}
        />
        <FormField
          name="barcode"
          label="Штрихкод (необязательно)"
          value={draft.barcode}
          inputMode="numeric"
          onChangeText={(v) => field('barcode', v)}
          error={errors.barcode}
        />
        {!massOnly && (
          <ChoiceGroup
            label="Пищевая ценность на этикетке"
            value={draft.baseUnit}
            onChange={(value) => field('baseUnit', value)}
            options={[
              { value: 'g', label: 'На 100 г' },
              { value: 'ml', label: 'На 100 мл' },
            ]}
          />
        )}
        {nutrientKeys.map((key) => (
          <FormField
            key={key}
            name={key}
            label={`${labels[key]} на 100 ${volume ? 'мл' : 'г'}`}
            value={draft[key]}
            inputMode="decimal"
            error={errors[key]}
            onChangeText={(v) => field(key, v)}
          />
        ))}
        {validateProduct(value).warnings.map((w) => (
          <AppText key={w} tone="muted">
            {w}
          </AppText>
        ))}
        {conversionKeys.map((key) => (
          <FormField
            key={key}
            name={key}
            label={conversionLabels[key]}
            value={draft[key]}
            inputMode="decimal"
            error={errors[key]}
            onChangeText={(v) => field(key, v)}
          />
        ))}
        <ChoiceGroup
          label="Категория продукта"
          value={draft.category}
          onChange={(v) => field('category', v)}
          options={categories.map((c) => ({ value: c, label: c }))}
        />
        <PrimaryButton
          label={session?.pending ? 'Сохранение…' : 'Сохранить продукт'}
          disabled={session?.pending}
          onPress={() => void save()}
        />
      </FoodForm>
    </FieldFocusContext>
  );
}
