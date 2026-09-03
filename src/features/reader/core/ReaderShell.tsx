"use client";

import { useEffect, type ReactNode } from "react";
import type { BookSource } from "./types";
import { formatFileSize } from "./types";

interface ReaderShellProps {
  source: BookSource;
  onClose(): void;
  onPrevious?(): void;
  onNext?(): void;
  canPrevious: boolean;
  canNext: boolean;
  position: string;
  loading?: boolean;
  error?: string;
  tools?: ReactNode;
  sidebar?: ReactNode;
  hideFooter?: boolean;
  children: ReactNode;
}

export function ReaderShell({
  source,
  onClose,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  position,
  loading = false,
  error,
  tools,
  sidebar,
  hideFooter = false,
  children,
}: ReaderShellProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.fullscreenElement) return;
        event.preventDefault();
        onClose();
        return;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.key === "ArrowLeft" && canPrevious && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === "ArrowRight" && canNext && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canNext, canPrevious, onClose, onNext, onPrevious]);

  return (
    <section className="reader-shell" aria-label={`${source.format.toUpperCase()} reader`}>
      <header className="reader-toolbar">
        <div className="book-identity">
          <span className="format-badge">{source.format}</span>
          <div>
            <h1 title={source.name}>{source.name}</h1>
            <p>{formatFileSize(source.size)}</p>
          </div>
        </div>

        <div className="reader-actions">
          {tools}
          <button className="close-button" type="button" onClick={onClose} aria-label="Close book and choose another">
            <span aria-hidden="true">×</span><span className="close-label">Close</span>
          </button>
        </div>
      </header>

      <div className={`reader-body${sidebar ? " has-sidebar" : ""}`}>
        {sidebar}
        <div className={`reading-column${hideFooter ? " no-footer" : ""}`}>
          <div className="reading-area">
            {children}
            {loading && (
              <div className="reader-overlay" role="status">
                <span className="spinner" aria-hidden="true" />
                <p>Opening {source.format.toUpperCase()}…</p>
              </div>
            )}
            {error && (
              <div className="reader-overlay error-panel" role="alert">
                <span className="error-symbol" aria-hidden="true">!</span>
                <h2>Couldn&apos;t open this book</h2>
                <p>{error}</p>
                <button type="button" className="secondary-button" onClick={onClose}>Choose another book</button>
              </div>
            )}
          </div>

          {!hideFooter && (
            <footer className="reader-footer">
              <button type="button" onClick={onPrevious} disabled={!canPrevious || loading || Boolean(error)} aria-label="Previous page or section">
                <span aria-hidden="true">←</span> Previous
              </button>
              <output aria-live="polite">{position}</output>
              <button type="button" onClick={onNext} disabled={!canNext || loading || Boolean(error)} aria-label="Next page or section">
                Next <span aria-hidden="true">→</span>
              </button>
            </footer>
          )}
        </div>
      </div>
    </section>
  );
}
