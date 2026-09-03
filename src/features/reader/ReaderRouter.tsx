"use client";

import type { BookSource } from "./core/types";
import { EpubReader } from "./epub/EpubReader";
import { PdfReader } from "./pdf/PdfReader";
import { CbzReader } from "./cbz/CbzReader";

interface ReaderRouterProps {
  source: BookSource;
  onClose(): void;
}

export function ReaderRouter({ source, onClose }: ReaderRouterProps) {
  switch (source.format) {
    case "epub":
      return <EpubReader source={source} onClose={onClose} />;
    case "pdf":
      return <PdfReader source={source} onClose={onClose} />;
    case "cbz":
      return <CbzReader source={source} onClose={onClose} />;
  }
}
