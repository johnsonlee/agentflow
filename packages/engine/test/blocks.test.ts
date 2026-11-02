import { describe, expect, it } from "vitest";
import { AIR, BLOCKS, blockById, blockId, creativeBlocks, isOpaque, isSolid, textureNames } from "../src";

describe("block registry", () => {
  it("assigns ids by index with air at 0", () => {
    expect(AIR).toBe(0);
    BLOCKS.forEach((b, i) => expect(b.id).toBe(i));
    expect(blockById(blockId("stone")).name).toBe("stone");
  });

  it("fits in a Uint8 chunk array and has unique names", () => {
    expect(BLOCKS.length).toBeLessThan(256);
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(BLOCKS.length);
  });

  it("resolves drops by name", () => {
    expect(blockById(blockId("grass")).drop).toBe(blockId("dirt"));
    expect(blockById(blockId("stone")).drop).toBe(blockId("cobblestone"));
    expect(blockById(blockId("dirt")).drop).toBeUndefined();
  });

  it("classifies opacity and solidity", () => {
    expect(isOpaque(blockId("stone"))).toBe(true);
    expect(isOpaque(blockId("glass"))).toBe(false);
    expect(isOpaque(blockId("oak_leaves"))).toBe(false);
    expect(isSolid(blockId("water"))).toBe(false);
    expect(isSolid(blockId("poppy"))).toBe(false);
    expect(isSolid(blockId("glass"))).toBe(true);
  });

  it("exposes Education Edition world-builder blocks in the creative inventory", () => {
    const names = creativeBlocks().map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(["allow", "deny", "border"]));
    expect(names).not.toContain("air");
    expect(names).not.toContain("water");
  });

  it("lists every face texture", () => {
    expect(textureNames()).toEqual(expect.arrayContaining(["grass_top", "grass_side", "dirt", "oak_log_top"]));
    expect(textureNames()).not.toContain("none");
  });

  it("throws on unknown blocks", () => {
    expect(() => blockId("nope")).toThrow();
    expect(() => blockById(999)).toThrow();
  });
});
