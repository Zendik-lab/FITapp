import { productMatchesBarcode } from './domain';
import type { FoodSession } from './food-context';
import type { FoodProduct } from './model';
import { saveProduct } from './operations';

export async function lookupBarcode(
  code: string,
  {
    builtins,
    session,
    findPack,
    remote,
    signal,
    online,
  }: {
    builtins: readonly FoodProduct[];
    session: Pick<FoodSession, 'state' | 'change'>;
    findPack(code: string): Promise<FoodProduct | null>;
    remote(code: string, signal?: AbortSignal): Promise<FoodProduct | null>;
    signal: AbortSignal;
    online: boolean;
  },
): Promise<{ product: FoodProduct; saved: boolean } | null> {
  if (signal.aborted) return null;
  const match = (product: FoodProduct) => productMatchesBarcode(product, code);
  const builtin = builtins.find(match);
  if (builtin) return { product: builtin, saved: false };
  const packed = await findPack(code).catch((error: unknown) => {
    const saved = session.state.products.find(match);
    if (saved) return saved;
    throw error;
  });
  if (signal.aborted) return null;
  const existing = packed ?? session.state.products.find(match);
  if (existing) return { product: existing, saved: false };
  if (!online) return null;

  const product = await remote(code, signal);
  if (!product || signal.aborted) return null;
  let concurrent: FoodProduct | undefined;
  await session.change((state) => {
    if (signal.aborted) return state;
    concurrent = state.products.find(match);
    return concurrent ? state : saveProduct(state, product);
  });
  if (signal.aborted) return null;
  return concurrent
    ? { product: concurrent, saved: false }
    : { product, saved: true };
}
