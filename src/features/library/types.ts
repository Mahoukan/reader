import type { BookFormat, BookSource } from "@/features/reader/core/types";

export type LibraryBookOrigin = "folder" | "imported";

export interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  format: BookFormat;
  size: number;
  lastModified: number;
  origin: LibraryBookOrigin;
  relativePath?: string;
  available: boolean;
}

export interface LibrarySource {
  listBooks(): Promise<LibraryBook[]>;
  openBook(id: string): Promise<BookSource>;
  refresh(): Promise<LibraryBook[]>;
}

export interface FolderBookRecord extends LibraryBook {
  origin: "folder";
  relativePath: string;
  libraryId: string;
  fileHandle: FileSystemFileHandle;
}

export interface ImportedBookRecord extends LibraryBook {
  origin: "imported";
  storageKey: string;
}

export interface FolderConnection {
  key: "folder-connection";
  libraryId: string;
  name: string;
  handle: FileSystemDirectoryHandle;
}
