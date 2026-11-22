"""Synthetic-only converter correctness checks; run with a Python environment containing Pillow."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import struct
import zlib
from unittest.mock import patch
from PIL import Image

TOOL = Path(__file__).with_name("build-local-texture-pack.py")
spec = importlib.util.spec_from_file_location("pack_converter", TOOL)
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ConverterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.manifest = self.root / "mapping.json"
        self.source = self.root / "rgba.png"
        self.output, self.report = self.root / "pack.json", self.root / "report.json"
        rgba = Image.new("RGBA", (16, 16), (11, 22, 33, 255))
        rgba.putpixel((0, 0), (41, 83, 127, 0))
        rgba.save(self.source)
        self.write_manifest()

    def write_manifest(self, tiles=None, **changes):
        raw = {"version": 1, "name": "  Synthetic 化学 🧪  ", "tiles": tiles if tiles is not None else [{"key": "stone", "path": "rgba.png"}]}
        raw.update(changes)
        self.manifest.write_text(json.dumps(raw), encoding="utf-8")

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(TOOL), "--manifest", str(self.manifest), "--output", str(self.output), "--report", str(self.report), *args], capture_output=True, text=True)

    def test_actual_cli_preserves_rgba_hidden_rgb_rgb_and_palette32_with_hash_provenance(self):
        Image.new("RGB", (16, 16), (91, 52, 16)).save(self.root / "rgb.png")
        palette = Image.new("P", (32, 32), 1)
        palette.putpalette([3, 5, 7, 131, 71, 37] + [0] * (768 - 6))
        palette.info["transparency"] = bytes([0, 255])
        palette.putpixel((0, 0), 0)
        palette.save(self.root / "palette.png")
        self.write_manifest([{"key": "stone", "path": "rgba.png"}, {"key": "grass_side", "path": "rgb.png"}, {"key": "item_iron_ingot", "path": "palette.png"}])
        keys = self.root / "keys.json"
        keys.write_text(json.dumps(["stone", "grass_side", "item_iron_ingot"]))
        result = self.run_cli("--keys-json", str(keys))
        self.assertEqual(result.returncode, 0, result.stderr)
        pack = json.loads(self.output.read_bytes())
        report = json.loads(self.report.read_bytes())
        self.assertEqual(pack["name"], "Synthetic 化学 🧪")
        self.assertEqual(report["packSha256"], hashlib.sha256(self.output.read_bytes()).hexdigest())
        self.assertTrue(report["applicationKeys"]["checked"])
        for entry, source in zip(pack["tiles"], report["tiles"]):
            rgba = base64.b64decode(entry["rgbaBase64"], validate=True)
            self.assertEqual(len(rgba), entry["width"] ** 2 * 4)
            self.assertEqual(source["rgbaSha256"], hashlib.sha256(rgba).hexdigest())
            self.assertEqual(source["sourceSha256"], hashlib.sha256(Path(source["resolvedPath"]).read_bytes()).hexdigest())
        self.assertEqual(base64.b64decode(pack["tiles"][0]["rgbaBase64"])[:4], bytes([41, 83, 127, 0]))
        self.assertEqual(base64.b64decode(pack["tiles"][1]["rgbaBase64"])[:4], bytes([91, 52, 16, 255]))
        self.assertEqual([pack["tiles"][2]["width"], pack["tiles"][2]["height"]], [32, 32])
        self.assertEqual(base64.b64decode(pack["tiles"][2]["rgbaBase64"])[:8], bytes([3, 5, 7, 0, 131, 71, 37, 255]))
        # Exercise the actual TypeScript import authority, not only a mirrored JSON schema.
        project = TOOL.parent.parent
        harness = self.root / "check.ts"
        parser = project / "packages/textures/src/resource-packs/resource-pack.ts"
        harness.write_text('import {readFileSync} from "node:fs";\nimport {parseLocalTexturePack} from ' + json.dumps(str(parser)) + ';\nconst p=await parseLocalTexturePack(readFileSync(' + json.dumps(str(self.output)) + '),["stone","grass_side","item_iron_ingot"]);\nconsole.log(p.contentSha256+" "+p.tiles.size);\n')
        checked = subprocess.run([str(project / "node_modules/.bin/vite-node"), str(harness)], cwd=project, capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(checked.stdout.strip(), report["packSha256"] + " 3")

    def test_explicit_birch_mapping_preserves_key_and_pixels_without_oak_alias(self):
        self.write_manifest([{"key": "birch_planks", "path": "rgba.png"}])
        keys = self.root / "keys.json"
        keys.write_text(json.dumps(["oak_planks", "birch_planks"]))
        result = self.run_cli("--keys-json", str(keys))
        self.assertEqual(result.returncode, 0, result.stderr)
        pack = json.loads(self.output.read_bytes())
        report = json.loads(self.report.read_bytes())
        self.assertEqual([tile["key"] for tile in pack["tiles"]], ["birch_planks"])
        rgba = base64.b64decode(pack["tiles"][0]["rgbaBase64"], validate=True)
        self.assertEqual(rgba, Image.open(self.source).convert("RGBA").tobytes())
        self.assertEqual(report["tiles"][0]["rgbaSha256"], hashlib.sha256(rgba).hexdigest())
        self.assertEqual(report["packSha256"], hashlib.sha256(self.output.read_bytes()).hexdigest())

    def test_explicit_cane_paper_application_keys_preserve_source_pixels(self):
        keys = ["sugar_cane_plant", "item_sugar_cane", "item_paper"]
        self.write_manifest(tiles=[{"key": key, "path": "rgba.png"} for key in keys])
        output, report, _ = converter.build_pack(self.manifest)
        pack = json.loads(output)
        self.assertEqual([tile["key"] for tile in pack["tiles"]], keys)
        expected = Image.open(self.source).convert("RGBA").tobytes()
        for tile in pack["tiles"]:
            self.assertEqual(base64.b64decode(tile["rgbaBase64"]), expected)

    def test_explicit_four_leather_application_keys_preserve_source_pixels(self):
        keys = ["item_leather_helmet", "item_leather_chestplate", "item_leather_leggings", "item_leather_boots"]
        self.write_manifest([{"key": key, "path": "rgba.png"} for key in keys])
        output, report, _ = converter.build_pack(self.manifest)
        pack = json.loads(output)
        self.assertEqual([tile["key"] for tile in pack["tiles"]], keys)
        expected = Image.open(self.source).convert("RGBA").tobytes()
        for tile in pack["tiles"]:
            self.assertEqual(base64.b64decode(tile["rgbaBase64"]), expected)

    def test_explicit_three_chest_faces_keep_distinct_application_bindings(self):
        keys = ["chest_top", "chest_side", "chest_bottom"]
        self.write_manifest([{"key": key, "path": "rgba.png"} for key in keys])
        allowed = self.root / "keys.json"
        allowed.write_text(json.dumps(keys))
        result = self.run_cli("--keys-json", str(allowed))
        self.assertEqual(result.returncode, 0, result.stderr)
        pack = json.loads(self.output.read_bytes())
        self.assertEqual([tile["key"] for tile in pack["tiles"]], keys)
        for tile in pack["tiles"]:
            self.assertEqual(base64.b64decode(tile["rgbaBase64"]), Image.open(self.source).convert("RGBA").tobytes())

    def test_default_conversion_explicitly_defers_known_keys_to_application(self):
        self.write_manifest([{"key": "explicit_future_key", "path": "rgba.png"}])
        self.assertEqual(self.run_cli().returncode, 0)
        report = json.loads(self.report.read_bytes())
        self.assertFalse(report["applicationKeys"]["checked"])
        self.assertIn("unknown keys reject the whole pack", report["applicationKeys"]["note"])

    def test_unknown_keys_duplicate_keys_and_whole_manifest_refusal_leave_no_outputs(self):
        keys = self.root / "keys.json"
        keys.write_text('["stone"]')
        for entries in [[{"key": "stone", "path": "rgba.png"}, {"key": "stone", "path": "rgba.png"}], [{"key": "unknown", "path": "rgba.png"}], [{"key": "stone", "path": "rgba.png"}, {"key": "other", "path": "missing.png"}]]:
            self.write_manifest(entries)
            self.assertNotEqual(self.run_cli("--keys-json", str(keys)).returncode, 0)
            self.assertFalse(self.output.exists())
            self.assertFalse(self.report.exists())

    def test_no_resize_no_implicit_frame_and_no_non_png_conversion(self):
        for size, extension in [((8, 8), "png"), ((16, 32), "png"), ((16, 16), "jpg")]:
            path = self.root / ("bad." + extension)
            Image.new("RGB", size).save(path)
            self.write_manifest([{"key": "stone", "path": path.name}])
            self.assertNotEqual(self.run_cli().returncode, 0)
        frames = [Image.new("RGBA", (16, 16), color) for color in ["red", "blue"]]
        frames[0].save(self.root / "animated.png", save_all=True, append_images=frames[1:], duration=50, loop=0)
        self.write_manifest([{"key": "stone", "path": "animated.png"}])
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse(self.output.exists())

    def test_indexed_1_2_4_bit_pngs_preserve_palette_color_and_transparency(self):
        for depth in (1, 2, 4):
            image = Image.new("P", (16, 16), 1)
            image.putpalette([17, 19, 23, 71, 73, 79] + [0] * (768 - 6))
            image.info["transparency"] = bytes([0, 255])
            image.putpixel((0, 0), 0)
            source = self.root / f"indexed-{depth}.png"
            image.save(source, bits=depth)
            self.assertEqual(source.read_bytes()[24], depth)
            self.write_manifest([{"key": "stone", "path": source.name}])
            output, report, _ = converter.build_pack(self.manifest)
            rgba = base64.b64decode(json.loads(output)["tiles"][0]["rgbaBase64"])
            self.assertEqual(rgba[:8], bytes([17, 19, 23, 0, 71, 73, 79, 255]))
            self.assertEqual(report["tiles"][0]["sourceBitDepth"], depth)

    def test_rejects_16bit_rgb_and_rgba_before_pillow_can_reduce_channels(self):
        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
        for color_type, channels in [(2, 3), (6, 4)]:
            values = [0x1234, 0x5678, 0x9abc, 0xdef0][:channels]
            pixel = b"".join(struct.pack(">H", value) for value in values)
            ihdr = struct.pack(">IIBBBBB", 16, 16, 16, color_type, 0, 0, 0)
            payload = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress((b"\0" + pixel * 16) * 16)) + chunk(b"IEND", b"")
            source = self.root / f"synthetic16-{color_type}.png"
            source.write_bytes(payload)
            # The mode alone looks acceptable; the original bitdepth is what must be checked.
            with Image.open(source) as image:
                self.assertIn(image.mode, ("RGB", "RGBA"))
            self.write_manifest([{"key": "stone", "path": source.name}])
            result = self.run_cli()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("bit depth 16", result.stderr)
            self.assertFalse(self.output.exists())

    def test_input_output_budget_name_and_path_validation(self):
        for changes in [{"name": " "}, {"name": "🧪" * 81}, {"version": True}, {"tiles": []}]:
            self.write_manifest(**changes)
            self.assertNotEqual(self.run_cli().returncode, 0)
        self.write_manifest([{"key": "stone", "path": str(self.source)}])
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.write_manifest()
        with patch.object(converter, "MAX_PACK_BYTES", 1000):
            with self.assertRaisesRegex(ValueError, "Converted pack exceeds"):
                converter.build_pack(self.manifest)
        self.assertFalse(self.output.exists())

    def test_refuses_existing_outputs_sources_and_duplicate_destination(self):
        self.output.write_bytes(b"preserve existing")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.output.read_bytes(), b"preserve existing")
        self.assertFalse(self.report.exists())
        output, report, protected = converter.build_pack(self.manifest)
        original = self.source.read_bytes()
        with self.assertRaises(ValueError):
            converter.write_outputs(self.source, self.report, output, report, protected)
        with self.assertRaises(ValueError):
            converter.write_outputs(self.report, self.report, output, report, protected)
        self.assertEqual(self.source.read_bytes(), original)
        self.output.unlink()
        with self.assertRaises(OSError):
            converter.write_outputs(self.output, self.root / "missing-parent" / "report.json", output, report, protected)
        self.assertFalse(self.output.exists())
        self.report.write_bytes(b"preserve report")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertEqual(self.report.read_bytes(), b"preserve report")


if __name__ == "__main__":
    unittest.main(verbosity=2)
