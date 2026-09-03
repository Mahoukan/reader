import { createLocalFileSource } from "@/features/local-file/localFileSource";
import type { BookSource } from "@/features/reader/core/types";
import { libraryDb } from "./libraryDb";
import type { FolderBookRecord, FolderConnection, ImportedBookRecord, LibraryBook, LibrarySource } from "./types";

const SUPPORTED_EXTENSION = /\.(epub|pdf|cbz)$/i;
const HIDDEN_DIRECTORY = /^(?:__MACOSX|\.)/;

function stableFolderId(libraryId: string, relativePath: string): string {
  return `folder:${libraryId}:${relativePath}`;
}

function titleOf(filename: string): string {
  return filename.replace(/\.(epub|pdf|cbz)$/i, "");
}

function asStableSource(source: BookSource, id: string): BookSource {
  return { id, name: source.name, format: source.format, size: source.size, load: () => source.load() };
}

function publicFolderBook(record: FolderBookRecord, available: boolean): LibraryBook {
  return {
    id: record.id, title: record.title, filename: record.filename, format: record.format,
    size: record.size, lastModified: record.lastModified, origin: record.origin,
    relativePath: record.relativePath, available,
  };
}

function publicImportedBook(record: ImportedBookRecord): LibraryBook {
  return {
    id: record.id, title: record.title, filename: record.filename, format: record.format,
    size: record.size, lastModified: record.lastModified, origin: record.origin,
    available: true,
  };
}

function readableStorageError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NotFoundError")) {
    return new Error(error.name === "QuotaExceededError"
      ? "Browser storage is full. Free some site storage and try again."
      : "The stored book file is missing. Remove it from the library and import it again.");
  }
  return error instanceof Error ? error : new Error("Browser storage could not complete the operation.");
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function supportsOpfs(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

async function booksDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory?.();
  if (!root) throw new Error("Persistent importing is not available in this browser.");
  return root.getDirectoryHandle("books", { create: true });
}

export class LocalFolderLibrarySource implements LibrarySource {
  constructor(private connection: FolderConnection, private permissionGranted: boolean) {}

  static async restore(): Promise<LocalFolderLibrarySource | null> {
    const connection = await libraryDb.getFolderConnection();
    if (!connection) return null;
    const permission = await connection.handle.queryPermission({ mode: "read" });
    return new LocalFolderLibrarySource(connection, permission === "granted");
  }

  static async connect(): Promise<LocalFolderLibrarySource> {
    if (!window.showDirectoryPicker) throw new Error("Folder access is not supported in this browser.");
    const handle = await window.showDirectoryPicker({ mode: "read" });
    const connection: FolderConnection = {
      key: "folder-connection",
      libraryId: crypto.randomUUID(),
      name: handle.name,
      handle,
    };
    await libraryDb.setFolderConnection(connection);
    return new LocalFolderLibrarySource(connection, true);
  }

  get folderName(): string { return this.connection.name; }
  get available(): boolean { return this.permissionGranted; }

  async reconnect(): Promise<boolean> {
    this.permissionGranted = (await this.connection.handle.requestPermission({ mode: "read" })) === "granted";
    return this.permissionGranted;
  }

  async listBooks(): Promise<LibraryBook[]> {
    const records = await libraryDb.getFolderBooks();
    return records.map((record) => publicFolderBook(record, this.permissionGranted));
  }

  async openBook(id: string): Promise<BookSource> {
    if (!this.permissionGranted) throw new Error("Reconnect the folder before opening this book.");
    const record = await libraryDb.getFolderBook(id);
    if (!record) throw new Error("This book is no longer in the folder catalogue. Refresh the folder.");
    try {
      const file = await record.fileHandle.getFile();
      return asStableSource(await createLocalFileSource(file), record.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new Error("This source file was moved or deleted. Refresh the folder to update the library.");
      }
      throw error;
    }
  }

  async refresh(): Promise<LibraryBook[]> {
    if (!this.permissionGranted) throw new Error("Reconnect the folder before refreshing it.");
    const records: FolderBookRecord[] = [];
    const walk = async (directory: FileSystemDirectoryHandle, parts: string[]): Promise<void> => {
      for await (const [name, handle] of directory.entries()) {
        if (HIDDEN_DIRECTORY.test(name) || name === ".DS_Store") continue;
        if (handle.kind === "directory") {
          await walk(handle, [...parts, name]);
        } else if (SUPPORTED_EXTENSION.test(name)) {
          const file = await handle.getFile();
          const relativePath = [...parts, name].join("/");
          const format = name.toLowerCase().endsWith(".epub") ? "epub" : name.toLowerCase().endsWith(".pdf") ? "pdf" : "cbz";
          records.push({
            id: stableFolderId(this.connection.libraryId, relativePath),
            libraryId: this.connection.libraryId,
            title: titleOf(name), filename: name, format, size: file.size,
            lastModified: file.lastModified, origin: "folder", relativePath,
            available: true, fileHandle: handle,
          });
        }
      }
    };
    await walk(this.connection.handle, []);
    await libraryDb.replaceFolderBooks(records);
    return records;
  }
}

export class ImportedLibrarySource implements LibrarySource {
  async listBooks(): Promise<LibraryBook[]> {
    return (await libraryDb.getImportedBooks()).map(publicImportedBook);
  }
  async refresh(): Promise<LibraryBook[]> { return this.listBooks(); }

  async findDuplicate(file: File): Promise<ImportedBookRecord | undefined> {
    return (await libraryDb.getImportedBooks()).find((book) =>
      book.filename === file.name && book.size === file.size && book.lastModified === file.lastModified);
  }

  async importBook(file: File): Promise<LibraryBook> {
    try {
      const validated = await createLocalFileSource(file);
      const id = `imported:${crypto.randomUUID()}`;
      const storageKey = `${crypto.randomUUID()}.${validated.format}`;
      const directory = await booksDirectory();
      const handle = await directory.getFileHandle(storageKey, { create: true });
      try {
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        const record: ImportedBookRecord = {
          id, storageKey, title: titleOf(file.name), filename: file.name,
          format: validated.format, size: file.size, lastModified: file.lastModified,
          origin: "imported", available: true,
        };
        await libraryDb.putImportedBook(record);
        return record;
      } catch (error) {
        await directory.removeEntry(storageKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw readableStorageError(error);
    }
  }

  async openBook(id: string): Promise<BookSource> {
    const record = await libraryDb.getImportedBook(id);
    if (!record) throw new Error("This imported book is no longer in the catalogue.");
    try {
      const file = await (await booksDirectory()).getFileHandle(record.storageKey).then((handle) => handle.getFile());
      const displayFile = new File([file], record.filename, { type: file.type, lastModified: record.lastModified });
      return asStableSource(await createLocalFileSource(displayFile), record.id);
    } catch (error) {
      throw readableStorageError(error);
    }
  }

  async removeBook(id: string): Promise<void> {
    const record = await libraryDb.getImportedBook(id);
    if (!record) return;
    try {
      await (await booksDirectory()).removeEntry(record.storageKey);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw readableStorageError(error);
    }
    await libraryDb.deleteImportedBook(id);
  }
}
