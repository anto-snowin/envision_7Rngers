/**
 * Offline store for GPS fixes.
 *
 * When the phone has no connectivity the fix still has to survive — including a
 * tab reload, which is why this is IndexedDB rather than an in-memory array.
 * localStorage would also persist, but it is synchronous and shared with the
 * auth token; a long stretch offline can accumulate hundreds of fixes and
 * blocking the main thread on every write would stutter the UI.
 *
 * An in-memory fallback keeps the device working when IndexedDB is unavailable
 * (private browsing, blocked site data). Fixes are then lost on reload, which
 * is strictly better than dropping them immediately.
 */
import { QUEUE_LIMIT } from './constants';
import type { PendingFix } from './types';

const DB_NAME = 'sentinel-tracking';
const DB_VERSION = 1;
const STORE = 'pending-fixes';

type QueuedRecord = PendingFix & { id?: number };

let memoryFallback: QueuedRecord[] | null = null;
let nextMemoryId = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('recordedAt', 'recordedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });

  // A rejected promise must not be cached, or one transient failure would
  // permanently downgrade the device to the memory fallback.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function memoryStore(): QueuedRecord[] {
  if (!memoryFallback) memoryFallback = [];
  return memoryFallback;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      })
  );
}

/** Append a fix. Oldest entries are dropped once the cap is reached. */
export async function enqueue(fix: PendingFix): Promise<void> {
  const record: PendingFix = { ...fix, queued: true };

  try {
    await tx<IDBValidKey>('readwrite', (store) => store.add(record));
    await trimToLimit();
  } catch {
    const memory = memoryStore();
    memory.push({ ...record, id: nextMemoryId });
    nextMemoryId += 1;
    if (memory.length > QUEUE_LIMIT) memory.splice(0, memory.length - QUEUE_LIMIT);
  }
}

/**
 * All queued fixes, oldest first.
 *
 * Chronological order matters: the server replays them through the geofence
 * engine in sequence, so out-of-order delivery would produce nonsense zone
 * transitions.
 */
export async function readAll(): Promise<QueuedRecord[]> {
  try {
    const records = await tx<QueuedRecord[]>('readonly', (store) => store.getAll());
    return records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  } catch {
    return [...memoryStore()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }
}

export async function count(): Promise<number> {
  try {
    return await tx<number>('readonly', (store) => store.count());
  } catch {
    return memoryStore().length;
  }
}

/** Remove the given records after the server has accepted them. */
export async function remove(records: QueuedRecord[]): Promise<void> {
  const ids = records.map((record) => record.id).filter((id): id is number => id !== undefined);
  if (!ids.length) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      for (const id of ids) store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('delete failed'));
    });
  } catch {
    const keep = new Set(ids);
    memoryFallback = memoryStore().filter((record) => !keep.has(record.id as number));
  }
}

export async function clear(): Promise<void> {
  try {
    await tx<undefined>('readwrite', (store) => store.clear());
  } catch {
    memoryFallback = [];
  }
}

async function trimToLimit() {
  const total = await count();
  if (total <= QUEUE_LIMIT) return;
  const all = await readAll();
  await remove(all.slice(0, total - QUEUE_LIMIT));
}

/** Strip the IndexedDB key before the record goes over the wire. */
export function toPayload(records: QueuedRecord[]): PendingFix[] {
  return records.map(({ id: _id, ...fix }) => fix);
}
