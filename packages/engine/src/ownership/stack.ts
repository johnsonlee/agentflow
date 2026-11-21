import type { ItemStack } from "./inventory";

/** Detached ownership snapshot; never shares editable book pages with another owner. */
export function cloneStack(stack: ItemStack, count = stack.count): ItemStack {
  return { ...stack, count, ...(stack.book ? { book: { ...stack.book, pages: [...stack.book.pages] } } : {}) };
}

/** Zero wear and absent wear are equivalent; every supported book field participates. */
export function stacksCompatible(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && (a.damage ?? 0) === (b.damage ?? 0) &&
    (a.book === undefined && b.book === undefined || a.book !== undefined && b.book !== undefined &&
      a.book.title === b.book.title && a.book.author === b.book.author && JSON.stringify(a.book.pages) === JSON.stringify(b.book.pages));
}
