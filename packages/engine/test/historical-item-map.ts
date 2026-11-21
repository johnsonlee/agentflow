/**
 * Historical name-map hashes retain the one corrected label at ID402. Its chemical identity
 * remains NaClO; bleach.test.ts separately locks the old ID and new product ID. No other
 * name or ID receives normalization, and the historical expected hashes stay unchanged.
 */
export function historicalItemMap(defs: readonly { id: number; name: string }[]): [number, string][] {
  return defs.map(({ id, name }) => [id, id === 402 && name === "sodium_hypochlorite" ? "bleach" : name]);
}
