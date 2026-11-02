import { describe, expect, it } from "vitest";
import {
  AIR, BOOK_PAGE_CHARS, CHALKBOARD_SIZES, Inventory, MOB_SPECS, World, blockId, breakBlock, canEditChalkboard, canPlaceChalkboard,
  chalkboardCells, chalkboardSizeOf, clampChalkText, creativeBlocks, facingTowards, itemId, matchRecipe, parseSave, serializeSave,
  signBook, stackId, writeBook, type Chalkboard,
} from "../src";

const base = {
  name: "w", seed: 1, mode: "survival" as const, timeOfDay: 0.3,
  player: { position: { x: 0, y: 60, z: 0 }, yaw: 0, pitch: 0, flying: false }, edits: [],
};

describe("chalkboards (Education Edition)", () => {
  it("come in three sizes: Slate 1x1, Poster 2x1, Board 3x2, all in the creative palette", () => {
    expect([CHALKBOARD_SIZES.slate, CHALKBOARD_SIZES.poster, CHALKBOARD_SIZES.board].map((s) => [s.w, s.h])).toEqual([[1, 1], [2, 1], [3, 2]]);
    const names = creativeBlocks().map((b) => b.name);
    for (const n of ["chalkboard_slate", "chalkboard_poster", "chalkboard_board"]) expect(names).toContain(n);
    expect(chalkboardSizeOf(blockId("chalkboard_board"))).toBe("board");
    expect(chalkboardSizeOf(blockId("stone"))).toBeNull();
  });

  it("face the player who places them and extend to the viewer's right and upwards", () => {
    // Player looking north (-Z, yaw 0): the board faces south (+Z) and extends east (+X).
    expect(facingTowards(0)).toBe(0);
    expect(facingTowards(Math.PI)).toBe(2);
    const cells = chalkboardCells({ x: 0, y: 51, z: 0, size: "board", facing: 0 });
    expect(cells).toHaveLength(6);
    expect(cells).toContainEqual({ x: 2, y: 52, z: 0 });
    // Facing east (+X): the viewer stands east of it looking west (-X), whose right-hand side is -Z.
    const east = chalkboardCells({ x: 0, y: 51, z: 0, size: "poster", facing: 3 });
    expect(east).toEqual([{ x: 0, y: 51, z: 0 }, { x: 0, y: 51, z: -1 }]);
  });

  it("need free space for every cell", () => {
    const w = new World(1);
    for (let x = -3; x <= 3; x++) for (let y = 51; y <= 54; y++) w.setBlock(x, y, 0, AIR);
    const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
    expect(canPlaceChalkboard(get, { x: 0, y: 51, z: 0, size: "board", facing: 0 })).toBe(true);
    w.setBlock(2, 52, 0, blockId("stone"));
    expect(canPlaceChalkboard(get, { x: 0, y: 51, z: 0, size: "board", facing: 0 })).toBe(false);
    expect(canPlaceChalkboard(get, { x: 0, y: 51, z: 0, size: "poster", facing: 0 })).toBe(true);
  });

  it("text is clamped to the size, and a lock limits editing to world builders (creative)", () => {
    expect(clampChalkText("slate", "x".repeat(500))).toHaveLength(CHALKBOARD_SIZES.slate.maxChars);
    const b: Chalkboard = { x: 0, y: 51, z: 0, size: "slate", facing: 0, standing: false, text: "Hi", locked: false };
    expect(canEditChalkboard(b, "survival")).toBe(true);
    b.locked = true;
    expect(canEditChalkboard(b, "survival")).toBe(false);
    expect(canEditChalkboard(b, "creative")).toBe(true);
  });

  it("are saved and loaded with their text, size, facing and lock", () => {
    const boards: Chalkboard[] = [{ x: 3, y: 51, z: -2, size: "board", facing: 1, standing: true, text: "Line 1\nLine 2", locked: true }];
    const save = parseSave(serializeSave({ ...base, inventory: new Inventory().toJSON(), chalkboards: boards }));
    expect(save.chalkboards).toEqual(boards);
  });
});

describe("Book & Quill", () => {
  it("comes from a book (bookshelves drop 3), an ink sac and a chicken feather", () => {
    const s = (n: string) => ({ id: stackId(n), count: 1 });
    expect(matchRecipe([s("book"), s("ink_sac"), s("feather"), null], 2)?.result).toEqual({ id: itemId("book_and_quill"), count: 1 });
    expect(matchRecipe([s("coal"), null, null, null], 2)?.result.id).toBe(itemId("ink_sac"));
    expect(MOB_SPECS.chicken.extraDrop).toEqual(["feather", 1]);
    const w = new World(1);
    w.setBlock(0, 51, 0, blockId("bookshelf"));
    const inv = new Inventory();
    breakBlock(w, inv, "survival", 0, 51, 0);
    expect(inv.slots[0]).toEqual({ id: itemId("book"), count: 3 });
  });

  it("writes pages, then signing makes a Written Book with title and author", () => {
    const stack = { id: itemId("book_and_quill"), count: 1 } as { id: number; count: number; book?: { pages: string[]; title?: string; author?: string } };
    expect(writeBook(stack, ["Page one", "x".repeat(BOOK_PAGE_CHARS + 10)])).toBe(true);
    expect(stack.book!.pages[1]).toHaveLength(BOOK_PAGE_CHARS);
    expect(signBook(stack, "   ", "Me")).toBe(false);
    expect(signBook(stack, "My Story", "Alex")).toBe(true);
    expect(stack.id).toBe(itemId("written_book"));
    expect(stack.book).toMatchObject({ title: "My Story", author: "Alex" });
    expect(stack.book!.pages[0]).toBe("Page one");
    // A written book can't be edited or re-signed.
    expect(writeBook(stack, ["changed"])).toBe(false);
    expect(signBook(stack, "Again", "Alex")).toBe(false);
  });

  it("book contents survive saving and loading", () => {
    const inv = new Inventory();
    inv.addStack({ id: itemId("written_book"), count: 1, book: { pages: ["a", "b"], title: "T", author: "A" } });
    inv.addStack({ id: itemId("book_and_quill"), count: 1, book: { pages: ["draft"] } });
    const loaded = Inventory.fromJSON(parseSave(serializeSave({ ...base, inventory: inv.toJSON() })).inventory);
    expect(loaded.slots[0]).toEqual({ id: itemId("written_book"), count: 1, book: { pages: ["a", "b"], title: "T", author: "A" } });
    expect(loaded.slots[1]).toEqual({ id: itemId("book_and_quill"), count: 1, book: { pages: ["draft"] } });
  });
});
