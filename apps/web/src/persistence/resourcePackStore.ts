/** Local texture preferences are independent of world and portfolio storage. */
const DATABASE = "craft.local-textures.v1";
const STORE = "selection";
const ACTIVE = "active";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timeout); reject(error); };
    const timeout = setTimeout(() => fail(new Error("Texture storage did not respond. Try again.")), 5000);
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => fail(request.error ?? new Error("Texture storage is unavailable."));
    request.onblocked = () => fail(new Error("Close other texture-pack menus and try again."));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true; clearTimeout(timeout); db.onversionchange = () => db.close(); resolve(db);
    };
  });
}

/** Abort before reporting a deadline; never call a committed write a failed write. */
function transactionDeadline(transaction: IDBTransaction): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    try { transaction.abort(); } catch { /* An already committed transaction will report oncomplete. */ }
  }, 5000);
}

export async function readLocalTexturePack(): Promise<Uint8Array<ArrayBuffer> | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const timeout = transactionDeadline(transaction);
      const request = transaction.objectStore(STORE).get(ACTIVE);
      let value: unknown;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => {
        clearTimeout(timeout);
        if (value === undefined) return resolve(null);
        if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("bytes" in value) || !(value.bytes instanceof ArrayBuffer)) return reject(new Error("The saved texture pack is damaged."));
        resolve(new Uint8Array(value.bytes.slice(0)));
      };
      transaction.onabort = transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error ?? new Error("The saved texture pack could not be read.")); };
    });
  } finally { db.close(); }
}

/** Commit bytes and selection together. The caller applies an atlas only after this resolves. */
export async function writeLocalTexturePack(bytes: Uint8Array<ArrayBuffer> | null): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE);
      const timeout = transactionDeadline(transaction);
      transaction.oncomplete = () => { clearTimeout(timeout); resolve(); };
      transaction.onabort = transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error ?? new Error("The texture pack could not be saved.")); };
      try {
        if (bytes === null) store.delete(ACTIVE);
        else store.put({ version: 1, bytes: bytes.slice().buffer }, ACTIVE);
      } catch (error) {
        try { transaction.abort(); } catch { /* Nothing was committed by this request. */ }
        clearTimeout(timeout); reject(error);
      }
    });
  } finally { db.close(); }
}
