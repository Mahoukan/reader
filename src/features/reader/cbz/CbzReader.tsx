"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BookSource } from "../core/types";
import { ReaderShell } from "../core/ReaderShell";

interface CbzReaderProps {
  source: BookSource;
  onClose(): void;
}

interface ComicPage {
  name: string;
  url: string;
}

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif)$/i;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const VISIBILITY_THRESHOLDS = Array.from({ length: 11 }, (_, index) => index / 10);
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function isReadableImage(path: string): boolean {
  const parts = path.split("/");
  return (
    IMAGE_EXTENSION.test(path) &&
    !parts.some((part) => part === "__MACOSX" || part.startsWith("."))
  );
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function CbzReader({ source, onClose }: CbzReaderProps) {
  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [visiblePage, setVisiblePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(true);
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
    let disposed = false;
    const objectUrls: string[] = [];

    async function openArchive() {
      try {
        const [{ default: JSZip }, blob] = await Promise.all([import("jszip"), source.load()]);
        const archive = await JSZip.loadAsync(blob);
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
        const entries = Object.values(archive.files)
          .filter((entry) => !entry.dir && isReadableImage(entry.name))
          .sort((left, right) => collator.compare(left.name, right.name));

        if (entries.length === 0) throw new Error("no-images");

        const extracted = await Promise.all(entries.map(async (entry) => {
          const extension = entry.name.toLowerCase().split(".").pop() ?? "";
          const data = await entry.async("uint8array");
          const buffer = new ArrayBuffer(data.byteLength);
          new Uint8Array(buffer).set(data);
          const imageBlob = new Blob([buffer], { type: MIME_BY_EXTENSION[extension] });
          const url = URL.createObjectURL(imageBlob);
          objectUrls.push(url);
          return { name: entry.name, url };
        }));

        if (disposed) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setPages(extracted);
        setLoading(false);
      } catch (caught) {
        if (!disposed) {
          setLoading(false);
          setError(
            caught instanceof Error && caught.message === "no-images"
              ? "This CBZ does not contain any readable JPEG, PNG, WebP, or GIF images."
              : "This CBZ archive is damaged or could not be read.",
          );
        }
      }
    }

    void openArchive();
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [source]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || pages.length === 0) return;

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
      if (highestRatio > 0) setVisiblePage(mostVisible);
    }, { root: scrollElement, threshold: VISIBILITY_THRESHOLDS });

    scrollElement.querySelectorAll<HTMLElement>("[data-page-index]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pages]);

  function changeZoom(delta: number) {
    setFitWidth(false);
    setZoom((value) => clampZoom(value + delta));
  }

  const comicStyle = { "--comic-zoom": `${zoom * 100}%` } as CSSProperties;
  const position = pages.length ? `Page ${visiblePage + 1} of ${pages.length}` : "Page — of —";

  return (
    <div ref={fullscreenRootRef} className="cbz-fullscreen-root">
      <ReaderShell
        source={source}
        onClose={onClose}
        canPrevious={false}
        canNext={false}
        position={position}
        loading={loading}
        error={error}
        hideFooter
      >
        <div className="comic-surface">
          <div className="comic-toolbar" aria-label="Comic viewing controls">
            <output aria-live="polite">{position}</output>
            <button type="button" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
            <span className="comic-zoom-value">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
            <button type="button" className="comic-fit-button" aria-pressed={fitWidth} onClick={() => { setZoom(1); setFitWidth(true); }}>Fit to width</button>
            <button type="button" className="comic-fullscreen-button" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </button>
          </div>

          <div ref={scrollRef} className="comic-scroll">
            <div className={`comic-pages${fitWidth ? " is-fit" : ""}`} style={comicStyle}>
              {pages.map((page, index) => (
                <figure className="comic-page" data-page-index={index} key={page.name}>
                  {/* Blob URLs are local, short-lived assets and cannot use Next's image optimiser. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={`Comic page ${index + 1}: ${page.name}`}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                </figure>
              ))}
            </div>
          </div>
        </div>
      </ReaderShell>
    </div>
  );
}
