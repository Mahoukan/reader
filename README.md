# Local Leaf Reader — Stage One

Local Leaf Reader is a self-hosted, browser-based prototype for opening EPUB ebooks, PDF documents, and CBZ comics from your device. Stage One deliberately focuses on the reading experience: there are no accounts, uploads, libraries, or server-side book processing.

## Prerequisites

- Node.js 22.13 or newer (required by the installed PDF.js release)
- npm
- A current desktop or mobile browser

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js, normally `http://localhost:3000`.

Useful technical checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Supported formats

- `.epub` — reflowable, paginated reading with a table of contents and approximate progress
- `.pdf` — single-page canvas rendering with direct page navigation, zoom, and fit-to-width
- `.cbz` — JPEG, PNG, WebP, and GIF pages, including images in nested folders

The selector checks the extension or a recognised MIME type and then checks the file's basic PDF or ZIP signature. Damaged content is reported by its reader without crashing the app.

## Project structure

```text
src/
  app/                         Next.js page, layout, and global styles
  components/LocalReaderApp   selection and drag/drop flow
  features/
    local-file/                browser File-backed BookSource
    reader/
      core/                    shared types, shell, and error helpers
      epub/                    EPUB.js reader
      pdf/                     PDF.js reader
      cbz/                     JSZip comic reader
```

Every reader accepts the same `BookSource` interface instead of knowing about the file input. A future server-backed source can therefore load a `Blob` without changing the format readers.

## How the readers work

The shared shell supplies book identity, loading and error states, previous/next controls, position feedback, keyboard navigation, and close behaviour.

- EPUB.js receives an in-memory `ArrayBuffer`. Content is rendered in its sandboxed iframe with scripts disabled. A restrictive content-security policy blocks unexpected remote resources while allowing extracted blob/data assets. Generated locations provide approximate progress.
- PDF.js receives local bytes and renders one page at a time to a canvas. Its browser worker is bundled from `pdfjs-dist`; rendered pages and the document task are cancelled/destroyed on close.
- JSZip extracts supported images in memory. Metadata paths are ignored, nested folders are supported, and `Intl.Collator` numeric sorting keeps `1.jpg`, `2.jpg`, and `10.jpg` in natural order. Every generated image URL is revoked on close.

Left Arrow and Right Arrow navigate when possible. Escape closes the current book.

## Privacy

Selected books never leave the browser. This project has no upload endpoint or API route. Files are read through browser APIs, held only in memory, and released when the book is closed or replaced. EPUB content is isolated from the parent application and book-provided scripts are not allowed to run.

## Manual testing checklist

- [ ] Open an EPUB and navigate chapters.
- [ ] Open a multi-page PDF.
- [ ] Open a CBZ and verify numerical page ordering.
- [ ] Test a CBZ containing nested image folders.
- [ ] Try damaged and incorrectly renamed files.
- [ ] Test desktop and mobile-width layouts.
- [ ] Switch repeatedly between all three formats.
- [ ] Close a book while it is loading.
- [ ] Confirm in browser developer tools that no book content is uploaded.

## Known limitations

- EPUB progress is approximate and becomes more accurate after locations finish generating.
- Password-protected PDFs are reported but cannot be unlocked.
- PDF viewing is single-page and does not include text selection or search.
- CBZ viewing is single-page, left-to-right only; animated GIF behaviour depends on the browser.
- Reader state is not persisted after closing or refreshing.
- Very large books may use substantial browser memory because processing is intentionally local.

## Postponed until later stages

Authentication, user accounts, a book library, collections, server storage, annotations, reading-progress persistence, appearance customisation, PWA/offline management, deployment configuration, and cloud storage are intentionally out of scope for Stage One.
