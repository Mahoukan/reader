export type BookFormat = "epub" | "pdf" | "cbz";

export interface BookSource {
  id: string;
  name: string;
  format: BookFormat;
  size: number;
  load(): Promise<Blob>;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
