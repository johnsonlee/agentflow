/** Stable stack-ID namespaces. World buffers store block IDs only, never item IDs. */
export const LEGACY_BLOCK_ID_LIMIT = 255;
export const ITEM_ID_BASE = 256;
export const ITEM_ID_LIMIT = 32767;
export const EXTENDED_BLOCK_ID_BASE = 32768;
export const BLOCK_ID_LIMIT = 65535;

export function isBlockNamespace(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id <= BLOCK_ID_LIMIT &&
    (id <= LEGACY_BLOCK_ID_LIMIT || id >= EXTENDED_BLOCK_ID_BASE);
}
