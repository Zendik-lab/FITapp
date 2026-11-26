import { createContext, use } from 'react';
import type { NutritionPreferences, NutritionResolution } from './model';

export interface NutritionSession extends NutritionResolution {
  preferences: NutritionPreferences;
  pending: boolean;
  failure: string | null;
  loadFailed: boolean;
  save(preferences: NutritionPreferences): Promise<void>;
  retry(): void;
}
export const NutritionContext = createContext<NutritionSession | null>(null);
export function useNutrition() {
  return use(NutritionContext);
}
