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
  isMassBased,
  makeEntry,
  parseDateKey,
  parseDecimal,
  portion,
  portionBaseAmount,
  productMatchesBarcode,
  unitsFor,
} from './domain';
import {
  addEntry,
  deleteProduct,
  editEntry,
  removeEntry,
  saveProduct,
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
import { useHapticFeedback } from '@/features/settings/feedback';

function matchesProduct(saved: FoodProduct, product: FoodProduct): boolean {
  return (
    saved.id === product.id ||
    [product.barcode, ...(product.barcodes ?? [])].some(
      (code) => code && productMatchesBarcode(saved, code),
    )
  );
}

const regionalCountries: Record<string, string> = {
  kazakhstan: 'Казахстан',
  russia: 'Россия',
  kyrgyzstan: 'Кыргызстан',
  uzbekistan: 'Узбекистан',
  belarus: 'Беларусь',
  ukraine: 'Украина',
  armenia: 'Армения',
  azerbaijan: 'Азербайджан',
  georgia: 'Грузия',
  moldova: 'Молдова',
  tajikistan: 'Таджикистан',
  turkmenistan: 'Туркменистан',
};

function displayCountry(raw: string) {
  const country = raw.replace(/^[a-z]{2}:/i, '');
  return regionalCountries[country] ?? country.replace(/-/g, ' ');
}

export function ProductDetail({
  product,
  entry,
  offlineSaved,
  date,
  meal,
  onBack,
  onSaved,
  onEdit,
}: {
  product: FoodProduct;
  entry?: ProductDiaryEntry;
  offlineSaved?: boolean;
  date: string;
  meal: MealType;
  onBack(): void;
  onSaved(
    message: string,
    destination: string,
    deleted?: ProductDiaryEntry,
  ): void;
  onEdit(product: FoodProduct): void;
}) {
  const session = useFoodDiary();
  const feedback = useHapticFeedback();
  const baseUnit = isMassBased(product) ? 'g' : 'ml';
  const [amount, setAmount] = useState(String(entry?.amount ?? 100));
  const [unit, setUnit] = useState<FoodUnit>(entry?.unit ?? baseUnit);
  const [selectedMeal, setMeal] = useState(entry?.meal ?? meal);
  const [selectedDate, setDate] = useState(entry?.date ?? date);
  const [failure, setFailure] = useState('');
  const [confirm, setConfirm] = useState<'entry' | 'product' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const exists = session?.products.some((p) => p.id === product.id);
  const favoriteProduct = exists
    ? product
    : session?.state.products.find((p) => matchesProduct(p, product));
  const favorite = session?.state.favorites.some(
    (f) => f.productId === (favoriteProduct?.id ?? product.id),
  );
  const details = product.catalogDetails;
  const sourceUrl =
    details?.url ??
    (product.id.startsWith('off-') && product.barcode
      ? `https://world.openfoodfacts.org/product/${product.barcode}`
      : undefined);
  const measures = [
    ['Сахар', details?.sugar],
    ['Клетчатка', details?.fiber],
    ['Насыщенные жиры', details?.saturatedFat],
    ['Соль', details?.salt],
  ] as const;
  const attributes = [
    [
      'Оригинальное название',
      details?.originalName !== product.name
        ? details?.originalName
        : undefined,
    ],
    ['Производитель', details?.manufacturer],
    ['Страны продажи', details?.countries?.map(displayCountry).join(', ')],
    [
      'Упаковка',
      details?.packageText ||
        (details?.packageAmount && details.packageUnit
          ? `${formatNumber(details.packageAmount)} ${unitLabels[details.packageUnit]}`
          : undefined),
    ],
    [
      'Штрихкоды',
      [product.barcode, ...(product.barcodes ?? [])].filter(Boolean).join(', '),
    ],
    ['Состав', details?.ingredients],
    ['Аллергены', details?.allergens],
  ] as const;
  const dirty =
    amount !== String(entry?.amount ?? 100) ||
    unit !== (entry?.unit ?? baseUnit) ||
    selectedMeal !== (entry?.meal ?? meal) ||
    selectedDate !== (entry?.date ?? date);
  let values;
  try {
    values = portion(product, parseDecimal(amount), unit);
  } catch {
    /* Invalid text remains editable; save reports correction. */
  }
  async function perform(
    action: () => Promise<void>,
    message?: string,
    destination = date,
    deleted?: ProductDiaryEntry,
  ) {
    setFailure('');
    try {
      await action();
      if (message) {
        if (!deleted) feedback('success');
        onSaved(message, destination, deleted);
      }
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
      selectedDate,
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
          <>
            <Image
              source={{ uri: product.imageUrl }}
              accessibilityLabel={product.name}
              style={{ width: 100, height: 100 }}
              onError={() => setImageFailed(true)}
            />
            {product.imageUrl.startsWith(
              'https://images.openfoodfacts.org/',
            ) && (
              <AppText variant="caption" tone="muted">
                Фото · Open Food Facts · CC BY-SA
              </AppText>
            )}
          </>
        )}
        <NutritionValues
          values={product.per100}
          caption={`На 100 ${unitLabels[baseUnit]}`}
        />
        {offlineSaved && (
          <AppText variant="caption" accessibilityLiveRegion="polite">
            Товар сохранён для поиска офлайн.
          </AppText>
        )}
        <AppText variant="caption" tone="muted">
          {product.source}
        </AppText>
        {sourceUrl?.startsWith('https://') && (
          <PrimaryButton
            secondary
            label={
              details?.license
                ? `Открыть источник · ${details.license}`
                : 'Открыть источник'
            }
            onPress={() => {
              void Linking.openURL(sourceUrl).catch(() =>
                setFailure('Не удалось открыть источник.'),
              );
            }}
          />
        )}
        {!!(details || product.barcode || product.barcodes?.length) && (
          <PrimaryButton
            secondary
            label={showDetails ? 'Свернуть сведения' : 'Состав и сведения'}
            onPress={() => setShowDetails(!showDetails)}
          />
        )}
        {showDetails && (
          <>
            {attributes.map(
              ([label, value]) =>
                value && (
                  <AppText key={label} variant="caption">
                    {label} · {value}
                  </AppText>
                ),
            )}
            {details && (
              <AppText variant="caption" tone="muted">
                {`На 100 ${unitLabels[baseUnit]}\n${measures.map(([label, value]) => `${label} · ${value === undefined ? 'нет данных' : `${formatNumber(value)} г`}`).join('\n')}`}
              </AppText>
            )}
          </>
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
              u === baseUnit
                ? undefined
                : `1 ${unitLabels[u]} = ${formatNumber(portionBaseAmount(product, 1, u))} ${unitLabels[baseUnit]}`,
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
      {session && (!entry || exists) && (
        <PrimaryButton
          secondary
          label={favorite ? 'Убрать из избранного' : 'В избранное'}
          disabled={session?.pending}
          onPress={() =>
            session &&
            void perform(() =>
              session.change((state) => {
                if (exists) return toggleFavorite(state, product.id);
                const saved = state.products.find((p) =>
                  matchesProduct(p, product),
                );
                return saved
                  ? toggleFavorite(state, saved.id)
                  : toggleFavorite(saveProduct(state, product), product.id);
              }),
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
                      ? removeEntry(s, entry.id, entry)
                      : deleteProduct(s, product.id),
                  ),
                entry ? 'Запись удалена.' : 'Продукт удалён.',
                entry?.date ?? date,
                entry,
              );
          }}
        />
      </Dialog>
    </FoodForm>
  );
}
