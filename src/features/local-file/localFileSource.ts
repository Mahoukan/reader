import type { BookFormat, BookSource } from "@/features/reader/core/types";

const MIME_FORMATS: Readonly<Record<string, BookFormat>> = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
  "application/vnd.comicbook+zip": "cbz",
  "application/x-cbz": "cbz",
};

const EXTENSION_FORMATS: Readonly<Record<string, BookFormat>> = {
  epub: "epub",
  pdf: "pdf",
  cbz: "cbz",
};

function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

function looksLikePdf(header: Uint8Array): boolean {
  return String.fromCharCode(...header.slice(0, 5)) === "%PDF-";
}

function looksLikeZip(header: Uint8Array): boolean {
  return (
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    ((header[2] === 0x03 && header[3] === 0x04) ||
      (header[2] === 0x05 && header[3] === 0x06) ||
      (header[2] === 0x07 && header[3] === 0x08))
  );
}

export class LocalFileBookSource implements BookSource {
  readonly id = crypto.randomUUID();
  readonly name: string;
  readonly format: BookFormat;
  readonly size: number;

  constructor(private readonly file: File, format: BookFormat) {
    this.name = file.name;
    this.size = file.size;
    this.format = format;
  }

  async load(): Promise<Blob> {
    return this.file;
  }
}

export async function createLocalFileSource(file: File): Promise<BookSource> {
  if (file.size === 0) {
    throw new Error("That file is empty. Choose a non-empty EPUB, PDF, or CBZ file.");
  }

  const extensionFormat = EXTENSION_FORMATS[extensionOf(file.name)];
  const mimeFormat = MIME_FORMATS[file.type.toLowerCase()];
  const format = extensionFormat ?? mimeFormat;

  if (!format) {
    throw new Error("Unsupported file type. Choose a file ending in .epub, .pdf, or .cbz.");
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signatureMatches = format === "pdf" ? looksLikePdf(header) : looksLikeZip(header);

  if (!signatureMatches) {
    throw new Error(
      `This file does not appear to be a valid ${format.toUpperCase()} file. It may be damaged or incorrectly renamed.`,
    );
  }

  return new LocalFileBookSource(file, format);
}
