import { sha256Hex } from "./checksum";
/** Explicit application JSON RGBA pack, not a standard Minecraft .mcpack/ZIP decoder. */
export const MAX_PACK_BYTES = 8 * 1024 * 1024;
/** Application title/status bound, counted as Unicode code points after trimming. */
export const MAX_PACK_NAME_LENGTH = 80;
export interface SourceTile { width: 16 | 32; height: 16 | 32; rgba: Uint8ClampedArray<ArrayBuffer> }
export interface ParsedLocalTexturePack {
  version: 1;
  name: string;
  tiles: ReadonlyMap<string, SourceTile>;
  contentSha256: string;
  tileHashes: ReadonlyMap<string, string>;
}
const plain = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const own = (x: Record<string, unknown>, k: string): unknown => Object.prototype.hasOwnProperty.call(x, k) ? x[k] : undefined;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeRgba(raw: unknown, size: number): Uint8ClampedArray<ArrayBuffer> {
  const error = () => new Error("Texture RGBA must be canonical base64 with the exact pixel byte count");
  if (typeof raw !== "string" || raw.length !== Math.ceil(size / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) throw error();
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  if (raw.length / 4 * 3 - padding !== size || padding === 2 && (alphabet.indexOf(raw[raw.length - 3]) & 15) !== 0 || padding === 1 && (alphabet.indexOf(raw[raw.length - 2]) & 3) !== 0) throw error();
  const rgba = new Uint8ClampedArray(size); let at = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const a = alphabet.indexOf(raw[i]), b = alphabet.indexOf(raw[i + 1]), c = raw[i + 2] === "=" ? 0 : alphabet.indexOf(raw[i + 2]), d = raw[i + 3] === "=" ? 0 : alphabet.indexOf(raw[i + 3]);
    const n = a << 18 | b << 12 | c << 6 | d;
    rgba[at++] = n >>> 16;
    if (at < size) rgba[at++] = n >>> 8 & 255;
    if (at < size) rgba[at++] = n & 255;
  }
  return rgba;
}

/** Full-candidate rejection: callers retain their prior selection if any field is invalid. */
export async function parseLocalTexturePack(input: Uint8Array, allowedKeys: readonly string[]): Promise<ParsedLocalTexturePack> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > MAX_PACK_BYTES) throw new Error("Texture pack must be a nonempty JSON file no larger than 8 MiB");
  const bytes = Uint8Array.from(input); let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Texture pack must contain valid UTF-8 JSON"); }
  if (!plain(raw) || own(raw, "version") !== 1 || typeof own(raw, "name") !== "string" || !(own(raw, "name") as string).trim() || !Array.isArray(own(raw, "tiles")) || Object.keys(raw).some(key => !["version", "name", "tiles"].includes(key))) throw new Error("Texture pack requires version 1, a name and a tiles array");
  const name = (own(raw, "name") as string).trim();
  if ([...name].length > MAX_PACK_NAME_LENGTH) throw new Error("Texture pack name must be at most 80 Unicode characters");
  const entries = own(raw, "tiles") as unknown[], allowed = new Set(allowedKeys);
  if (entries.length === 0 || entries.length > allowed.size) throw new Error("Texture pack must contain one or more unique supported texture keys");
  const tiles = new Map<string, SourceTile>(), tileHashes = new Map<string, string>();
  for (const entry of entries) {
    if (!plain(entry) || Object.keys(entry).some(key => !["key", "width", "height", "rgbaBase64"].includes(key))) throw new Error("Invalid texture record");
    const key = own(entry, "key"), width = own(entry, "width"), height = own(entry, "height");
    if (typeof key !== "string" || !allowed.has(key)) throw new Error("Texture pack contains an unknown texture key");
    if (tiles.has(key)) throw new Error(`Texture pack repeats the key ${key}`);
    if ((width !== 16 && width !== 32) || height !== width) throw new Error(`Texture ${key} must be square 16×16 or 32×32 RGBA`);
    const rgba = decodeRgba(own(entry, "rgbaBase64"), width * width * 4);
    tiles.set(key, { width, height: width, rgba }); tileHashes.set(key, sha256Hex(new Uint8Array(rgba.buffer)));
  }
  return { version: 1, name, tiles, tileHashes, contentSha256: sha256Hex(bytes) };
}
