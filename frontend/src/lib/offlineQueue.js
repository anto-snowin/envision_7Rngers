/**
 * IndexedDB-backed queue for GPS fixes captured while the phone has no
 * internet connection.
 *
 * Why IndexedDB rather than localStorage: a patient could be out of signal for
 * an hour, which at a 5-second cadence is 720 fixes. localStorage is a
 * synchronous ~5 MB store shared with everything else on the origin and would
 * block the UI thread on every write. IndexedDB is asynchronous, far larger,
 * and lets us delete exactly the records the server confirmed.
 *
 * The API is promise-based and degrades gracefully: if IndexedDB is
 * unavailable (private browsing on some platforms), an in-memory fallback is
 * used so tracking still works for the current session.
 */

const DB_NAME = 'dcms-offline';
const DB_VERSION = 1;
const STORE = 'pendingFixes';

/** In-memory fallback used when IndexedDB cannot be opened. */
let memoryFallback = [];
let useMemoryFallback = false;

/** Cached database handle. */
let dbPromise = null;

/** Open (and if needed create) the database. */
function openDatabase() {
  if (useMemoryFallback) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      useMemoryFallback = true;
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // autoIncrement gives each fix a stable key we can delete by after the
        // server confirms it, and insertion order matches capture order.
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('recordedAt', 'recordedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      useMemoryFallback = true;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

/**
 * Run a write transaction against the fixes store, resolving once the
 * transaction commits.
 */
async function withStore(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);

    try {
      operation(store);
    } catch (err) {
      reject(err);
      return;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Run a single read request and resolve with its result.
 * Reads do not need to wait for transaction commit, only for the request.
 */
async function readRequest(buildRequest) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = buildRequest(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add a fix to the queue.
 * @param {object} fix a normalised GPS fix, including `recordedAt`
 */
export async function enqueueFix(fix) {
  const record = { ...fix, queuedAt: new Date().toISOString() };

  try {
    await withStore('readwrite', (store) => store.add(record));
  } catch {
    memoryFallback.push({ ...record, id: `mem-${Date.now()}-${memoryFallback.length}` });
  }
}

/**
 * Read up to `limit` queued fixes, oldest first.
 * @returns {Promise<Array<object>>} records including their `id`
 */
export async function peekFixes(limit = 200) {
  try {
    const records = await readRequest((store) => store.getAll(undefined, limit));
    return records || [];
  } catch {
    return memoryFallback.slice(0, limit);
  }
}

/** How many fixes are waiting to upload. */
export async function queueSize() {
  try {
    const count = await readRequest((store) => store.count());
    return count || 0;
  } catch {
    return memoryFallback.length;
  }
}

/**
 * Delete the given records once the server has accepted them.
 * @param {Array<number|string>} ids
 */
export async function removeFixes(ids) {
  if (!ids || !ids.length) return;

  try {
    await withStore('readwrite', (store) => {
      ids.forEach((id) => store.delete(id));
    });
  } catch {
    const removed = new Set(ids.map(String));
    memoryFallback = memoryFallback.filter((record) => !removed.has(String(record.id)));
  }
}

/** Empty the queue completely. */
export async function clearQueue() {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    memoryFallback = [];
  }
  memoryFallback = [];
}

/** True when the queue is backed by memory only (so data is lost on reload). */
export function isUsingMemoryFallback() {
  return useMemoryFallback;
}
