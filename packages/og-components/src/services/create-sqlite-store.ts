import { SqliteStore } from "./sqlite-store";
import type { SqlJsDatabase } from "./sqlite-store";

const DEFAULT_IDB_NAME = "og-map-db";
const DEFAULT_IDB_STORE = "sqlitedb";
const DEFAULT_IDB_KEY = "database";

interface CreateSqliteStoreOptions {
  /** IndexedDB database name. Default: "og-map-db" */
  dbName?: string;
  /** Auto-save to IndexedDB on every write operation. Default: true */
  autoPersist?: boolean;
  /** URL for sql.js WASM file. Defaults to CDN. */
  wasmUrl?: string;
  /** Existing sql.js Database instance — skips initialization if provided */
  database?: SqlJsDatabase;
}

/**
 * Factory that creates a SqliteStore with IndexedDB persistence.
 * Data survives page refreshes — no server required.
 *
 * ```ts
 * import { createSqliteStore } from "@aai-agency/og-components";
 *
 * const store = await createSqliteStore();
 * <Map store={store} />
 * ```
 */
export const createSqliteStore = async (
  options?: CreateSqliteStoreOptions,
): Promise<SqliteStore & { persist(): Promise<void> }> => {
  const dbName = options?.dbName ?? DEFAULT_IDB_NAME;
  const autoPersist = options?.autoPersist ?? true;

  let db: SqlJsDatabase;

  if (options?.database) {
    db = options.database;
  } else {
    // Dynamically import sql.js (tree-shaken if not used)
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs({
      locateFile: (file: string) => options?.wasmUrl ?? `https://sql.js.org/dist/${file}`,
    });

    // Try to load existing database from IndexedDB
    const existingData = await idbLoad(dbName);
    db = existingData ? new SQL.Database(existingData) : new SQL.Database();
  }

  const store = new SqliteStore(db);

  // Create a wrapper that auto-persists to IndexedDB after writes
  const persist = async () => {
    const data = store.exportBinary();
    await idbSave(dbName, data);
  };

  if (autoPersist) {
    // Wrap mutating methods to auto-persist
    const originalMethods = {
      createAsset: store.createAsset.bind(store),
      createAssets: store.createAssets.bind(store),
      updateAsset: store.updateAsset.bind(store),
      deleteAsset: store.deleteAsset.bind(store),
      saveOverlay: store.saveOverlay.bind(store),
      deleteOverlay: store.deleteOverlay.bind(store),
      saveMapView: store.saveMapView.bind(store),
      deleteMapView: store.deleteMapView.bind(store),
      savePreference: store.savePreference.bind(store),
      importAll: store.importAll.bind(store),
    };

    store.createAsset = async (...args) => {
      const result = await originalMethods.createAsset(...args);
      await persist();
      return result;
    };
    store.createAssets = async (...args) => {
      const result = await originalMethods.createAssets(...args);
      await persist();
      return result;
    };
    store.updateAsset = async (...args) => {
      const result = await originalMethods.updateAsset(...args);
      await persist();
      return result;
    };
    store.deleteAsset = async (...args) => {
      await originalMethods.deleteAsset(...args);
      await persist();
    };
    store.saveOverlay = async (...args) => {
      const result = await originalMethods.saveOverlay(...args);
      await persist();
      return result;
    };
    store.deleteOverlay = async (...args) => {
      await originalMethods.deleteOverlay(...args);
      await persist();
    };
    store.saveMapView = async (...args) => {
      const result = await originalMethods.saveMapView(...args);
      await persist();
      return result;
    };
    store.deleteMapView = async (...args) => {
      await originalMethods.deleteMapView(...args);
      await persist();
    };
    store.savePreference = async (...args) => {
      await originalMethods.savePreference(...args);
      await persist();
    };
    store.importAll = async (...args) => {
      await originalMethods.importAll(...args);
      await persist();
    };
  }

  return Object.assign(store, { persist });
};

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const openIDB = (dbName: string): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DEFAULT_IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const idbSave = async (dbName: string, data: Uint8Array): Promise<void> => {
  const idb = await openIDB(dbName);
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(DEFAULT_IDB_STORE, "readwrite");
    tx.objectStore(DEFAULT_IDB_STORE).put(data, DEFAULT_IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
};

const idbLoad = async (dbName: string): Promise<Uint8Array | null> => {
  try {
    const idb = await openIDB(dbName);
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DEFAULT_IDB_STORE, "readonly");
      const request = tx.objectStore(DEFAULT_IDB_STORE).get(DEFAULT_IDB_KEY);
      request.onsuccess = () => {
        idb.close();
        resolve(request.result ?? null);
      };
      request.onerror = () => {
        idb.close();
        reject(request.error);
      };
    });
  } catch {
    return null;
  }
};
