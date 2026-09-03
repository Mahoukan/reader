"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createLocalFileSource } from "@/features/local-file/localFileSource";
import { ImportedLibrarySource, LocalFolderLibrarySource, supportsDirectoryPicker, supportsOpfs } from "@/features/library/librarySources";
import type { LibraryBook } from "@/features/library/types";
import { PwaLibraryTools, useOnlineStatus } from "@/features/pwa/PwaLibraryTools";
import { ReaderRouter } from "@/features/reader/ReaderRouter";
import type { BookFormat, BookSource } from "@/features/reader/core/types";
import { formatFileSize } from "@/features/reader/core/types";

const ACCEPTED_TYPES = ".epub,.pdf,.cbz,application/epub+zip,application/pdf,application/vnd.comicbook+zip";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
type Filter = "all" | BookFormat;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) return "Permission was denied. Your files were not accessed.";
  return error instanceof Error ? error.message : fallback;
}

function displayDate(value: number): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value) : "Unknown";
}

export function LocalReaderApp() {
  const [source, setSource] = useState<BookSource | null>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [folderSource, setFolderSource] = useState<LocalFolderLibrarySource | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [capabilities, setCapabilities] = useState({ directory: false, opfs: false });
  const [storageRevision, setStorageRevision] = useState(0);
  const directInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const selectionVersion = useRef(0);
  const importedSource = useMemo(() => new ImportedLibrarySource(), []);
  const directorySupported = capabilities.directory;
  const opfsSupported = capabilities.opfs;
  const online = useOnlineStatus();

  async function reloadBooks(folder = folderSource) {
    const [folderBooks, importedBooks] = await Promise.all([folder?.listBooks() ?? Promise.resolve([]), importedSource.listBooks()]);
    setBooks([...folderBooks, ...importedBooks]);
  }

  useEffect(() => {
    let active = true;
    const detectedCapabilities = { directory: supportsDirectoryPicker(), opfs: supportsOpfs() };
    void (async () => {
      try {
        const restored = await LocalFolderLibrarySource.restore();
        const [folderBooks, importedBooks] = await Promise.all([restored?.listBooks() ?? Promise.resolve([]), importedSource.listBooks()]);
        if (active) { setFolderSource(restored); setBooks([...folderBooks, ...importedBooks]); }
      } catch (caught) {
        if (active) setError(messageOf(caught, "The local library could not be loaded."));
      } finally {
        if (active) { setCapabilities(detectedCapabilities); setReady(true); }
      }
    })();
    return () => { active = false; };
  }, [importedSource]);

  const visibleBooks = useMemo(() => books
    .filter((book) => filter === "all" || book.format === filter)
    .filter((book) => `${book.title} ${book.relativePath ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.filename, b.filename)), [books, filter, query]);

  async function connectFolder() {
    setError(""); setNotice(""); setBusy("Connecting to folder…");
    try {
      const connected = await LocalFolderLibrarySource.connect();
      setFolderSource(connected); setBusy("Scanning folder…");
      const folderBooks = await connected.refresh();
      setBooks([...folderBooks, ...await importedSource.listBooks()]);
      setNotice(`Scanned ${folderBooks.length} supported ${folderBooks.length === 1 ? "book" : "books"}.`);
    } catch (caught) { setError(messageOf(caught, "The folder could not be connected.")); }
    finally { setBusy(""); }
  }

  async function reconnectFolder() {
    if (!folderSource) return;
    setError(""); setNotice(""); setBusy("Reconnecting…");
    try {
      if (!await folderSource.reconnect()) setError("Permission was denied. The cached folder catalogue remains visible but unavailable.");
      else { await reloadBooks(folderSource); setNotice(`Reconnected to ${folderSource.folderName}.`); }
    } catch (caught) { setError(messageOf(caught, "The folder could not be reconnected.")); }
    finally { setBusy(""); }
  }

  async function refreshFolder() {
    if (!folderSource) return;
    setError(""); setNotice(""); setBusy("Scanning folder…");
    try {
      const folderBooks = await folderSource.refresh();
      setBooks([...folderBooks, ...await importedSource.listBooks()]);
      setNotice(`Scanned ${folderBooks.length} supported ${folderBooks.length === 1 ? "book" : "books"}.`);
    } catch (caught) { setError(messageOf(caught, "The folder could not be refreshed.")); }
    finally { setBusy(""); }
  }

  async function importBooks(files: FileList | null) {
    if (!files?.length) return;
    setError(""); setNotice(""); setBusy("Importing books…");
    let imported = 0; let skipped = 0;
    try {
      for (const file of Array.from(files)) {
        const duplicate = await importedSource.findDuplicate(file);
        if (duplicate && !window.confirm(`“${file.name}” is already imported. Import another copy?`)) { skipped += 1; continue; }
        await importedSource.importBook(file); imported += 1;
      }
      await reloadBooks();
      setStorageRevision((value) => value + 1);
      setNotice(`Imported ${imported} ${imported === 1 ? "book" : "books"}${skipped ? `; skipped ${skipped}` : ""}.`);
    } catch (caught) { setError(messageOf(caught, "The books could not be imported.")); }
    finally { setBusy(""); if (importInputRef.current) importInputRef.current.value = ""; }
  }

  async function openLibraryBook(book: LibraryBook) {
    setError(""); setBusy("Opening book…");
    const version = ++selectionVersion.current;
    try {
      const next = book.origin === "folder" ? await folderSource?.openBook(book.id) : await importedSource.openBook(book.id);
      if (!next) throw new Error("Reconnect the folder before opening this book.");
      if (selectionVersion.current === version) setSource(next);
    } catch (caught) { if (selectionVersion.current === version) setError(messageOf(caught, "The book could not be opened.")); }
    finally { if (selectionVersion.current === version) setBusy(""); }
  }

  async function openDirect(file: File | undefined) {
    if (!file) return;
    const version = ++selectionVersion.current;
    setError(""); setBusy("Checking book…");
    try { const next = await createLocalFileSource(file); if (selectionVersion.current === version) setSource(next); }
    catch (caught) { if (selectionVersion.current === version) setError(messageOf(caught, "The selected file could not be opened.")); }
    finally { if (selectionVersion.current === version) setBusy(""); }
  }

  async function removeImported(book: LibraryBook) {
    if (!window.confirm(`Remove “${book.title}” from browser storage? Your original file will not be deleted.`)) return;
    setError(""); setBusy("Removing book…");
    try {
      await importedSource.removeBook(book.id); await reloadBooks();
      setStorageRevision((value) => value + 1);
      setNotice(`Removed “${book.title}” from browser storage.`);
    }
    catch (caught) { setError(messageOf(caught, "The imported book could not be removed.")); }
    finally { setBusy(""); }
  }

  function closeBook() {
    selectionVersion.current += 1; setSource(null); setError(""); setBusy("");
    if (directInputRef.current) directInputRef.current.value = "";
  }

  return <main className="app">
    <header className="app-header">
      <a className="brand" href="#main-content" aria-label="Local Leaf Reader home"><span className="brand-mark" aria-hidden="true">L</span><span>Local Leaf</span></a>
      <div className="header-statuses">
        <span className={`connection-chip ${online ? "online" : "offline"}`}><span aria-hidden="true">●</span> {online ? "Online" : "Offline"}</span>
        <span className="privacy-chip"><span aria-hidden="true">●</span> Browser only</span>
      </div>
    </header>
    <div id="main-content" className={source ? "reader-page" : "library-page"}>
      {source ? <ReaderRouter key={source.id} source={source} onClose={closeBook} /> : <section className="library" aria-labelledby="library-title">
        <div className="library-heading">
          <div><p className="eyebrow">Your private shelf</p><h1 id="library-title">Library</h1></div>
          <div className="library-actions">
            {directorySupported && !folderSource && <button className="primary-button" disabled={!!busy} onClick={() => void connectFolder()}>Connect folder</button>}
            {folderSource && !folderSource.available && <button className="primary-button" disabled={!!busy} onClick={() => void reconnectFolder()}>Reconnect folder</button>}
            {folderSource?.available && <button className="secondary-outline-button" disabled={!!busy} onClick={() => void refreshFolder()}>Refresh folder</button>}
            <input ref={importInputRef} className="visually-hidden" id="import-books" type="file" multiple accept={ACCEPTED_TYPES} disabled={!opfsSupported || !!busy} onChange={(event) => void importBooks(event.target.files)} />
            <label className={`primary-button${!opfsSupported ? " is-disabled" : ""}`} htmlFor="import-books">Import books</label>
          </div>
        </div>
        {ready && !directorySupported && <p className="capability-note">Folder connections are not supported here. You can still import books or open a file once.</p>}
        {ready && !opfsSupported && <p className="capability-note">Persistent importing is unavailable in this browser. Use “Open individual file” instead.</p>}
        {folderSource && <p className="folder-status"><strong>Folder:</strong> {folderSource.folderName} · {folderSource.available ? "Available" : "Permission required — cached books are unavailable"}</p>}
        <div className="library-controls">
          <label className="search-field"><span className="visually-hidden">Search library</span><input type="search" placeholder="Search your library" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="format-filters" aria-label="Filter by format">{(["all", "epub", "pdf", "cbz"] as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value.toUpperCase()}</button>)}</div>
        </div>
        {(busy || error || notice) && <div className={`library-message${error ? " is-error" : ""}`} aria-live="polite">{busy && <span className="mini-spinner" aria-hidden="true" />}{busy || error || notice}</div>}
        {!ready ? <p className="empty-library">Loading your local library…</p> : visibleBooks.length ? <div className="book-list">
          {visibleBooks.map((book) => <article className={`book-card${book.available ? "" : " is-unavailable"}`} key={book.id}>
            <button className="book-open" disabled={!book.available || !!busy} onClick={() => void openLibraryBook(book)}>
              <span className="book-format">{book.format.toUpperCase()}</span>
              <span className="book-details"><strong>{book.title}</strong>{book.relativePath && <small>{book.relativePath}</small>}<small>{formatFileSize(book.size)} · {displayDate(book.lastModified)}</small></span>
              <span className={`source-label ${book.origin}`}>{book.origin === "folder" ? "Folder" : "Imported"}</span>
            </button>
            {book.origin === "imported" && <button className="remove-book" disabled={!!busy} onClick={() => void removeImported(book)} aria-label={`Remove ${book.title}`}>Remove</button>}
          </article>)}
        </div> : <p className="empty-library">{books.length ? "No books match your search and filter." : "Your library is empty. Connect a folder or import EPUB, PDF and CBZ books."}</p>}
        <div className="direct-open"><input ref={directInputRef} className="visually-hidden" id="direct-book" type="file" accept={ACCEPTED_TYPES} disabled={!!busy} onChange={(event) => void openDirect(event.target.files?.[0])} /><label className="text-button" htmlFor="direct-book">Open an individual file without adding it</label></div>
        <PwaLibraryTools storageRevision={storageRevision} />
        <aside className="library-privacy"><strong>Nothing is uploaded.</strong> Folder books stay in their original folder. Imported books are copied to private browser storage; clearing site data can remove them. Folder permission may need to be granted again.</aside>
      </section>}
    </div>
  </main>;
}
