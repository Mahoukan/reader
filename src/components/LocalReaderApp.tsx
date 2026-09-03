"use client";

import { useRef, useState } from "react";
import { createLocalFileSource } from "@/features/local-file/localFileSource";
import { ReaderRouter } from "@/features/reader/ReaderRouter";
import type { BookSource } from "@/features/reader/core/types";

const ACCEPTED_TYPES = ".epub,.pdf,.cbz,application/epub+zip,application/pdf,application/vnd.comicbook+zip";

export function LocalReaderApp() {
  const [source, setSource] = useState<BookSource | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionVersion = useRef(0);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    const version = ++selectionVersion.current;
    setError("");
    setIsChecking(true);
    try {
      const nextSource = await createLocalFileSource(file);
      if (selectionVersion.current === version) setSource(nextSource);
    } catch (caught) {
      if (selectionVersion.current === version) {
        setError(caught instanceof Error ? caught.message : "The selected file could not be opened.");
      }
    } finally {
      if (selectionVersion.current === version) setIsChecking(false);
    }
  }

  function closeBook() {
    selectionVersion.current += 1;
    setSource(null);
    setError("");
    setIsChecking(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className="app">
      <header className="app-header">
        <a className="brand" href="#main-content" aria-label="Local Leaf Reader home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Local Leaf</span>
        </a>
        <span className="privacy-chip"><span aria-hidden="true">●</span> Browser only</span>
      </header>

      <div id="main-content" className={source ? "reader-page" : "welcome-page"}>
        {source ? (
          <ReaderRouter key={source.id} source={source} onClose={closeBook} />
        ) : (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <p className="eyebrow">Your shelf, without the server</p>
              <h1 id="welcome-title">Open a book.<br />Keep it private.</h1>
              <p className="lede">
                Read ebooks, documents, and comics directly in this tab. Nothing is uploaded,
                stored, or sent anywhere.
              </p>
            </div>

            <div
              className={`drop-zone${isDragging ? " is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void selectFile(event.dataTransfer.files[0]);
              }}
            >
              <div className="drop-icon" aria-hidden="true">↗</div>
              <h2>{isDragging ? "Drop it here" : "Choose something to read"}</h2>
              <p>Drag and drop a book here, or choose one from your device.</p>
              <input
                ref={inputRef}
                className="visually-hidden"
                id="book-file"
                type="file"
                accept={ACCEPTED_TYPES}
                disabled={isChecking}
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
              <label className="primary-button" htmlFor="book-file">
                {isChecking ? "Checking book…" : "Choose a book"}
              </label>
              <p className="formats"><span>EPUB</span><span>PDF</span><span>CBZ</span></p>
            </div>

            {error && <p className="selection-error" role="alert">{error}</p>}

            <div className="privacy-note">
              <span className="lock" aria-hidden="true">⌁</span>
              <div>
                <strong>Private by design</strong>
                <p>Your selected file stays in your browser&apos;s memory and is released when you close it.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
