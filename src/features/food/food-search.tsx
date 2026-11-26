import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  View,
  StyleSheet,
  type TextInputInstance,
} from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { Card } from '@/components/card';
import {
  ChoiceGroup,
  FieldFocusContext,
  FormField,
} from '@/components/form-controls';
import { describeError } from '@/database/storage-diagnostics';
import { spacing } from '@/theme';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { sameBarcode, searchFoods } from './domain';
import { offClient } from './off-api';
import { saveProduct } from './operations';
import { NutritionValues } from './nutrition-values';
import type { FoodProduct } from './model';

type Section = 'search' | 'recent' | 'favorite' | 'custom';
export function FoodSearch({
  onBack,
  onProduct,
  onCreate,
  onScan,
  onRecipes,
}: {
  onBack(): void;
  onProduct(product: FoodProduct): void;
  onCreate(): void;
  onScan(): void;
  onRecipes?(): void;
}) {
  const session = useFoodDiary();
  const latest = useRef(session);
  useEffect(() => {
    latest.current = session;
  }, [session]);
  const [section, setSection] = useState<Section>('search');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<{
    query: string;
    id: number;
  } | null>(null);
  const [network, setNetwork] = useState(false);
  const [message, setMessage] = useState('');
  const [limit, setLimit] = useState(25);
  const fields = useRef(new Map<string, TextInputInstance>());
  useEffect(() => {
    if (!submitted) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setNetwork(true);
      void offClient
        .search(submitted.query, controller.signal)
        .then(async (result) => {
          if (!active) return;
          const current = latest.current;
          if (current && result.products.length)
            await current.change((s) =>
              result.products.reduce(
                (state, p) =>
                  state.products.some(
                    (existing) =>
                      sameBarcode(existing.barcode, p.barcode) &&
                      existing.id !== p.id,
                  )
                    ? state
                    : saveProduct(state, p),
                s,
              ),
            );
          if (active)
            setMessage(
              `${result.products.length ? `Найдено онлайн: ${result.products.length}. Продукты сохранены для офлайн-доступа.` : 'Полных данных не найдено. Попробуйте другое название или создайте продукт.'}${result.incomplete ? ` Пропущено карточек без полной пищевой ценности или с данными на 100 мл: ${result.incomplete}.` : ''}`,
            );
        })
        .catch((error: unknown) => {
          if (active) setMessage(describeError(error));
        })
        .finally(() => {
          if (active) setNetwork(false);
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [submitted]);
  const products = session?.products ?? [];
  const source =
    section === 'recent'
      ? (session?.state.recent ?? []).flatMap(
          (r) => products.find((p) => p.id === r.productId) ?? [],
        )
      : section === 'favorite'
        ? products.filter((p) =>
            session?.state.favorites.some((f) => f.productId === p.id),
          )
        : section === 'custom'
          ? products.filter((p) => p.isCustom)
          : products;
  const found = searchFoods(source, query);
  function changeQuery(value: string) {
    setQuery(value);
    setSubmitted(null);
    setNetwork(false);
    setMessage('');
    setLimit(25);
  }
  return (
    <FieldFocusContext value={fields}>
      <FoodForm title="Добавить продукт" onBack={onBack}>
        <View style={styles.actions}>
          {onRecipes && (
            <PrimaryButton
              secondary
              icon="BookOpen"
              label="Выбрать рецепт"
              onPress={onRecipes}
            />
          )}
          <PrimaryButton
            secondary
            icon="Barcode"
            label="Сканировать штрихкод"
            onPress={onScan}
          />
          <PrimaryButton
            secondary
            icon="Plus"
            label="Создать продукт"
            onPress={onCreate}
          />
        </View>
        <ChoiceGroup
          label="Раздел продуктов"
          value={section}
          onChange={(v) => {
            setSection(v);
            setLimit(25);
          }}
          options={[
            { value: 'search', label: 'Поиск' },
            { value: 'recent', label: 'Недавние' },
            { value: 'favorite', label: 'Избранное' },
            { value: 'custom', label: 'Мои продукты' },
          ]}
        />
        <FormField
          name="food-search"
          label="Название или штрихкод"
          value={query}
          onChangeText={changeQuery}
        />
        {!!query && (
          <PrimaryButton
            secondary
            label="Очистить поиск"
            onPress={() => {
              changeQuery('');
              fields.current.get('food-search')?.focus();
            }}
          />
        )}
        {section === 'search' && (
          <>
            <PrimaryButton
              secondary
              label={network ? 'Поиск онлайн…' : 'Найти в Open Food Facts'}
              disabled={
                network || !!session?.pending || query.trim().length < 3
              }
              onPress={() => {
                setMessage('');
                setSubmitted({ query, id: Date.now() });
              }}
            />
            <AppText variant="caption" tone="muted">
              Сначала локальная база. Онлайн-поиск запускается кнопкой;
              результаты сообщества могут требовать проверки этикетки.
            </AppText>
          </>
        )}
        {!!message && (
          <AppText accessibilityLiveRegion="polite">{message}</AppText>
        )}
        <AppText
          variant="caption"
          tone="muted"
          accessibilityLiveRegion="polite"
        >
          Найдено локально: {found.length}
        </AppText>
        {!found.length && (
          <Card>
            <AppText>
              Здесь пока нет продуктов. Найдите продукт в другой вкладке или
              создайте свой.
            </AppText>
          </Card>
        )}
        {found.slice(0, limit).map((product) => (
          <Card key={product.id}>
            <AppText variant="action">{product.name}</AppText>
            {!!product.brand && <AppText tone="muted">{product.brand}</AppText>}
            <NutritionValues values={product.per100} caption="На 100 г" />
            <PrimaryButton
              secondary
              label={`Выбрать: ${product.name}`}
              onPress={() => onProduct(product)}
            />
          </Card>
        ))}
        {found.length > limit && (
          <PrimaryButton
            secondary
            label="Показать ещё продукты"
            onPress={() => setLimit((v) => v + 25)}
          />
        )}
        <PrimaryButton
          secondary
          label="Данные Open Food Facts · ODbL"
          onPress={() => {
            void Linking.openURL(
              'https://world.openfoodfacts.org/terms-of-use',
            ).catch(() => setMessage('Не удалось открыть источник.'));
          }}
        />
      </FoodForm>
    </FieldFocusContext>
  );
}
const styles = StyleSheet.create({ actions: { gap: spacing.small } });
