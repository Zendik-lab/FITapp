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

type Page =
  | { kind: 'search' | 'recipes' }
  | { kind: 'scanner' }
  | { kind: 'detail'; product: FoodProduct; entry?: ProductDiaryEntry }
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
  onLogged(message: string, date: string): void;
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
      onRecipes={() => setPage({ kind: 'recipes' })}
    />
  );
}
