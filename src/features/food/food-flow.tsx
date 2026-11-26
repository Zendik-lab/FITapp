import { useState } from 'react';
import type { FoodDiaryEntry, FoodProduct, MealType } from './model';
import { FoodSearch } from './food-search';
import { ProductDetail } from './product-detail';
import { ProductEditor } from './product-editor';
import { ScannerScreen } from './scanner-screen';

type Page =
  | { kind: 'search' }
  | { kind: 'scanner' }
  | { kind: 'detail'; product: FoodProduct; entry?: FoodDiaryEntry }
  | { kind: 'editor'; product?: FoodProduct; barcode?: string };
export function FoodFlow({
  date,
  meal = 'breakfast',
  entry,
  scan = false,
  onClose,
}: {
  date: string;
  meal?: MealType;
  entry?: FoodDiaryEntry;
  scan?: boolean;
  onClose(): void;
}) {
  const [page, setPage] = useState<Page>(() =>
    entry
      ? { kind: 'detail', product: entry.product, entry }
      : { kind: scan ? 'scanner' : 'search' },
  );
  if (page.kind === 'editor')
    return (
      <ProductEditor
        product={page.product}
        barcode={page.barcode}
        onBack={() => setPage({ kind: 'search' })}
        onSaved={(product) => setPage({ kind: 'detail', product })}
      />
    );
  if (page.kind === 'scanner')
    return (
      <ScannerScreen
        onBack={() => setPage({ kind: 'search' })}
        onProduct={(product) => setPage({ kind: 'detail', product })}
        onCreate={(barcode) => setPage({ kind: 'editor', barcode })}
      />
    );
  if (page.kind === 'detail')
    return (
      <ProductDetail
        product={page.product}
        entry={page.entry}
        date={date}
        meal={meal}
        onBack={() => (page.entry ? onClose() : setPage({ kind: 'search' }))}
        onSaved={onClose}
        onEdit={(product) => setPage({ kind: 'editor', product })}
      />
    );
  return (
    <FoodSearch
      onBack={onClose}
      onProduct={(product) => setPage({ kind: 'detail', product })}
      onCreate={() => setPage({ kind: 'editor' })}
      onScan={() => setPage({ kind: 'scanner' })}
    />
  );
}
