"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { BookSource } from "../core/types";
import { readableError } from "../core/readerErrors";
import { ReaderShell } from "../core/ReaderShell";

interface PdfReaderProps {
  source: BookSource;
  onClose(): void;
}

interface PdfPageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  renderWidth: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onRenderError(): void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const VISIBILITY_THRESHOLDS = Array.from({ length: 11 }, (_, index) => index / 10);

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function PdfPageCanvas({ document, pageNumber, renderWidth, scrollRoot, onRenderError }: PdfPageCanvasProps) {
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("8.5 / 11");

  useEffect(() => {
    const container = containerRef.current;
    const root = scrollRoot.current;
    if (!container || !root || shouldRender) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { root, rootMargin: "100% 0px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRoot, shouldRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!shouldRender || !canvas || renderWidth <= 0) return;
    const activeCanvas = canvas;

    let disposed = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      try {
        page = await document.getPage(pageNumber);
        if (disposed || !page) return;
        const naturalViewport = page.getViewport({ scale: 1 });
        setAspectRatio(`${naturalViewport.width} / ${naturalViewport.height}`);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (renderWidth / naturalViewport.width) * pixelRatio;
        const viewport = page.getViewport({ scale });
        activeCanvas.width = Math.floor(viewport.width);
        activeCanvas.height = Math.floor(viewport.height);
        activeCanvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        activeCanvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
        renderTask = page.render({ canvas: activeCanvas, viewport });
        await renderTask.promise;
      } catch (caught) {
        if (!disposed && !(caught instanceof Error && caught.name === "RenderingCancelledException")) {
          onRenderError();
        }
      }
    }

    void renderPage();
    return () => {
      disposed = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [document, onRenderError, pageNumber, renderWidth, shouldRender]);

  return (
    <article
      ref={containerRef}
      className="pdf-page"
      data-page-index={pageNumber - 1}
      id={`pdf-page-${pageNumber}`}
      style={{ aspectRatio }}
      aria-label={`PDF page ${pageNumber}`}
    >
      <canvas ref={canvasRef} />
    </article>
  );
}

export function PdfReader({ source, onClose }: PdfReaderProps) {
  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [stageWidth, setStageWidth] = useState(0);
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const fullscreenRoot = fullscreenRootRef.current;

    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === fullscreenRoot);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      if (document.fullscreenElement === fullscreenRoot) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  async function toggleFullscreen() {
    const fullscreenRoot = fullscreenRootRef.current;
    try {
      if (document.fullscreenElement === fullscreenRoot) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement && fullscreenRoot?.requestFullscreen) {
        await fullscreenRoot.requestFullscreen();
      }
    } catch {
      // Fullscreen can be unavailable or denied by browser policy.
    }
  }

  useEffect(() => {
    const stage = scrollRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null;

    async function openDocument() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const blob = await source.load();
        if (disposed) return;
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          enableXfa: false,
        });
        const pdf = await loadingTask.promise;
        if (disposed) return;
        documentRef.current = pdf;
        setPdfDocument(pdf);
        setPageCount(pdf.numPages);
        setLoadingDocument(false);
      } catch (caught) {
        if (!disposed) {
          setLoadingDocument(false);
          setError(readableError(caught, "This PDF is damaged, unsupported, or could not be read."));
        }
      }
    }

    void openDocument();
    return () => {
      disposed = true;
      documentRef.current = null;
      void loadingTask?.destroy();
    };
  }, [source]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || pageCount === 0) return;

    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number((entry.target as HTMLElement).dataset.pageIndex);
        ratios.set(index, entry.intersectionRatio);
      });

      let mostVisible = 0;
      let highestRatio = -1;
      ratios.forEach((ratio, index) => {
        if (ratio > highestRatio) {
          highestRatio = ratio;
          mostVisible = index;
        }
      });
      if (highestRatio > 0) {
        setPageNumber(mostVisible + 1);
        setPageInput(String(mostVisible + 1));
      }
    }, { root: scrollElement, threshold: VISIBILITY_THRESHOLDS });

    scrollElement.querySelectorAll<HTMLElement>("[data-page-index]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pageCount]);

  function changeZoom(delta: number) {
    setFitWidth(false);
    setZoom((value) => clampZoom(value + delta));
  }

  function goToPage() {
    const requestedPage = Number(pageInput);
    if (!Number.isFinite(requestedPage) || pageCount === 0) {
      setPageInput(String(pageNumber));
      return;
    }
    const targetPage = Math.max(1, Math.min(pageCount, Math.round(requestedPage)));
    setPageInput(String(targetPage));
    const target = scrollRef.current?.querySelector<HTMLElement>(`#pdf-page-${targetPage}`);
    if (target && scrollRef.current) {
      scrollRef.current.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    }
  }

  const handleRenderError = useCallback(() => setError("A PDF page could not be rendered."), []);
  const renderWidth = Math.max(160, (stageWidth - 16) * zoom);
  const pagesStyle = { "--pdf-zoom": `${zoom * 100}%` } as CSSProperties;
  const position = pageCount ? `Page ${pageNumber} of ${pageCount}` : "Page — of —";

  return (
    <div ref={fullscreenRootRef} className="pdf-fullscreen-root">
      <ReaderShell
        source={source}
        onClose={onClose}
        canPrevious={false}
        canNext={false}
        position={position}
        loading={loadingDocument}
        error={error}
        hideFooter
      >
        <div className="pdf-surface">
          <div className="pdf-floating-toolbar" aria-label="PDF viewing controls">
            <label className="pdf-page-input">
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={pageInput}
                disabled={!pageCount}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={goToPage}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    goToPage();
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Go to PDF page"
              />
              <span>of {pageCount || "—"}</span>
            </label>
            <button type="button" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM || !pageCount} aria-label="Zoom out">−</button>
            <span className="pdf-zoom-value">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM || !pageCount} aria-label="Zoom in">+</button>
            <button type="button" className="pdf-fit-button" aria-pressed={fitWidth} disabled={!pageCount} onClick={() => { setZoom(1); setFitWidth(true); }}>Fit to width</button>
            <button type="button" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </button>
          </div>

          <div ref={scrollRef} className="pdf-scroll">
            <div className={`pdf-pages${fitWidth ? " is-fit" : ""}`} style={pagesStyle}>
              {pdfDocument && Array.from({ length: pageCount }, (_, index) => (
                <PdfPageCanvas
                  key={index + 1}
                  document={pdfDocument}
                  pageNumber={index + 1}
                  renderWidth={renderWidth}
                  scrollRoot={scrollRef}
                  onRenderError={handleRenderError}
                />
              ))}
            </div>
          </div>
        </div>
      </ReaderShell>
    </div>
  );
}
