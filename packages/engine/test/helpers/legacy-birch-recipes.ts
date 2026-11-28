import { expect } from 'vitest';
import type { Recipe } from '../../src';
import baseline from '../fixtures/birch-prefix-6893.json';
const widened: Record<string, string> = { wooden_pickaxe:'#', wooden_axe:'#', wooden_shovel:'#', wooden_sword:'#', wooden_hoe:'H', stick:'#', crafting_table:'#', bookshelf:'#' };
/** Explicit inverse of this increment's nine permitted row changes, for historical goldens. */
export function withLegacyBirchRecipes(recipes: readonly Recipe[]): Recipe[] {
 return recipes.map(recipe => {
  const old = baseline.recipes.find(r => r.id === (recipe.id === 'birch_planks' ? 'oak_planks_from_birch' : recipe.id));
  if (recipe.id === 'birch_planks') {
   expect(recipe).toEqual({id:'birch_planks',ingredients:['birch_log'],result:['birch_planks',4]});
   return old as Recipe;
  }
  const copy = {...recipe};
  if (widened[recipe.id]) {
   expect(recipe.keyTags).toEqual({[widened[recipe.id]]:'planks'});
   delete copy.keyTags;
   if (recipe.id === 'bookshelf') {
    expect(recipe.note).toBe('Available Oak/Birch subset of the declared plank tag; other wood species remain unmodeled');
    copy.note = old!.note;
   }
  } else expect(recipe.keyTags).toBeUndefined();
  return copy;
 });
}
