import { useEffect, useRef, useState } from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { describeError } from '@/database/storage-diagnostics';
import { spacing } from '@/theme';
import { useOfflineStatus } from '@/features/pwa/pwa-status';
import { FoodForm } from './food-form';
import { useFoodDiary } from './food-context';
import { sameBarcode } from './domain';
import { offClient } from './off-api';
import { saveProduct } from './operations';
import { ProductPicker } from './product-picker';
import type { FoodProduct } from './model';

const noResults: readonly FoodProduct[] = [];

export function FoodSearch({
  active,
  onBack,
  onProduct,
  onCreate,
  onScan,
  onRecipes,
}: {
  active: boolean;
  onBack(): void;
  onProduct(product: FoodProduct): void;
  onCreate(): void;
  onScan(): void;
  onRecipes?(): void;
}) {
  const session = useFoodDiary();
  const offline = useOfflineStatus();
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
  const [onlineResults, setOnlineResults] =
    useState<readonly FoodProduct[]>(noResults);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setSubmitted(null);
      setNetwork(false);
    }
  }
  useEffect(() => {
    if (!active || !submitted) return;
    let currentRequest = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setNetwork(true);
      void offClient
        .search(submitted.query, controller.signal)
        .then(async (result) => {
          if (!currentRequest) return;
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
          if (currentRequest) {
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
          if (currentRequest) setMessage(describeError(error));
        })
        .finally(() => {
          if (currentRequest) setNetwork(false);
        });
    }, 500);
    return () => {
      currentRequest = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, submitted]);
  function resetSearch() {
    setSubmitted(null);
    setNetwork(false);
    setMessage('');
    setOnlineResults(noResults);
  }
  return (
    <FoodForm readOnly={!active} title="Добавить продукт" onBack={onBack}>
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
                  offline ||
                  network ||
                  !!session?.pending ||
                  query.trim().length < 3
                }
                onPress={() => {
                  setMessage('');
                  setOnlineResults(noResults);
                  setSubmitted({ query, id: Date.now() });
                }}
              />
              <AppText variant="caption" tone="muted">
                {offline
                  ? 'Локальный поиск доступен. Для Open Food Facts нужен интернет.'
                  : 'Сверяйте данные Open Food Facts с этикеткой продукта.'}
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
