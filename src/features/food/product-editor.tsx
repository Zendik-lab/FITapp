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
  calories: 'Калории на 100 г',
  protein: 'Белки на 100 г',
  fat: 'Жиры на 100 г',
  carbs: 'Углеводы на 100 г',
};
export function ProductEditor({
  product,
  barcode = '',
  onBack,
  onSaved,
}: {
  product?: FoodProduct;
  barcode?: string;
  onBack(): void;
  onSaved(product: FoodProduct): void;
}) {
  const session = useFoodDiary();
  const [initial] = useState(() => ({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    category: product?.category ?? categories[0],
    barcode: product?.barcode ?? barcode,
    calories: product ? String(product.per100.calories) : '',
    protein: product ? String(product.per100.protein) : '',
    fat: product ? String(product.per100.fat) : '',
    carbs: product ? String(product.per100.carbs) : '',
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const fields = useRef(new Map<string, TextInputInstance>());
  const [id] = useState(() => product?.id ?? `custom-${newId()}`);
  const now = new Date().toISOString();
  const value: FoodProduct = {
    ...product,
    id,
    name: draft.name.trim(),
    brand: draft.brand.trim() || undefined,
    barcode: draft.barcode.trim() || undefined,
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
  };
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  function field(name: keyof typeof draft, text: string) {
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
        {nutrientKeys.map((key) => (
          <FormField
            key={key}
            name={key}
            label={labels[key]}
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
