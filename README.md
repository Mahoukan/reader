# Local Ebook Reader

Local Ebook Reader is a private, browser-based EPUB, PDF, and CBZ reader with a local-folder library, private browser imports, installation, and offline application support. It has no accounts, uploads, or server-side book processing.

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
npm run build:pages
```

`npm run build:pages` creates the static GitHub Pages site in `out/` and then generates `out/sw.js` with Serwist.

## Deploy to GitHub Pages

1. Create a GitHub repository, or connect this folder to an existing repository.
2. Commit the project and push it to the `main` branch.
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source.
4. Configure `reader-test.arulmozhis.com` as the Pages custom domain.
5. At the DNS provider for `arulmozhis.com`, create a CNAME record for `reader-test` pointing to the repository owner’s GitHub Pages hostname, such as `OWNER.github.io`.
6. Wait for GitHub Pages to validate the DNS record and make HTTPS available.

The deployed website is publicly accessible, but books are not published with it. Book contents, folder handles, IndexedDB catalogue data, and OPFS imports stay inside each visitor’s browser and are not uploaded. Authentication and a shared server-backed library will require a later deployment through Coolify or another server host.

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

Books never leave the browser. This project has no upload endpoint or API route. Connected books remain in their original folder, while imported books are copied to that browser’s private OPFS storage and catalogued in IndexedDB. EPUB content is isolated from the parent application and book-provided scripts are not allowed to run.

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

Authentication, user accounts, shared server storage, collections, annotations, reading-progress persistence, native packaging, and cloud storage remain out of scope.
