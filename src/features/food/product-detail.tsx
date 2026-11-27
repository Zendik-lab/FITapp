import { useState } from 'react';
import { Image, Linking } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import { Dialog } from '@/components/dialog';
import { ChoiceGroup, FormField } from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import {
  gramsFor,
  makeEntry,
  parseDateKey,
  parseDecimal,
  portion,
  unitsFor,
} from './domain';
import {
  addEntry,
  deleteProduct,
  editEntry,
  removeEntry,
  toggleFavorite,
} from './operations';
import {
  meals,
  unitLabels,
  type ProductDiaryEntry,
  type FoodProduct,
  type FoodUnit,
  type MealType,
} from './model';
import { NutritionValues } from './nutrition-values';
import { formatNumber } from '@/features/calendar/calendar';

export function ProductDetail({
  product,
  entry,
  date,
  meal,
  onBack,
  onSaved,
  onEdit,
}: {
  product: FoodProduct;
  entry?: ProductDiaryEntry;
  date: string;
  meal: MealType;
  onBack(): void;
  onSaved(message: string, destination: string): void;
  onEdit(product: FoodProduct): void;
}) {
  const session = useFoodDiary();
  const [amount, setAmount] = useState(String(entry?.amount ?? 100));
  const [unit, setUnit] = useState<FoodUnit>(entry?.unit ?? 'g');
  const [selectedMeal, setMeal] = useState(entry?.meal ?? meal);
  const [selectedDate, setDate] = useState(entry?.date ?? date);
  const [failure, setFailure] = useState('');
  const [confirm, setConfirm] = useState<'entry' | 'product' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const favorite = session?.state.favorites.some(
    (f) => f.productId === product.id,
  );
  const exists = session?.products.some((p) => p.id === product.id);
  const dirty =
    amount !== String(entry?.amount ?? 100) ||
    unit !== (entry?.unit ?? 'g') ||
    selectedMeal !== (entry?.meal ?? meal) ||
    selectedDate !== (entry?.date ?? date);
  let values;
  try {
    values = portion(product, parseDecimal(amount), unit);
  } catch {
    /* Invalid text remains editable; save reports correction. */
  }
  async function perform(action: () => Promise<void>, message?: string) {
    setFailure('');
    try {
      await action();
      if (message) onSaved(message, date);
    } catch (error) {
      setFailure(describeError(error));
    }
  }
  async function save(copy = false) {
    if (!session) return;
    await perform(
      async () => {
        parseDateKey(selectedDate);
        const value = parseDecimal(amount);
        const created = makeEntry(
          product,
          value,
          unit,
          selectedMeal,
          selectedDate,
        );
        await session.change((s) =>
          entry && !copy
            ? editEntry(s, entry.id, value, unit, selectedMeal, selectedDate)
            : addEntry(s, created),
        );
      },
      entry && !copy
        ? 'Запись питания обновлена.'
        : 'Продукт добавлен в дневник.',
    );
  }
  return (
    <FoodForm
      title={entry ? 'Запись питания' : 'Порция продукта'}
      dirty={dirty}
      pending={session?.pending}
      error={failure}
      onBack={onBack}
    >
      <Card>
        <AppText variant="section">{product.name}</AppText>
        {!!product.brand && <AppText tone="muted">{product.brand}</AppText>}
        {!!product.imageUrl && !imageFailed && (
          <Image
            source={{ uri: product.imageUrl }}
            accessibilityLabel={product.name}
            style={{ width: 100, height: 100 }}
            onError={() => setImageFailed(true)}
          />
        )}
        <NutritionValues values={product.per100} caption="На 100 г" />
        <AppText variant="caption" tone="muted">
          {product.source}
        </AppText>
        {product.id.startsWith('off-') && (
          <PrimaryButton
            secondary
            label="Источник: Open Food Facts · ODbL"
            onPress={() => {
              void Linking.openURL(
                `https://world.openfoodfacts.org/product/${product.barcode}`,
              ).catch(() => setFailure('Не удалось открыть источник.'));
            }}
          />
        )}
      </Card>
      <FormField
        name="food-amount"
        label={`Количество, ${unitLabels[unit]}`}
        inputMode="decimal"
        value={amount}
        onChangeText={setAmount}
        hint="Дробные значения: 150,5 или 150.5"
        error={
          values ? undefined : 'Укажите положительное количество до 100 000.'
        }
      />
      {unitsFor(product).length > 1 && (
        <ChoiceGroup
          label="Единица измерения"
          value={unit}
          onChange={setUnit}
          options={unitsFor(product).map((u) => ({
            value: u,
            label: unitLabels[u],
            description:
              u === 'g'
                ? undefined
                : `1 ${unitLabels[u]} = ${formatNumber(gramsFor(product, 1, u))} г (справочный вес)`,
          }))}
        />
      )}
      {values && (
        <Card>
          <NutritionValues animate values={values} caption="В порции" />
        </Card>
      )}
      <FormField
        name="food-date"
        label="Дата записи, ГГГГ-ММ-ДД"
        value={selectedDate}
        onChangeText={setDate}
      />
      <ChoiceGroup
        label="Приём пищи"
        value={selectedMeal}
        onChange={setMeal}
        options={Object.entries(meals).map(([value, label]) => ({
          value: value as MealType,
          label,
        }))}
      />
      <PrimaryButton
        label={
          session?.pending
            ? 'Сохранение…'
            : entry
              ? 'Сохранить запись'
              : 'Добавить в дневник'
        }
        disabled={session?.pending || !values}
        onPress={() => void save()}
      />
      {exists && (
        <PrimaryButton
          secondary
          label={favorite ? 'Убрать из избранного' : 'В избранное'}
          disabled={session?.pending}
          onPress={() =>
            session &&
            void perform(() =>
              session.change((s) => toggleFavorite(s, product.id)),
            )
          }
        />
      )}
      {entry && (
        <>
          <PrimaryButton
            secondary
            label="Скопировать запись"
            disabled={session?.pending || !values}
            onPress={() => void save(true)}
          />
          <PrimaryButton
            secondary
            label="Удалить запись"
            disabled={session?.pending}
            onPress={() => setConfirm('entry')}
          />
        </>
      )}
      {!entry && product.isCustom && exists && (
        <>
          <PrimaryButton
            secondary
            label="Редактировать продукт"
            disabled={session?.pending}
            onPress={() => onEdit(product)}
          />
          <PrimaryButton
            secondary
            label="Удалить свой продукт"
            disabled={session?.pending}
            onPress={() => setConfirm('product')}
          />
        </>
      )}
      <Dialog
        open={!!confirm}
        dismissible={!session?.pending}
        title={!!entry ? 'Удалить запись?' : 'Удалить свой продукт?'}
        onDismiss={() => setConfirm(null)}
      >
        <AppText>
          {!!entry
            ? 'Запись будет удалена из выбранного дня.'
            : 'Исторические записи останутся без изменений.'}
        </AppText>
        <PrimaryButton
          secondary
          label="Отмена"
          disabled={session?.pending}
          onPress={() => setConfirm(null)}
        />
        <PrimaryButton
          label="Подтвердить удаление"
          disabled={session?.pending}
          onPress={() => {
            if (session)
              void perform(
                () =>
                  session.change((s) =>
                    confirm === 'entry' && entry
                      ? removeEntry(s, entry.id)
                      : deleteProduct(s, product.id),
                  ),
                entry ? 'Запись удалена.' : 'Продукт удалён.',
              );
          }}
        />
      </Dialog>
    </FoodForm>
  );
}
