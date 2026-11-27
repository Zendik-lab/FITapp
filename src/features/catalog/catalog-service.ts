import { Platform } from 'react-native';
import { barcodeKey } from '@/features/food/domain';
import {
  normalizeSearch,
  searchTerms,
  wordScore,
} from '@/features/food/local-search';
import type { FoodProduct } from '@/features/food/model';
import {
  parseCatalogManifest,
  unpackCatalogProduct,
  type CatalogPack,
} from './catalog-format';
import { currentBuild, isBuildInfo } from '@/features/pwa/build-info';
import { getCatalogStorage } from './catalog-storage';

export type CatalogFilters = {
  category?: string;
  brand?: string;
  country?: string;
  ranges?: Partial<
    Record<keyof FoodProduct['per100'], { min?: number; max?: number }>
  >;
};
export type CatalogSearchCursor = {
  generation: string;
  prefix: string | null;
  offset: number;
};
type CatalogSearchOptions = {
  query: string;
  filters?: CatalogFilters;
  excluded?: ReadonlySet<string>;
  accept?: (product: FoodProduct) => boolean;
  cursor?: CatalogSearchCursor;
  signal?: AbortSignal;
};

const packageIds = [
  'kazakhstan',
  'cis',
  'sports',
  'prepared',
  'international',
  'international-extended',
  'usda-branded',
];
const releaseOrigin = 'https://fitapp-epj.pages.dev';
const catalogBase =
  Platform.OS === 'web'
    ? '/catalog'
    : `${(process.env.EXPO_PUBLIC_CATALOG_ORIGIN ?? releaseOrigin).replace(/\/$/, '')}/catalog`;
const updateListeners = new Set<() => void>();
let changeVersion = 0;

export const catalogVersion = () => changeVersion;
export function subscribeCatalog(listener: () => void) {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}
function notifyUpdate() {
  changeVersion += 1;
  for (const listener of updateListeners) listener();
}

const cyrillic: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ә: 'a',
  ғ: 'g',
  қ: 'q',
  ң: 'ng',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
  і: 'i',
};
const fold = (value: string) =>
  normalizeSearch(value).normalize('NFKD').replace(/\p{M}/gu, '');
const transliterate = (value: string) =>
  value.replace(
    /\p{Script=Cyrillic}/gu,
    (letter) => cyrillic[letter] ?? letter,
  );
const reverse = (value: string) => [...value].reverse().join('');
const words = (value: string) => searchTerms(fold(value));
function variants(term: string) {
  return [...new Set([term, transliterate(term)])].filter(Boolean);
}
function productWords(product: FoodProduct) {
  const display = [
    product.name,
    product.brand,
    product.category,
    product.catalogDetails?.manufacturer,
    product.catalogDetails?.sourceCategory,
    ...(product.aliases ?? []),
  ].join(' ');
  return [...new Set(words(display).slice(0, 48).flatMap(variants))];
}
function productIndex(product: FoodProduct) {
  const terms = productWords(product);
  return [
    ...terms.map((term) => `w:${term}`),
    ...terms
      .filter((term) => term.length >= 5)
      .map((term) => `r:${reverse(term)}`),
    `c:${fold(product.category)}`,
    ...(product.catalogDetails?.countries ?? []).map(
      (country) => `l:${country}`,
    ),
    ...words(product.brand ?? '')
      .flatMap(variants)
      .map((term) => `b:${term}`),
  ];
}

export function matchesCatalogFilters(
  product: FoodProduct,
  filters: CatalogFilters,
) {
  if (filters.category && filters.category !== product.category) return false;
  if (
    filters.country &&
    !product.catalogDetails?.countries?.includes(filters.country)
  )
    return false;
  if (filters.brand) {
    const brand = words(
      [product.brand, product.catalogDetails?.manufacturer].join(' '),
    ).flatMap(variants);
    if (
      !words(filters.brand).every((term) =>
        variants(term).some((key) => wordScore(key, brand) >= 3),
      )
    )
      return false;
  }
  const nutrientKeys = ['calories', 'protein', 'fat', 'carbs'] as const;
  return nutrientKeys.every((key) => {
    const range = filters.ranges?.[key];
    return (
      !range ||
      (product.per100[key] >= (range.min ?? 0) &&
        product.per100[key] <= (range.max ?? Infinity))
    );
  });
}

async function request<T>(
  path: string,
  read: (response: Response) => Promise<T>,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 30000);
  try {
    const response = await fetch(`${catalogBase}/${path}`, {
      signal: controller.signal,
    });
    return await read(response);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function loadCatalogManifest(signal?: AbortSignal) {
  const path = 'manifest.json';
  const build = currentBuild();
  return request(
    Platform.OS === 'web' && isBuildInfo(build)
      ? `${path}?app-build=${build.buildId}`
      : path,
    async (response) => {
      if (response.status === 404) return [];
      if (!response.ok)
        throw new Error(`Список пакетов недоступен (HTTP ${response.status}).`);
      return parseCatalogManifest(await response.json());
    },
    signal,
  );
}
export async function installedCatalogs() {
  return (await getCatalogStorage()).list();
}

export async function findCatalogBarcode(
  code: string,
): Promise<FoodProduct | null> {
  const key = barcodeKey(code);
  return key ? (await getCatalogStorage()).barcode(key) : null;
}

export async function removeCatalogPack(id: string) {
  const storage = await getCatalogStorage();
  await storage.remove(id);
  notifyUpdate();
}

export async function installCatalogPack(
  pack: CatalogPack,
  progress: (count: number) => void,
  signal?: AbortSignal,
) {
  const storage = await getCatalogStorage();
  const { decodeCatalogChunk } = await import('./catalog-chunk');
  const pending = await storage.begin(pack.id, pack.version);
  if (pending.next > pack.files.length)
    throw new Error('Неверная контрольная точка пакета.');
  const remaining = pack.files.slice(pending.next);
  if (
    Platform.OS === 'web' &&
    remaining.length &&
    navigator.storage?.estimate
  ) {
    const { quota, usage } = await navigator.storage.estimate();
    const required = remaining.reduce(
      (sum, file) => sum + file.rawBytes * 4 + file.bytes,
      0,
    );
    if (
      quota !== undefined &&
      usage !== undefined &&
      quota - usage < required
    ) {
      await storage.collectGarbage();
      const updated = await navigator.storage.estimate();
      if ((updated.quota ?? quota) - (updated.usage ?? usage) < required)
        throw new Error(
          'Недостаточно места. Удалите другой пакет и повторите загрузку.',
        );
    }
  }
  let loaded = pack.files
    .slice(0, pending.next)
    .reduce((sum, file) => sum + file.count, 0);
  progress(loaded);
  for (const [index, file] of remaining.entries()) {
    if (signal?.aborted) return;
    const bytes = await request(
      file.path,
      async (response) => {
        if (!response.ok)
          throw new Error(`Часть пакета недоступна (HTTP ${response.status}).`);
        return new Uint8Array(await response.arrayBuffer());
      },
      signal,
    );
    if (signal?.aborted) return;
    const rows = decodeCatalogChunk(bytes, file).map((row, position) => {
      const product = unpackCatalogProduct(row, pack.source);
      return {
        product,
        barcodeKey: barcodeKey(row[0]) ?? '',
        terms: productIndex(product),
        rank: loaded + position,
      };
    });
    await storage.append(
      pack.id,
      pending.generation,
      pending.next + index,
      rows,
      index + 1 === remaining.length,
    );
    loaded += file.count;
    progress(loaded);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  notifyUpdate();
}

function scoreProduct(product: FoodProduct, query: string, terms: string[]) {
  if (!terms.length) return 1;
  const title = fold(product.name);
  if (title === query) return 1000;
  const names = words(title).flatMap(variants);
  const descriptors = productWords(product);
  let score = 0;
  for (const term of terms) {
    const best = Math.max(
      ...variants(term).map((key) =>
        Math.max(wordScore(key, names) * 2, wordScore(key, descriptors)),
      ),
    );
    if (!best) return 0;
    score += best;
  }
  return score;
}

export async function searchCatalog({
  query,
  filters = {},
  cursor,
  excluded,
  accept,
  signal,
}: CatalogSearchOptions) {
  const storage = await getCatalogStorage();
  const installed = (await storage.list())
    .filter(
      (state): state is typeof state & { installed: string } =>
        !!state.installed,
    )
    .sort((a, b) => packageIds.indexOf(a.id) - packageIds.indexOf(b.id));
  const normalized = fold(query.trim().slice(0, 200));
  const terms = words(normalized).slice(0, 8);
  const key = barcodeKey(query.trim());
  if (key) {
    const found = await storage.barcode(key);
    return {
      rows:
        found &&
        !excluded?.has(key) &&
        matchesCatalogFilters(found, filters) &&
        (!accept || accept(found))
          ? [found]
          : [],
      next: null,
    };
  }
  const required = [
    ...(filters.country ? [`l:${filters.country}`] : []),
    ...(filters.category ? [`c:${fold(filters.category)}`] : []),
  ];
  const textPrefixes = terms.flatMap((term) =>
    variants(term).map((key) => `w:${key}`),
  );
  const fallback = terms
    .filter((term) => term.length >= 5)
    .flatMap((term) =>
      variants(term).flatMap((key) => [
        `w:${key.slice(0, 2)}`,
        `r:${reverse(key).slice(0, 3)}`,
      ]),
    );
  const brandPrefixes = words(filters.brand ?? '')
    .flatMap(variants)
    .map((term) => `b:${term}`);
  const pageSize = 20;
  const rows: FoodProduct[] = [];
  const seen = new Set(excluded);
  const first = cursor
    ? Math.max(
        0,
        installed.findIndex((state) => state.installed === cursor.generation),
      )
    : 0;
  let windows = 0;
  async function choosePrefix(generation: string) {
    const anchors = [...required, ...textPrefixes, ...brandPrefixes];
    for (const prefixes of [anchors, fallback]) {
      const counts = await Promise.all(
        [...new Set(prefixes)].map(async (prefix) => ({
          prefix,
          total: (await storage.candidates(generation, prefix, 0)).total,
        })),
      );
      if (
        counts.some(
          ({ prefix, total }) => required.includes(prefix) && total === 0,
        )
      )
        return undefined;
      const best = counts
        .filter((item) => item.total > 0)
        .sort((a, b) => a.total - b.total)[0];
      if (best) return best.prefix;
    }
    return anchors.length ? undefined : null;
  }
  for (const { installed: generation } of installed.slice(first)) {
    if (signal?.aborted) return { rows: [], next: null };
    const prefix =
      cursor?.generation === generation
        ? cursor.prefix
        : await choosePrefix(generation);
    if (prefix === undefined) continue;
    let offset: number | null =
      cursor?.generation === generation ? cursor.offset : 0;
    while (offset !== null) {
      if (signal?.aborted) return { rows: [], next: null };
      if (rows.length >= pageSize || windows >= 32)
        return { rows, next: { generation, prefix, offset } };
      const page = await storage.candidates(
        generation,
        prefix,
        pageSize - rows.length,
        offset,
      );
      windows++;
      offset = page.nextOffset;
      const ranked = page.rows
        .map((product) => ({
          product,
          score: scoreProduct(product, normalized, terms),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);
      for (const { product } of ranked) {
        const barcode = barcodeKey(product.barcode ?? '') ?? product.id;
        if (
          !seen.has(barcode) &&
          matchesCatalogFilters(product, filters) &&
          (!accept || accept(product))
        ) {
          seen.add(barcode);
          rows.push(product);
        }
      }
    }
  }
  return { rows, next: null };
}
