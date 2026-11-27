import { useState } from 'react';
import type {
  FoodDiaryEntry,
  FoodProduct,
  MealType,
  ProductDiaryEntry,
} from './model';
import { FoodSearch } from './food-search';
import { ProductDetail } from './product-detail';
import { ProductEditor } from './product-editor';
import { ScannerScreen } from './scanner-screen';
import { RecipeFlow } from '@/features/recipes/recipe-flow';
import { RecipeLog } from '@/features/recipes/recipe-log';
import { ScreenStack } from '@/components/screen-stack';
import { CatalogPacksScreen } from '@/features/catalog/catalog-packs-screen';

type Page =
  | { kind: 'search' | 'recipes' | 'catalogs' }
  | { kind: 'scanner' }
  | {
      kind: 'detail';
      product: FoodProduct;
      entry?: ProductDiaryEntry;
      offlineSaved?: boolean;
    }
  | { kind: 'editor'; product?: FoodProduct; barcode?: string };
export function FoodFlow({
  date,
  meal = 'breakfast',
  entry,
  scan = false,
  onClose,
  onLogged,
}: {
  date: string;
  meal?: MealType;
  entry?: FoodDiaryEntry;
  scan?: boolean;
  onClose(): void;
  onLogged(message: string, date: string, deleted?: FoodDiaryEntry): void;
}) {
  const [page, setPage] = useState<Page>(() =>
    entry && !entry.recipe
      ? { kind: 'detail', product: entry.product, entry }
      : { kind: scan ? 'scanner' : 'search' },
  );
  if (entry?.recipe)
    return (
      <RecipeLog
        entry={entry}
        date={date}
        meal={meal}
        onBack={onClose}
        onSaved={onLogged}
      />
    );
  function renderDetail() {
    if (page.kind === 'catalogs')
      return <CatalogPacksScreen onBack={() => setPage({ kind: 'search' })} />;
    if (page.kind === 'recipes')
      return (
        <RecipeFlow
          choose
          date={date}
          meal={meal}
          onClose={() => setPage({ kind: 'search' })}
          onLogged={onLogged}
        />
      );
    if (page.kind === 'editor')
      return (
        <ProductEditor
          product={page.product}
          barcode={page.barcode}
          onBack={() =>
            setPage(
              page.product
                ? { kind: 'detail', product: page.product }
                : { kind: 'search' },
            )
          }
          onSaved={(product) => setPage({ kind: 'detail', product })}
        />
      );
    if (page.kind === 'scanner')
      return (
        <ScannerScreen
          onBack={() => setPage({ kind: 'search' })}
          onProduct={(product, offlineSaved) =>
            setPage({ kind: 'detail', product, offlineSaved })
          }
          onCreate={(barcode) => setPage({ kind: 'editor', barcode })}
        />
      );
    if (page.kind === 'detail')
      return (
        <ProductDetail
          product={page.product}
          entry={page.entry}
          offlineSaved={page.offlineSaved}
          date={date}
          meal={meal}
          onBack={() => (page.entry ? onClose() : setPage({ kind: 'search' }))}
          onSaved={onLogged}
          onEdit={(product) => setPage({ kind: 'editor', product })}
        />
      );
    return null;
  }
  return (
    <ScreenStack detail={renderDetail()}>
      {!entry && (
        <FoodSearch
          active={page.kind === 'search'}
          onBack={onClose}
          onProduct={(product) => setPage({ kind: 'detail', product })}
          onCreate={() => setPage({ kind: 'editor' })}
          onScan={() => setPage({ kind: 'scanner' })}
          onRecipes={() => setPage({ kind: 'recipes' })}
          onCatalogs={() => setPage({ kind: 'catalogs' })}
        />
      )}
    </ScreenStack>
  );
}
