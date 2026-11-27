/**
 * Book & Quill: a writable book that can be signed into a Written Book with a title and author.
 * Book contents live on the item stack (ItemStack.book) and are saved with the inventory.
 */
import type { ItemStack } from "./inventory";
import { itemId } from "../catalog/items";

import { BOOK_MAX_PAGES, BOOK_PAGE_CHARS, BOOK_TITLE_CHARS, readBookData, cloneBookData, hasBookPhotos } from "./book-state";
export { BOOK_MAX_PAGES, BOOK_PAGE_CHARS, BOOK_TITLE_CHARS } from "./book-state";
export type { BookData } from "./book-state";

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
  const idField=Object.getOwnPropertyDescriptor(stack,"id"),bookField=Object.getOwnPropertyDescriptor(stack,"book");
  if(!idField||!("value" in idField)||idField.value!==itemId("book_and_quill")||bookField&&(!("value" in bookField)||bookField.writable!==true)||!bookField&&!Object.isExtensible(stack))return false;
  try {
    const field = Object.getOwnPropertyDescriptor(stack, "book");
    if (field && !("value" in field)) return false;
    const previous = field ? cloneBookData(field.value) : { pages: [""] };
    const next = hasBookPhotos(previous) ? readBookData({ ...previous, pages: clampPages(pages) }) : { pages: clampPages(pages) };
    stack.book = next; return true;
  } catch { return false; }
}

/**
 * Signs a Book & Quill: it becomes a Written Book with a title and author and can no longer be
 * edited. Returns false if it isn't a Book & Quill or the title is blank.
 */
export function signBook(stack: ItemStack, title: string, author: string): boolean {
  const t = title.trim().slice(0, BOOK_TITLE_CHARS);
  const idField=Object.getOwnPropertyDescriptor(stack,"id"),bookField=Object.getOwnPropertyDescriptor(stack,"book");
  if(t===""||!idField||!("value" in idField)||idField.value!==itemId("book_and_quill")||idField.writable!==true||bookField&&(!("value" in bookField)||bookField.writable!==true)||!bookField&&!Object.isExtensible(stack))return false;
  let next;
  try {
    const field = Object.getOwnPropertyDescriptor(stack, "book");
    if (field && !("value" in field)) return false;
    const previous = field ? cloneBookData(field.value) : { pages: [""] };
    const signed = { ...previous, pages: clampPages(previous.pages), title: t, author: author.trim() || "Player" };
    next = hasBookPhotos(previous) ? readBookData(signed) : { pages: signed.pages, title: signed.title, author: signed.author };
  } catch { return false; }
  stack.id = itemId("written_book");
  stack.book = next;
  return true;
}
