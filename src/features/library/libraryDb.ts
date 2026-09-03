import type { FolderBookRecord, FolderConnection, ImportedBookRecord } from "./types";

const DB_NAME = "local-leaf-library";
const DB_VERSION = 1;
const FOLDER_BOOKS = "folder-books";
const IMPORTED_BOOKS = "imported-books";
const METADATA = "metadata";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FOLDER_BOOKS)) db.createObjectStore(FOLDER_BOOKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(IMPORTED_BOOKS)) db.createObjectStore(IMPORTED_BOOKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(METADATA)) db.createObjectStore(METADATA, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage could not be opened."));
    request.onblocked = () => reject(new Error("Browser storage is busy in another tab. Close it and try again."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage operation failed."));
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await requestResult(run(db.transaction(storeName, mode).objectStore(storeName)));
  } finally {
    db.close();
  }
}

export const libraryDb = {
  getFolderConnection: () => transact<FolderConnection | undefined>(METADATA, "readonly", (store) => store.get("folder-connection")),
  setFolderConnection: (value: FolderConnection) => transact<IDBValidKey>(METADATA, "readwrite", (store) => store.put(value)),
  getFolderBooks: () => transact<FolderBookRecord[]>(FOLDER_BOOKS, "readonly", (store) => store.getAll()),
  getFolderBook: (id: string) => transact<FolderBookRecord | undefined>(FOLDER_BOOKS, "readonly", (store) => store.get(id)),
  replaceFolderBooks: async (records: FolderBookRecord[]) => {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(FOLDER_BOOKS, "readwrite");
        const store = transaction.objectStore(FOLDER_BOOKS);
        store.clear();
        records.forEach((record) => store.put(record));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("The folder catalogue could not be saved."));
        transaction.onabort = () => reject(transaction.error ?? new Error("The folder catalogue update was cancelled."));
      });
    } finally {
      db.close();
    }
  },
  getImportedBooks: () => transact<ImportedBookRecord[]>(IMPORTED_BOOKS, "readonly", (store) => store.getAll()),
  getImportedBook: (id: string) => transact<ImportedBookRecord | undefined>(IMPORTED_BOOKS, "readonly", (store) => store.get(id)),
  putImportedBook: (record: ImportedBookRecord) => transact<IDBValidKey>(IMPORTED_BOOKS, "readwrite", (store) => store.put(record)),
  deleteImportedBook: (id: string) => transact<undefined>(IMPORTED_BOOKS, "readwrite", (store) => store.delete(id)),
};
