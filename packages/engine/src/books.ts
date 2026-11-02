/**
 * Book & Quill: a writable book that can be signed into a Written Book with a title and author.
 * Book contents live on the item stack (ItemStack.book) and are saved with the inventory.
 */
import type { ItemStack } from "./inventory";
import { itemId } from "./items";

export const BOOK_MAX_PAGES = 50;
export const BOOK_PAGE_CHARS = 256;
export const BOOK_TITLE_CHARS = 32;

export interface BookData {
  pages: string[];
  title?: string;
  author?: string;
}

export function isWritableBook(stack: ItemStack | null | undefined): boolean {
  return !!stack && stack.id === itemId("book_and_quill");
}

export function isWrittenBook(stack: ItemStack | null | undefined): boolean {
  return !!stack && stack.id === itemId("written_book");
}

/** Normalises pages to the limits (at least one page). */
export function clampPages(pages: readonly string[]): string[] {
  const out = pages.slice(0, BOOK_MAX_PAGES).map((p) => p.slice(0, BOOK_PAGE_CHARS));
  return out.length > 0 ? out : [""];
}

/** Saves pages into a Book & Quill stack. Returns false if it isn't one. */
export function writeBook(stack: ItemStack, pages: readonly string[]): boolean {
  if (!isWritableBook(stack)) return false;
  stack.book = { pages: clampPages(pages) };
  return true;
}

/**
 * Signs a Book & Quill: it becomes a Written Book with a title and author and can no longer be
 * edited. Returns false if it isn't a Book & Quill or the title is blank.
 */
export function signBook(stack: ItemStack, title: string, author: string): boolean {
  const t = title.trim().slice(0, BOOK_TITLE_CHARS);
  if (!isWritableBook(stack) || t === "") return false;
  stack.id = itemId("written_book");
  stack.book = { pages: clampPages(stack.book?.pages ?? [""]), title: t, author: author.trim() || "Player" };
  return true;
}
