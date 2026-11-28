#!/usr/bin/env python3
"""Convert explicitly mapped local PNGs to the application's lossless RGBA JSON pack.

Requires Pillow in the invoking Python environment (CLI only, never installed automatically).
No native artwork, path discovery, archive extraction or layer/animation guessing is included.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import sys
import warnings

MAX_PACK_BYTES = 8 * 1024 * 1024
MAX_NAME_LENGTH = 80
# Same trimming characters as JavaScript String.trim, including NBSP and BOM.
TRIM = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_file(path: Path) -> bytes:
    if path.stat().st_size > MAX_PACK_BYTES:
        raise ValueError(f"Input exceeds the 8 MiB application file budget: {path}")
    data = path.read_bytes()
    if not data or len(data) > MAX_PACK_BYTES:
        raise ValueError(f"Input must be nonempty and at most 8 MiB: {path}")
    return data


def read_json(path: Path) -> tuple[object, bytes]:
    data = read_file(path)
    try:
        return json.loads(data.decode("utf-8-sig")), data
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"Invalid UTF-8 JSON: {path}") from error


def build_pack(manifest: Path, keys_file: Path | None = None) -> tuple[bytes, dict, set[Path]]:
    from PIL import Image, __version__ as pillow_version

    manifest = manifest.resolve(strict=True)
    raw, manifest_bytes = read_json(manifest)
    if (not isinstance(raw, dict) or set(raw) != {"version", "name", "tiles"}
            or isinstance(raw.get("version"), bool) or raw.get("version") != 1
            or not isinstance(raw.get("name"), str) or not isinstance(raw.get("tiles"), list)):
        raise ValueError("Manifest requires version 1, name and tiles:[{key,path}]")
    name = raw["name"].strip(TRIM)
    if not name or len(name) > MAX_NAME_LENGTH:
        raise ValueError("Pack name must contain 1–80 Unicode characters after trimming")
    if not raw["tiles"]:
        raise ValueError("Manifest must contain at least one texture")
    protected = {manifest}
    allowed = None
    keys_hash = None
    if keys_file is not None:
        keys_file = keys_file.resolve(strict=True)
        keys, keys_bytes = read_json(keys_file)
        if (not isinstance(keys, list) or any(not isinstance(k, str) or not k for k in keys)
                or len(set(keys)) != len(keys)):
            raise ValueError("--keys-json must contain an array of unique nonempty application keys")
        allowed = set(keys)
        keys_hash = checksum(keys_bytes)
        protected.add(keys_file)
    seen: set[str] = set()
    tiles, sources = [], []
    encoded_size = len(json.dumps({"version": 1, "name": name, "tiles": []}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1
    for entry in raw["tiles"]:
        if (not isinstance(entry, dict) or set(entry) != {"key", "path"}
                or not isinstance(entry.get("key"), str) or not entry["key"]
                or not isinstance(entry.get("path"), str) or not entry["path"]):
            raise ValueError("Each manifest tile requires exactly a nonempty key and relative PNG path")
        key, relative = entry["key"], entry["path"]
        if key in seen:
            raise ValueError(f"Duplicate texture key: {key}")
        if allowed is not None and key not in allowed:
            raise ValueError(f"Unknown application texture key: {key}")
        # Reject absolute Windows paths/drives too when running the converter on another platform.
        from pathlib import PureWindowsPath
        if Path(relative).is_absolute() or PureWindowsPath(relative).drive or "\x00" in relative:
            raise ValueError(f"Texture paths must be relative to the manifest: {relative}")
        source = (manifest.parent / relative).resolve(strict=True)
        source_bytes = read_file(source)
        # Pillow can expose a16-bit RGB/RGBA PNG as modeRGB/RGBA after silently reducing channels.
        # Inspect the actual IHDR first: output is8-bitRGBA, never an implicit16→8conversion.
        if (len(source_bytes) < 33 or source_bytes[:8] != b"\x89PNG\r\n\x1a\n"
                or source_bytes[8:16] != b"\x00\x00\x00\x0dIHDR"):
            raise ValueError(f"Texture must be an ordinary PNG with an IHDR header: {relative}")
        bit_depth = source_bytes[24]
        if bit_depth not in (1, 2, 4, 8):
            raise ValueError(f"Unsupported PNG bit depth {bit_depth}; no implicit channel downsampling: {relative}")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(source_bytes)) as image:
                    if image.format != "PNG" or image.width not in (16, 32) or image.height != image.width:
                        raise ValueError(f"Texture must be a square 16×16 or 32×32 PNG: {relative}")
                    if getattr(image, "n_frames", 1) != 1 or getattr(image, "is_animated", False):
                        raise ValueError(f"Animated PNG requires explicit future frame support: {relative}")
                    if image.mode not in ("1", "L", "LA", "P", "RGB", "RGBA"):
                        raise ValueError(f"Unsupported PNG channel format {image.mode}: {relative}")
                    width, mode = image.width, image.mode
                    rgba = image.convert("RGBA").tobytes()
                    profile_present = bool(image.info.get("icc_profile"))
                    gamma_present = "gamma" in image.info
        except (Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
            raise ValueError(f"PNG exceeds safe decoding dimensions: {relative}") from error
        seen.add(key)
        protected.add(source)
        tile = {"key": key, "width": width, "height": width,
                "rgbaBase64": base64.b64encode(rgba).decode("ascii")}
        encoded_size += len(json.dumps(tile, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + bool(tiles)
        if encoded_size > MAX_PACK_BYTES:
            raise ValueError("Converted pack exceeds the 8 MiB application file budget")
        tiles.append(tile)
        sources.append({"key": key, "path": relative, "resolvedPath": str(source),
                        "sourceBytes": len(source_bytes), "sourceSha256": checksum(source_bytes),
                        "sourceMode": mode, "sourceBitDepth": bit_depth, "width": width, "height": width,
                        "rgbaBytes": len(rgba), "rgbaSha256": checksum(rgba),
                        "iccProfilePresentNotApplied": profile_present,
                        "gammaMetadataPresentNotApplied": gamma_present})
    output = (json.dumps({"version": 1, "name": name, "tiles": tiles}, ensure_ascii=False,
                         separators=(",", ":")) + "\n").encode("utf-8")
    if len(output) > MAX_PACK_BYTES:
        raise ValueError("Converted pack exceeds the 8 MiB application file budget")
    report = {"version": 1, "format": "Application explicit RGBA JSON, not Minecraft .mcpack ZIP",
              "name": name, "manifestPath": str(manifest), "manifestSha256": checksum(manifest_bytes),
              "packBytes": len(output), "packSha256": checksum(output), "tiles": sources,
              "applicationKeys": {"checked": allowed is not None, "allowlistSha256": keys_hash,
                                  "note": "Validated against supplied key list" if allowed is not None else
                                  "Key existence is checked by the application on import; unknown keys reject the whole pack"},
              "decoder": {"library": "Pillow", "version": pillow_version},
              "transform": "Supported PNG channels decoded to 8-bit RGBA; 16-bit sources rejected; no resize, recolor, frame selection, gamma or ICC transform",
              "scope": "Local conversion only; no native-equivalence or media-use-permission claim"}
    return output, report, protected


def write_outputs(output_path: Path, report_path: Path, output: bytes, report: dict, protected: set[Path]) -> None:
    output_path, report_path = output_path.resolve(), report_path.resolve()
    if output_path == report_path or output_path in protected or report_path in protected:
        raise ValueError("Output/report paths must differ and must not replace any source file")
    if output_path.exists() or report_path.exists():
        raise ValueError("Refusing to overwrite an existing output or report")
    report_bytes = (json.dumps({**report, "outputPath": str(output_path)}, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    created: list[Path] = []
    try:
        for path, data in [(output_path, output), (report_path, report_bytes)]:
            with path.open("xb") as handle:
                created.append(path)
                handle.write(data)
    except BaseException:
        for path in created:
            path.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--keys-json", type=Path, help="Optional JSON array of application keys; app import always checks keys")
    args = parser.parse_args()
    try:
        output, report, protected = build_pack(args.manifest, args.keys_json)
        write_outputs(args.output, args.report, output, report, protected)
    except (ValueError, OSError, ImportError, UnicodeError) as error:
        print(f"Texture pack conversion failed: {error}", file=sys.stderr)
        return 1
    print(f"Wrote {len(report['tiles'])} explicitly mapped textures; SHA256 {report['packSha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
