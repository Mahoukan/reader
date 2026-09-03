"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Book from "epubjs/types/book";
import type Contents from "epubjs/types/contents";
import type { NavItem } from "epubjs/types/navigation";
import type Rendition from "epubjs/types/rendition";
import type { Location } from "epubjs/types/rendition";
import type { BookSource } from "../core/types";
import { readableError } from "../core/readerErrors";
import { ReaderShell } from "../core/ReaderShell";

interface EpubReaderProps {
  source: BookSource;
  onClose(): void;
}

interface SerializableSection {
  output: string;
}

const CONTENT_POLICY =
  "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:";

function addContentPolicy(output: string, section: SerializableSection) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_POLICY}" />`;
  section.output = /<head(?:\s[^>]*)?>/i.test(output)
    ? output.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${policy}`)
    : output;
}

function flattenToc(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

export function EpubReader({ source, onClose }: EpubReaderProps) {
  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toc, setToc] = useState<Array<NavItem & { depth: number }>>([]);
  const [percentage, setPercentage] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const previous = useCallback(() => { void renditionRef.current?.prev(); }, []);
  const next = useCallback(() => { void renditionRef.current?.next(); }, []);
  const goTo = useCallback((href: string) => { void renditionRef.current?.display(href); }, []);

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
    let disposed = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;

    async function openBook() {
      try {
        const [{ default: ePub }, blob] = await Promise.all([import("epubjs"), source.load()]);
        if (disposed) return;
        book = ePub(await blob.arrayBuffer());
        book.spine.hooks.serialize.register(addContentPolicy);
        await book.ready;
        if (disposed || !mountRef.current) return;

        setToc(flattenToc(book.navigation.toc));
        rendition = book.renderTo(mountRef.current, {
          width: "100%",
          height: "100%",
          manager: "continuous",
          flow: "scrolled",
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.default({
          "html, body": {
            "overflow-x": "hidden !important",
          },
          body: {
            "font-family": "Georgia, 'Times New Roman', serif",
            "line-height": "1.65",
            "max-width": "42rem",
            margin: "0 auto !important",
            padding: "clamp(1.5rem, 5vw, 3.5rem) !important",
            "box-sizing": "border-box",
            "background-color": "#fffaf0",
          },
          "p, li": {
            "line-height": "1.65",
          },
          "img, svg, video": {
            "max-width": "100% !important",
            height: "auto !important",
          },
          "pre, table": {
            "max-width": "100% !important",
          },
        });

        rendition.hooks.content.register((contents: Contents) => {
          contents.document.querySelectorAll("a[href]").forEach((link) => {
            const href = link.getAttribute("href") ?? "";
            if (/^(?:https?:)?\/\//i.test(href)) link.removeAttribute("href");
          });
        });
        rendition.on("relocated", (location: Location) => {
          if (disposed) return;
          setAtStart(location.atStart);
          setAtEnd(location.atEnd);
          const value = Number.isFinite(location.start.percentage) ? location.start.percentage : 0;
          setPercentage(Math.max(0, Math.min(100, Math.round(value * 100))));
        });

        await rendition.display();
        if (!disposed) setLoading(false);

        void book.locations.generate(1600).then(() => {
          if (!disposed) void rendition?.reportLocation();
        });
      } catch (caught) {
        if (!disposed) {
          setLoading(false);
          setError(readableError(caught, "This EPUB is damaged or uses features this reader cannot process."));
        }
      }
    }

    void openBook();
    return () => {
      disposed = true;
      renditionRef.current = null;
      book?.destroy();
    };
  }, [source]);

  const sidebar = toc.length > 0 ? (
    <aside className="toc-panel" aria-label="Table of contents">
      <details open>
        <summary>Contents <span>{toc.length}</span></summary>
        <nav>
          {toc.map((item, index) => (
            <button
              type="button"
              key={`${item.id}-${index}`}
              style={{ paddingInlineStart: `${1 + item.depth * 0.8}rem` }}
              onClick={() => goTo(item.href)}
            >
              {item.label.trim() || `Section ${index + 1}`}
            </button>
          ))}
        </nav>
      </details>
    </aside>
  ) : undefined;

  return (
    <div ref={fullscreenRootRef} className="epub-fullscreen-root">
      <ReaderShell
        source={source}
        onClose={onClose}
        onPrevious={previous}
        onNext={next}
        canPrevious={!atStart}
        canNext={!atEnd}
        position={`${percentage}% read`}
        loading={loading}
        error={error}
        sidebar={sidebar}
        tools={
          <button type="button" onClick={() => void toggleFullscreen()}>
            Enter fullscreen
          </button>
        }
      >
        <div className="epub-reading-surface">
          <div className="epub-fullscreen-toolbar" aria-label="EPUB fullscreen controls">
            <output aria-live="polite">{percentage}% read</output>
            {toc.length > 0 && (
              <details>
                <summary>Contents</summary>
                <nav>
                  {toc.map((item, index) => (
                    <button type="button" key={`${item.id}-fullscreen-${index}`} onClick={() => goTo(item.href)}>
                      {item.label.trim() || `Section ${index + 1}`}
                    </button>
                  ))}
                </nav>
              </details>
            )}
            <button type="button" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </button>
          </div>
          <div ref={mountRef} className="epub-stage" aria-label="EPUB content" />
        </div>
      </ReaderShell>
    </div>
  );
}
