import { useEffect, useRef, useState } from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { describeError } from '@/database/storage-diagnostics';
import { spacing } from '@/theme';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { sameBarcode } from './domain';
import { offClient } from './off-api';
import { saveProduct } from './operations';
import { ProductPicker } from './product-picker';
import type { FoodProduct } from './model';

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
  const [submitted, setSubmitted] = useState<{
    query: string;
    id: number;
  } | null>(null);
  const [network, setNetwork] = useState(false);
  const [message, setMessage] = useState('');
  const [onlineResults, setOnlineResults] = useState<readonly FoodProduct[]>(
    [],
  );
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
          let saved: FoodProduct[] = [];
          if (current && result.products.length) {
            await current.change((state) => {
              let next = state;
              const accepted = new Map<string, FoodProduct>();
              for (const product of result.products) {
                if (
                  next.products.some(
                    (existing) =>
                      existing.id !== product.id &&
                      sameBarcode(existing.barcode, product.barcode),
                  )
                )
                  continue;
                next = saveProduct(next, product);
                accepted.set(product.id, product);
              }
              saved = [...accepted.values()];
              return next;
            });
          }
          if (active) {
            setOnlineResults(saved);
            setMessage(
              [
                saved.length
                  ? `Сохранено для офлайн-доступа: ${saved.length}.`
                  : '',
                result.products.length > saved.length
                  ? 'Часть штрихкодов уже есть в локальной базе.'
                  : '',
                result.incomplete
                  ? `Без полных КБЖУ на 100 г: ${result.incomplete}.`
                  : '',
              ]
                .filter(Boolean)
                .join(' ') ||
                'Open Food Facts не нашёл продукты по этому запросу.',
            );
          }
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
  function resetSearch() {
    setSubmitted(null);
    setNetwork(false);
    setMessage('');
    setOnlineResults([]);
  }
  return (
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
      <ProductPicker
        label="Название или штрихкод"
        onProduct={onProduct}
        onlineResults={onlineResults}
        onQueryChange={resetSearch}
        extra={(query, section) =>
          section === 'search' ? (
            <>
              <PrimaryButton
                secondary
                label={network ? 'Поиск онлайн…' : 'Найти в Open Food Facts'}
                disabled={
                  network || !!session?.pending || query.trim().length < 3
                }
                onPress={() => {
                  setMessage('');
                  setOnlineResults([]);
                  setSubmitted({ query, id: Date.now() });
                }}
              />
              <AppText variant="caption" tone="muted">
                Результаты Open Food Facts могут требовать проверки этикетки.
              </AppText>
              {!!message && (
                <AppText accessibilityLiveRegion="polite">{message}</AppText>
              )}
            </>
          ) : null
        }
      />
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
  );
}
const styles = StyleSheet.create({ actions: { gap: spacing.small } });
