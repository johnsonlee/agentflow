import { readBookData, cloneBookData, hasBookPhotos } from "./book-state";
import { inspectItemState } from "./item-state";
import { inspectSparklerState, sparklerColor, type SparklerActivationResult } from "./sparkler-state";
import type { ItemStack } from "./inventory";
import { baseStackId, isKnownId, maxStackOf } from "../catalog/items";
import { glowStickColor, inspectGlowState, type GlowActivationResult } from "./glow-stick-state";

/** Detached ownership snapshot; never shares editable book pages or glow state with another owner. */
interface StackBirth{book:object|undefined;pages:object|undefined;glow:object|undefined;sparkler:object|undefined;photoTree?:object[]}
const stackBirths=new WeakMap<object,StackBirth>();
const birthGet=Function.prototype.call.bind(WeakMap.prototype.get) as (map:WeakMap<object,StackBirth>,key:object)=>StackBirth|undefined;
const ownField=Object.getOwnPropertyDescriptor,ownKeys=Reflect.ownKeys,prototype=Object.getPrototypeOf;
const objectPrototype=Object.prototype,arrayPrototype=Array.prototype;
export function cloneStack(stack: ItemStack, count = stack.count): ItemStack {
  const bookField=ownField(stack,'book'),damageField=ownField(stack,'damage');
  // Unsupported accessor input is copied as an untrusted descriptor tree, never evaluated/adopted.
  // Callers' structural/factory gates refuse it; no photo owner is silently reconstructed.
  if(bookField&&!('value'in bookField))return Object.defineProperties({},Object.getOwnPropertyDescriptors(stack)) as ItemStack;
  let book:ItemStack['book'],glow:ItemStack['glow'],sparkler:ItemStack['sparkler'];
  const result={ ...stack, count, ...(bookField?.value ? { book: (book=cloneBookData(bookField.value)) } : {}), ...(stack.glow ? { glow: (glow={ ...stack.glow }) } : {}), ...(stack.sparkler ? { sparkler: (sparkler={ ...stack.sparkler }) } : {}) };
  // Canonicalize only supported optional own-data undefined values, on new
  // allocations. Never repair a photo marker, unknown field, accessor or zero wear.
  if (bookField && "value" in bookField && bookField.value === undefined) delete result.book;
  if (damageField && "value" in damageField && damageField.value === undefined) delete result.damage;
  if (book && !hasBookPhotos(book)) for (const name of ["title", "author"] as const) {
    const field = ownField(book, name);
    if (field && "value" in field && field.value === undefined) delete book[name];
  }
  // Only this freshly allocated result and its freshly allocated nested nodes acquire
  // provenance. No public function can adopt an arbitrary existing node or Proxy.
  stackBirths.set(result,{book,pages:book?ownField(book,'pages')?.value:undefined,glow,sparkler,
    ...(book?.photoPages?{photoTree:[book.photoPages,book.photoPages.entries,...book.photoPages.entries]}:{})});
  return result;
}
/** Canonical-ID ownership clone. Normalize only the freshly allocated factory root;
 * spreading that root into another object would discard its private provenance. */
export function cloneStackWithBaseId(stack: ItemStack): ItemStack {
  const sourceId = ownField(stack, "id"), sourceCount = ownField(stack, "count");
  if (!sourceId || !("value" in sourceId) || typeof sourceId.value !== "number"
    || !sourceCount || !("value" in sourceCount) || typeof sourceCount.value !== "number")
    return Object.defineProperties({}, Object.getOwnPropertyDescriptors(stack)) as ItemStack;
  const result = cloneStack(stack, sourceCount.value);
  // cloneStack preserves accessor input as an untrusted descriptor tree. Never
  // inspect/normalize that tree or turn it into a factory-born owner.
  if (!birthGet(stackBirths, result)) return result;
  const id = ownField(result, "id");
  if (id && "value" in id && typeof id.value === "number" && id.writable)
    result.id = baseStackId(id.value);
  return result;
}
export interface FactoryStackSnapshot{readonly root:ItemStack;readonly values:readonly(string|number|boolean)[];readonly data:ItemStack}
/** Non-invoking provenance gate FIRST; reflect only locally allocated original ordinary
 * nodes afterward. Unknown/replaced/revoked Proxy identities never reach reflection. */
export function snapshotFactoryStack(value:unknown):FactoryStackSnapshot|undefined{
 try{
  if(value===null||typeof value!=='object')return undefined;const birth=birthGet(stackBirths,value);if(!birth)return undefined;
  const fields=(node:object,allowed:readonly string[],required:readonly string[])=>{
   if(prototype(node)!==objectPrototype)return undefined;const out:Record<string,PropertyDescriptor> =Object.create(null),keys=ownKeys(node);
   for(const key of keys){if(typeof key!=='string'||!allowed.includes(key))return undefined;const d=ownField(node,key);if(!d?.enumerable||!('value'in d))return undefined;out[key]=d;}
   if(required.some(key=>!out[key]))return undefined;return out;
  };
  const f=fields(value,['id','count','damage','book','glow','sparkler'],['id','count']);if(!f||!Number.isSafeInteger(f.id.value)||!Number.isSafeInteger(f.count.value)||f.count.value<1)return undefined;
  const data:ItemStack=Object.assign(Object.create(null),{id:f.id.value,count:f.count.value}),values:(string|number|boolean)[]=[f.id.value,f.count.value,!!f.damage,!!f.book,!!f.glow,!!f.sparkler];
  if(f.damage){if(!Number.isSafeInteger(f.damage.value)||f.damage.value<0)return undefined;data.damage=f.damage.value;values.push(f.damage.value);}
  if(f.book){
   if(!birth.book||f.book.value!==birth.book)return undefined;
   const b=fields(birth.book,['pages','title','author','photoPages'],['pages']);
   if(!b||!birth.pages||b.pages.value!==birth.pages||prototype(birth.pages)!==arrayPrototype)return undefined;
   if(b.photoPages){
    const tree=birth.photoTree;if(!tree||b.photoPages.value!==tree[0])return undefined;
    const p=fields(tree[0],['version','entries'],['version','entries']);if(!p||p.entries.value!==tree[1]||prototype(tree[1])!==arrayPrototype)return undefined;
    const n=ownField(tree[1],'length')?.value;if(n!==tree.length-2)return undefined;
    for(let i=0;i<n;i++)if(ownField(tree[1],String(i))?.value!==tree[i+2])return undefined;
   }else if(birth.photoTree)return undefined;
   if(b.photoPages){const book=readBookData(birth.book);data.book=book;values.push(JSON.stringify(book));}
   else {
    const len=ownField(birth.pages,'length');if(!len||!('value'in len)||!Number.isSafeInteger(len.value)||len.value<0||len.value>50||ownKeys(birth.pages).length!==len.value+1)return undefined;
    const pages:string[]=[];for(let i=0;i<len.value;i++){const p=ownField(birth.pages,String(i));if(!p?.enumerable||!('value'in p)||typeof p.value!=='string')return undefined;pages.push(p.value);}
    data.book=Object.assign(Object.create(null),{pages});values.push(!!b.title,!!b.author,pages.length,...pages);
    for(const name of ['title','author']as const)if(b[name]){if(typeof b[name].value!=='string')return undefined;data.book![name]=b[name].value;values.push(b[name].value);}
   }
  }
  for(const name of ['glow','sparkler'] as const)if(f[name]){const original=birth[name];if(!original||f[name].value!==original)return undefined;const state=fields(original,['state'],['state']);if(!state||state.state.value!=='active'&&state.state.value!=='inactive')return undefined;data[name]={state:state.state.value};values.push(name,state.state.value);}
  return{root:value as ItemStack,values,data};
 }catch{return undefined;}
}

/** Structural guard for supported book metadata before detached ownership cloning.
 * This neither clamps pages nor changes valid ordinary book/tool behavior. It is not a raw-save
 * recovery policy; serializers and other public ownership boundaries still need integration. */
export function hasCloneableBookMetadata(stack: ItemStack): boolean {
 try { const d=ownField(stack,'book');if(!d)return true;if(!('value'in d))return false;if(d.value===undefined)return true;cloneBookData(d.value);return true; }catch{return false;}
}

/** Zero wear and absent wear are equivalent; every supported book field participates. */
export function stacksCompatible(a: ItemStack, b: ItemStack): boolean {
  if (!hasCloneableBookMetadata(a) || !hasCloneableBookMetadata(b)) return false;
  const aGlow = inspectItemState(a, true), bGlow = inspectItemState(b, true);
  if (aGlow.kind === "invalid" || bGlow.kind === "invalid" || aGlow.kind !== bGlow.kind) return false;
  return a.id === b.id && (a.damage ?? 0) === (b.damage ?? 0) &&
    (a.book === undefined && b.book === undefined || a.book !== undefined && b.book !== undefined &&
      (hasBookPhotos(a.book)||hasBookPhotos(b.book) ? JSON.stringify(cloneBookData(a.book)) === JSON.stringify(cloneBookData(b.book)) : a.book.title===b.book.title&&a.book.author===b.book.author&&JSON.stringify(a.book.pages)===JSON.stringify(b.book.pages)));
}

/** Metadata-aware capacity; maxStackOf(id) remains the unchanged registry limit. */
export function stackLimit(stack: ItemStack): number {
  const glow = inspectItemState(stack, true);
  return glow.kind === "invalid" ? 0 : glow.kind === "active" ? 1 : maxStackOf(stack.id);
}

/** Mutates only the supplied slots, using the same algorithm for bag insertion and trials.
 * Callers requiring all-or-nothing must pass detached trial slots and commit only on zero remainder. */
export function insertStackIntoSlots(slots: (ItemStack | null)[], incoming: ItemStack, excludedIndex = -1): number {
  if (!isKnownId(incoming.id) || !Number.isSafeInteger(incoming.count) || incoming.count <= 0
    || inspectItemState(incoming, true).kind === "invalid" || !hasCloneableBookMetadata(incoming)) return incoming.count;
  const stack = cloneStackWithBaseId(incoming);
  const limit = stackLimit(stack);
  let left = stack.count;
  if (limit > 1) for (let index = 0; index < slots.length && left > 0; index++) {
    const current = slots[index];
    if (index === excludedIndex || !current || !stacksCompatible(current, stack)) continue;
    const amount = Math.max(0, Math.min(limit - current.count, left));
    current.count += amount; left -= amount;
  }
  for (let index = 0; index < slots.length && left > 0; index++) {
    if (index === excludedIndex || slots[index]) continue;
    const amount = Math.min(limit, left);
    slots[index] = cloneStack(stack, amount); left -= amount;
  }
  return left;
}

/** Capacity of a concrete incoming state, matching insertStackIntoSlots without mutation. */
export function spaceForStackInSlots(slots: readonly (ItemStack | null)[], incoming: ItemStack): number {
  if (!isKnownId(incoming.id) || !Number.isSafeInteger(incoming.count) || incoming.count <= 0
    || inspectItemState(incoming, true).kind === "invalid" || !hasCloneableBookMetadata(incoming)) return 0;
  const stack = cloneStackWithBaseId(incoming), limit = stackLimit(stack);
  return slots.reduce((total, current) => total + (!current ? limit
    : limit > 1 && stacksCompatible(current, stack) ? Math.max(0, limit - current.count) : 0), 0);
}

export type GlowActivationPlan = Exclude<GlowActivationResult, { ok: true }>
  | { ok: true; kind: "activated"; color: string; slots: (ItemStack | null)[] };

/** Pure reducer: input owners are never mutated; only a complete detached result may be committed. */
export function planGlowActivation(slots: readonly (ItemStack | null)[], selected: number): GlowActivationPlan {
  if (!Number.isInteger(selected) || selected < 0 || selected >= slots.length) return { ok: false, reason: "invalid-state" };
  const source = slots[selected];
  if (!source) return { ok: false, reason: "not-glow" };
  const state = inspectGlowState(source);
  if (state.kind === "invalid") return { ok: false, reason: "invalid-state" };
  const color = glowStickColor(source.id);
  if (color === null) return { ok: false, reason: "not-glow" };
  if (state.kind === "active") return { ok: false, reason: "already-active" };
  // Legacy metadata is preserved on load/transfer, never silently erased by activation.
  if (Object.prototype.hasOwnProperty.call(source, "book") || Object.prototype.hasOwnProperty.call(source, "damage"))
    return { ok: false, reason: "invalid-state" };
  // Do not silently repair unrelated malformed owners while cloning/committing the trial.
  for (const stack of slots) if (stack && (!isKnownId(stack.id) || !Number.isSafeInteger(stack.count)
    || stack.count < 1 || !hasCloneableBookMetadata(stack) || inspectItemState(stack).kind === "invalid" || stack.count > stackLimit(stack)))
    return { ok: false, reason: "invalid-state" };
  const trial = slots.map(stack => stack ? cloneStack(stack) : null);
  trial[selected] = { ...cloneStack(source, 1), glow: { state: "active" } };
  if (source.count > 1 && insertStackIntoSlots(trial, cloneStack(source, source.count - 1), selected) !== 0)
    return { ok: false, reason: "needs-room" };
  return { ok: true, kind: "activated", color, slots: trial };
}

export type SparklerActivationPlan = Exclude<SparklerActivationResult, { ok: true }>
  | { ok: true; kind: "activated"; color: string; slots: (ItemStack | null)[]; active: ItemStack };
/** Detached complete plan. Excluded cell is the selected main owner in either hand's action. */
export function planSparklerActivation(slots: readonly (ItemStack | null)[], source: ItemStack | null, excludedIndex: number): SparklerActivationPlan {
  if (!Number.isInteger(excludedIndex) || excludedIndex < 0 || excludedIndex >= slots.length) return { ok: false, reason: "invalid-state" };
  if (!source) return { ok: false, reason: "not-sparkler" };
  if (!Number.isSafeInteger(source.count) || source.count < 1 || source.count > stackLimit(source) || !hasCloneableBookMetadata(source))
    return { ok: false, reason: "invalid-state" };
  const state = inspectSparklerState(source), color = sparklerColor(source.id);
  if (state.kind === "invalid" || inspectItemState(source).kind === "invalid") return { ok: false, reason: "invalid-state" };
  if (color === null) return { ok: false, reason: "not-sparkler" };
  if (state.kind === "active") return { ok: false, reason: "already-active" };
  for (const stack of slots) if (stack && (!isKnownId(stack.id) || !Number.isSafeInteger(stack.count) || stack.count < 1
    || !hasCloneableBookMetadata(stack) || inspectItemState(stack).kind === "invalid" || stack.count > stackLimit(stack)))
    return { ok: false, reason: "invalid-state" };
  const trial = slots.map(stack => stack ? cloneStack(stack) : null);
  if (source.count > 1 && insertStackIntoSlots(trial, cloneStack(source, source.count - 1), excludedIndex) !== 0)
    return { ok: false, reason: "needs-room" };
  return { ok: true, kind: "activated", color, slots: trial, active: { ...cloneStack(source, 1), sparkler: { state: "active" } } };
}
