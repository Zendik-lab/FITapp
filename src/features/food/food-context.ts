import { createContext, use } from 'react';
import type { FoodProduct, FoodState } from './model';

export interface FoodSession {
  state: FoodState;
  products: readonly FoodProduct[];
  loading: boolean;
  pending: boolean;
  failure: string | null;
  change(operation: (state: FoodState) => FoodState): Promise<void>;
  reload(): Promise<void>;
}
export const FoodContext = createContext<FoodSession | null>(null);
export const useFoodDiary = () => use(FoodContext);
