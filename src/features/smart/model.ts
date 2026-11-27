export interface FoodQuantity {
  id: string;
  name: string;
  category: string;
  grams: number;
}

export interface ShoppingItem extends FoodQuantity {
  key: string;
  bought: boolean;
}

export interface PackagePrice {
  amount: number;
  grams: number;
}

export interface SmartPantry {
  stock: FoodQuantity[];
  shopping: ShoppingItem[];
  prices: Record<string, PackagePrice>;
  dailyBudget?: number;
  weeklyBudget?: number;
}

export const emptyPantry: SmartPantry = { stock: [], shopping: [], prices: {} };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function positiveValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function quantity(value: unknown): value is FoodQuantity {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    !!value.id &&
    typeof value.name === 'string' &&
    !!value.name.trim() &&
    typeof value.category === 'string' &&
    positiveValue(value.grams)
  );
}

function distinct<T>(values: T[], identity: (value: T) => string) {
  return new Set(values.map(identity)).size === values.length;
}

export function validPantry(value: unknown): value is SmartPantry {
  if (!record(value)) return false;
  const { stock, shopping, prices, dailyBudget, weeklyBudget } = value;
  return (
    Array.isArray(stock) &&
    stock.every(quantity) &&
    distinct(stock, (row) => row.id) &&
    Array.isArray(shopping) &&
    shopping.every(
      (item: unknown) =>
        record(item) &&
        typeof item.key === 'string' &&
        typeof item.bought === 'boolean' &&
        quantity(item),
    ) &&
    distinct(shopping, (row: ShoppingItem) => row.key) &&
    record(prices) &&
    Object.values(prices).every(
      (price) =>
        record(price) &&
        positiveValue(price.amount) &&
        positiveValue(price.grams),
    ) &&
    (dailyBudget === undefined || positiveValue(dailyBudget)) &&
    (weeklyBudget === undefined || positiveValue(weeklyBudget))
  );
}
