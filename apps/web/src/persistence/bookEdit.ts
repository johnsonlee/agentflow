import {reserveInventoryMutation,clampPages,hasBookPhotos,cloneStack, readBookData, isWritableBook, signBook, snapshotFactoryStack, bookUtf8Bytes, MAX_WORLD_SAVE_BYTES, type Inventory, type ItemStack, type BookData} from '@craft/engine';
export interface BookEditSession {readonly inventory:Inventory;readonly index:number;readonly source:ItemStack;readonly fingerprint:string}
export function beginBookEdit(inventory:Inventory):BookEditSession|null{
 const index=inventory.selected,source=inventory.slots[index];if(!source)return null;
 const snapshot=snapshotFactoryStack(source);if(!snapshot)return null;
 return{inventory,index,source,fingerprint:JSON.stringify(snapshot.values)};
}
export function bookSessionCurrent(session:BookEditSession):boolean{
 const {inventory,index,source}=session;if(inventory.selected!==index||inventory.slots[index]!==source)return false;
 const snap=snapshotFactoryStack(source);return !!snap&&JSON.stringify(snap.values)===session.fingerprint;
}
/** Serialization, callbacks and all validation finish before the native Storage write.
 * The final real-array publication is a constructor-original lease capability with no callbacks.
 * Browser Storage.setItem is synchronous/atomic on failure; it does not dispatch synchronous JS events.
 * `persist` must be a captured native Storage write, never an application/plugin callback. */
export function commitBookEdit(session:BookEditSession,draft:BookData,title:string|undefined,current:()=>boolean,serialize:(replacement:ItemStack)=>string,persist:(payload:string)=>void):{ok:true}|{ok:false;error:string}{
 let lease:ReturnType<typeof reserveInventoryMutation>=null;
 try{
  if(!current()||!bookSessionCurrent(session)||!isWritableBook(session.source))throw Error('This book owner changed. Close and reopen the book.');
  const replacement=cloneStack(session.source);replacement.book=hasBookPhotos(draft)?readBookData(draft):{pages:clampPages(draft.pages)};
  if(title!==undefined&&!signBook(replacement,title,'Player'))throw Error('Enter a book title.');
  // Re-clone after replacing/signing metadata, registering the complete new nested tree.
  const candidate=cloneStack(replacement),payload=serialize(candidate);
  if(bookUtf8Bytes(payload)>MAX_WORLD_SAVE_BYTES)throw Error('World exceeds the 8 MiB application save limit. Remove this draft photo or export a backup.');
  if(!current()||!bookSessionCurrent(session))throw Error('This book owner changed. No edit was saved.');
  lease=reserveInventoryMutation(session.inventory);if(!lease)throw Error('Items are being transferred. Try again.');
  const publication=lease.prepare(session.index,candidate);
  if(!current()||!bookSessionCurrent(session)||!publication?.valid())throw Error('This book owner changed. No edit was saved.');
  persist(payload);
  // No user callback, reflection of unknown nodes or revalidation after the durable native write.
  publication.commit();return{ok:true};
 }catch(error){return{ok:false,error:error instanceof Error?error.message:'Book could not be saved. Your original book is unchanged.'};}
 finally{lease?.cancel();}
}
