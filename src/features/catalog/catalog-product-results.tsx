import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/buttons';
import { describeError } from '@/database/storage-diagnostics';
import { barcodeKey } from '@/features/food/domain';
import type { FoodProduct } from '@/features/food/model';
import {
  catalogVersion,
  searchCatalog,
  subscribeCatalog,
  type CatalogFilters,
  type CatalogSearchCursor,
} from './catalog-service';

type Position = { cursor?: CatalogSearchCursor; excluded: ReadonlySet<string> };

export function CatalogProductResults({
  query,
  filters,
  excluded,
  accept,
  renderProduct,
}: {
  query: string;
  filters: CatalogFilters;
  excluded: ReadonlySet<string>;
  accept?: (product: FoodProduct) => boolean;
  renderProduct(product: FoodProduct): ReactNode;
}) {
  const revision = useSyncExternalStore(
    subscribeCatalog,
    catalogVersion,
    catalogVersion,
  );
  const [history, setHistory] = useState<readonly Position[]>([]);
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof searchCatalog>>>();
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  const position = history.at(-1);

  useEffect(() => {
    const controller = new AbortController();
    void searchCatalog({
      query,
      filters,
      excluded: position?.excluded ?? excluded,
      cursor: position?.cursor,
      accept,
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setResult(next);
          setFailure('');
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(describeError(error));
      });
    return () => controller.abort();
  }, [query, filters, excluded, position, revision, accept, retry]);

  if (failure)
    return (
      <>
        <AppText tone="error" accessibilityLiveRegion="polite">
          {failure}
        </AppText>
        <PrimaryButton
          secondary
          label="Повторить поиск в пакетах"
          onPress={() => {
            setFailure('');
            setRetry(retry + 1);
          }}
        />
      </>
    );
  if (!result)
    return <ActivityIndicator accessibilityLabel="Поиск в офлайн-пакетах" />;
  if (!result.rows.length && !result.next && !history.length) return null;
  return (
    <>
      <AppText variant="section" accessibilityRole="header">
        Офлайн-пакеты
      </AppText>
      {result.rows.map(renderProduct)}
      {!result.rows.length && (
        <AppText tone="muted">
          Уточните запрос или продолжите поиск в пакетах.
        </AppText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {history.length > 0 && (
          <PrimaryButton
            secondary
            label="Предыдущие из пакетов"
            icon="ChevronLeft"
            onPress={() => {
              setResult(undefined);
              setHistory(history.slice(0, -1));
            }}
          />
        )}
        {result.next && (
          <PrimaryButton
            secondary
            label="Следующие из пакетов"
            icon="ChevronRight"
            onPress={() => {
              const seen = new Set(position?.excluded ?? excluded);
              for (const product of result.rows)
                seen.add(barcodeKey(product.barcode ?? '') ?? product.id);
              setResult(undefined);
              setHistory([
                ...history,
                { cursor: result.next ?? undefined, excluded: seen },
              ]);
            }}
          />
        )}
      </View>
    </>
  );
}
