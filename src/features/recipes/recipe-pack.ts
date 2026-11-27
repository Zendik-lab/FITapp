import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { gunzipSync, strFromU8, strToU8 } from 'fflate';
import { Platform } from 'react-native';
import type { SettingsStorage } from '@/database/settings-contract';
import { validateRecipeExpansion } from './library';
import { recipeExpansion } from './library-expansion-manifest';
import type { LibraryRecipeData } from './library-types';

const key = 'catalog.recipe-expansion.v1';
const maxPayload = 4 * 1024 * 1024;
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const checksum = /^[a-f0-9]{64}$/;
const origin =
  process.env.EXPO_PUBLIC_CATALOG_ORIGIN ?? 'https://fitapp-epj.pages.dev';
const base =
  Platform.OS === 'web' ? '/catalog' : `${origin.replace(/\/$/, '')}/catalog`;

interface RecipePack {
  version: string;
  rows: readonly LibraryRecipeData[];
}

function invalid(): never {
  throw new Error(
    'Пакет рецептов повреждён или несовместим с этой версией FITapp.',
  );
}

function parseRows(payload: string, count: number): LibraryRecipeData[] {
  const value: unknown = JSON.parse(payload);
  if (!Array.isArray(value) || value.length !== count || !count)
    return invalid();
  const rows = value as LibraryRecipeData[];
  validateRecipeExpansion(rows);
  return rows;
}

export async function readRecipePack(
  storage: SettingsStorage,
): Promise<RecipePack | null> {
  const data = await storage.get(key);
  if (data === null) return null;
  if (data.length > maxPayload) return invalid();
  const record: unknown = JSON.parse(data);
  if (
    typeof record !== 'object' ||
    record === null ||
    !('version' in record) ||
    typeof record.version !== 'string' ||
    !checksum.test(record.version) ||
    !('payload' in record) ||
    typeof record.payload !== 'string' ||
    !('count' in record) ||
    typeof record.count !== 'number' ||
    !('rowsSha256' in record) ||
    digest(strToU8(record.payload)) !== record.rowsSha256
  )
    return invalid();
  return {
    version: record.version,
    rows: parseRows(record.payload, record.count),
  };
}

async function downloadRecipePack(progress: (percentage: number) => void) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${base}/${recipeExpansion.path}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(`Пакет рецептов недоступен (HTTP ${response.status}).`);
    if (!response.body?.getReader)
      return new Uint8Array(await response.arrayBuffer());
    const buffer = new Uint8Array(recipeExpansion.bytes);
    const reader = response.body.getReader();
    let loaded = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || loaded + value.length > buffer.length) return invalid();
        buffer.set(value, loaded);
        loaded += value.length;
        progress(Math.min(99, Math.round((100 * loaded) / buffer.length)));
      }
      return buffer.subarray(0, loaded);
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function installRecipePack(
  storage: SettingsStorage,
  download = downloadRecipePack,
  progress: (percentage: number) => void = () => {},
): Promise<RecipePack> {
  const current = await storage.get(key);
  if (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    navigator.storage?.estimate
  ) {
    const { quota, usage } = await navigator.storage.estimate();
    if (
      quota !== undefined &&
      usage !== undefined &&
      quota - usage < recipeExpansion.rawBytes * 2
    )
      throw new Error('Недостаточно места для пакета рецептов.');
  }
  const bytes = await download(progress);
  if (
    bytes.length !== recipeExpansion.bytes ||
    digest(bytes) !== recipeExpansion.version
  )
    return invalid();
  const raw = gunzipSync(bytes, {
    out: new Uint8Array(recipeExpansion.rawBytes),
  });
  if (
    raw.length !== recipeExpansion.rawBytes ||
    digest(raw) !== recipeExpansion.rowsSha256
  )
    return invalid();
  const payload = strFromU8(raw);
  const { count, version, rowsSha256 } = recipeExpansion;
  const rows = parseRows(payload, count);
  const value = JSON.stringify({ count, version, rowsSha256, payload });
  if (current !== value)
    await storage.apply([{ key, value }], { key, value: current });
  progress(100);
  return { rows, version };
}

export async function removeRecipePack(
  storage: SettingsStorage,
): Promise<void> {
  const current = await storage.get(key);
  if (current !== null)
    await storage.apply([{ key, value: null }], { key, value: current });
}
