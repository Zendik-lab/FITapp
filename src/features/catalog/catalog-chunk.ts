import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { gunzipSync, strFromU8 } from 'fflate';
import {
  invalid,
  isPackedProduct,
  type CatalogChunk,
  type PackedProduct,
} from './catalog-format';

export function decodeCatalogChunk(
  bytes: Uint8Array,
  file: CatalogChunk,
): PackedProduct[] {
  if (
    bytes.length !== file.bytes ||
    bytes.length < 18 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      bytes.length - 4,
      true,
    ) !== file.rawBytes ||
    bytesToHex(sha256(bytes)) !== file.sha256
  )
    return invalid();
  const data = gunzipSync(bytes, { out: new Uint8Array(file.rawBytes) });
  const rows: unknown = JSON.parse(strFromU8(data));
  if (
    !Array.isArray(rows) ||
    rows.length !== file.count ||
    !rows.every(isPackedProduct)
  )
    return invalid();
  return rows;
}
