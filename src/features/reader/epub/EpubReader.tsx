"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type Book from "epubjs/types/book";
import type Contents from "epubjs/types/contents";
import type { NavItem } from "epubjs/types/navigation";
import type Rendition from "epubjs/types/rendition";
import type { Location, RenditionOptions } from "epubjs/types/rendition";
import type { BookSource } from "../core/types";
import { readableError } from "../core/readerErrors";
import { ReaderShell } from "../core/ReaderShell";
import { EpubSettingsPanel } from "./EpubSettingsPanel";
import { type EpubSettings, useEpubSettings } from "./useEpubSettings";

interface EpubReaderProps {
  source: BookSource;
  onClose(): void;
}

interface SerializableSection {
  output: string;
}

const CONTENT_POLICY =
  "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src 'self' blob: data:; media-src blob: data:";

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

const FONT_STACKS: Record<Exclude<EpubSettings["fontFamily"], "publisher">, string> = {
  serif: "serif",
  "sans-serif": "sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  "open-dyslexic": "OpenDyslexic, Verdana, Arial, sans-serif",
};

const EPUB_APPEARANCE_STYLE_ID = "ebook-reader-epub-appearance";
const EPUB_VIEW_BUFFER = 1000;

interface BufferedRenditionOptions extends RenditionOptions {
  offset: number;
}

function epubAppearanceCss(settings: EpubSettings, fontAssetRoot: string, reduceMotion: boolean) {
  const openDyslexicFaces = settings.fontFamily === "open-dyslexic"
    ? `
      @font-face {
        font-family: "OpenDyslexic";
        src: url("${fontAssetRoot}/opendyslexic-latin-400-normal.woff2") format("woff2");
        font-style: normal;
        font-weight: 400;
        font-display: swap;
      }
      @font-face {
        font-family: "OpenDyslexic";
        src: url("${fontAssetRoot}/opendyslexic-latin-700-normal.woff2") format("woff2");
        font-style: normal;
        font-weight: 700;
        font-display: swap;
      }`
    : "";
  const fontRule = settings.fontFamily === "publisher"
    ? ""
    : `body, body * { font-family: ${FONT_STACKS[settings.fontFamily]} !important; }\npre, code, kbd, samp { font-family: monospace !important; }`;
  const alignmentRule = settings.textAlignment === "publisher"
    ? ""
    : `p { text-align: ${settings.textAlignment} !important; }`;
  const highContrastLinkRule = settings.theme === "high-contrast-light" || settings.theme === "high-contrast-dark"
    ? "text-decoration-thickness: max(2px, 0.12em) !important; text-underline-offset: 0.16em !important;"
    : "";
  const highContrastContentRule = settings.theme === "high-contrast-light" || settings.theme === "high-contrast-dark"
    ? "body *, body *::before, body *::after { background-color: transparent !important; }"
    : "";
  const reducedMotionRule = reduceMotion
    ? `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation: none !important;
        transition: none !important;
      }`
    : "";

  return `
    ${openDyslexicFaces}
    html {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    html, body {
      color: ${settings.textColor} !important;
      background: ${settings.backgroundColor} !important;
    }
    body, body * {
      color: ${settings.textColor} !important;
      -webkit-text-fill-color: ${settings.textColor} !important;
      font-weight: ${settings.fontWeight} !important;
      letter-spacing: ${settings.letterSpacing}em !important;
      word-spacing: ${settings.wordSpacing}em !important;
    }
    body {
      width: 100% !important;
      max-width: ${settings.columnWidth}px !important;
      min-width: 0 !important;
      margin: 0 auto !important;
      padding: clamp(1.25rem, 5vw, 3.25rem) !important;
      box-sizing: border-box !important;
      font-size: ${settings.fontSize}% !important;
      line-height: ${settings.lineHeight} !important;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    b, strong, h1, h2, h3, h4, h5, h6 { font-weight: bolder !important; }
    body * { max-width: 100%; }
    p {
      margin-block: 0 ${settings.paragraphSpacing}rem !important;
      text-indent: ${settings.paragraphIndentation ? "1.5em" : "0"} !important;
      line-height: ${settings.lineHeight} !important;
    }
    li { line-height: ${settings.lineHeight} !important; }
    img, svg, video, canvas { max-width: 100% !important; height: auto !important; }
    pre { max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere; }
    table { max-width: 100% !important; overflow-wrap: anywhere; }
    a { color: inherit !important; text-decoration: underline !important; ${highContrastLinkRule} }
    a:focus-visible { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
    ${highContrastContentRule}
    ${fontRule}
    ${alignmentRule}
    ${reducedMotionRule}
  `;
}

function applyEpubSettingsToContent(contents: Contents, settings: EpubSettings, reduceMotion: boolean) {
  const document = contents.document;
  let style = document.getElementById(EPUB_APPEARANCE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = EPUB_APPEARANCE_STYLE_ID;
    document.head.appendChild(style);
  }
  const fontAssetRoot = new URL("/fonts/opendyslexic", window.location.origin).href.replace(/\/$/, "");
  style.textContent = epubAppearanceCss(settings, fontAssetRoot, reduceMotion);

  if (style.dataset.textColor === settings.textColor) return;
  style.dataset.textColor = settings.textColor;

  // Only inline !important colours can outrank the reader stylesheet. Inspect
  // the much smaller set of elements with inline declarations and correct just
  // those conflicting properties.
  document.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    if (element.style.getPropertyPriority("color") === "important") {
      element.style.setProperty("color", settings.textColor, "important");
    }
    if (element.style.getPropertyPriority("-webkit-text-fill-color") === "important") {
      element.style.setProperty("-webkit-text-fill-color", settings.textColor, "important");
    }
  });
}

function applyEpubSettingsToLoadedContent(rendition: Rendition, settings: EpubSettings, reduceMotion: boolean) {
  const loadedContents = rendition.getContents() as unknown as Contents[];
  loadedContents.forEach((contents) => applyEpubSettingsToContent(contents, settings, reduceMotion));
}

export function EpubReader({ source, onClose }: EpubReaderProps) {
  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const { settings, setSettings, resetSettings } = useEpubSettings();
  const settingsRef = useRef<EpubSettings>(settings);
  const [devicePrefersReducedMotion, setDevicePrefersReducedMotion] = useState(false);
  const reduceMotion = settings.motionPreference === "reduce"
    || (settings.motionPreference === "device" && devicePrefersReducedMotion);
  const reduceMotionRef = useRef(reduceMotion);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toc, setToc] = useState<Array<NavItem & { depth: number }>>([]);
  const [percentage, setPercentage] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const progressRef = useRef({ percentage: 0, atStart: true, atEnd: false });

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

  useEffect(() => {
    if (settings.motionPreference !== "device") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setDevicePrefersReducedMotion(mediaQuery.matches);
    syncPreference();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }
    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, [settings.motionPreference]);

  useEffect(() => {
    settingsRef.current = settings;
    reduceMotionRef.current = reduceMotion;
    const rendition = renditionRef.current;
    if (rendition) applyEpubSettingsToLoadedContent(rendition, settings, reduceMotion);
  }, [settings, reduceMotion]);

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
    let onContent: ((contents: Contents) => void) | null = null;
    let onRelocated: ((location: Location) => void) | null = null;
    let pendingLocation: Location | null = null;
    let progressFrame: number | null = null;

    async function openBook() {
      try {
        const [{ default: ePub }, blob] = await Promise.all([import("epubjs"), source.load()]);
        if (disposed) return;
        book = ePub(await blob.arrayBuffer());
        book.spine.hooks.serialize.register(addContentPolicy);
        await book.ready;
        if (disposed || !mountRef.current) return;

        setToc(flattenToc(book.navigation.toc));
        const renditionOptions: BufferedRenditionOptions = {
          width: "100%",
          height: "100%",
          manager: "continuous",
          flow: "scrolled",
          spread: "none",
          offset: EPUB_VIEW_BUFFER,
          allowScriptedContent: false,
        };
        rendition = book.renderTo(mountRef.current, renditionOptions);
        renditionRef.current = rendition;

        onContent = (contents: Contents) => {
          applyEpubSettingsToContent(contents, settingsRef.current, reduceMotionRef.current);
          contents.document.querySelectorAll("a[href]").forEach((link) => {
            const href = link.getAttribute("href") ?? "";
            if (/^(?:https?:)?\/\//i.test(href)) link.removeAttribute("href");
          });
        };
        rendition.hooks.content.register(onContent);

        onRelocated = (location: Location) => {
          if (disposed) return;
          pendingLocation = location;
          if (progressFrame !== null) return;
          progressFrame = requestAnimationFrame(() => {
            progressFrame = null;
            const latest = pendingLocation;
            pendingLocation = null;
            if (disposed || !latest) return;

            const value = Number.isFinite(latest.start.percentage) ? latest.start.percentage : 0;
            const nextProgress = {
              percentage: Math.max(0, Math.min(100, Math.round(value * 100))),
              atStart: Boolean(latest.atStart),
              atEnd: Boolean(latest.atEnd),
            };
            const previousProgress = progressRef.current;
            progressRef.current = nextProgress;
            if (nextProgress.atStart !== previousProgress.atStart) setAtStart(nextProgress.atStart);
            if (nextProgress.atEnd !== previousProgress.atEnd) setAtEnd(nextProgress.atEnd);
            if (nextProgress.percentage !== previousProgress.percentage) setPercentage(nextProgress.percentage);
          });
        };
        rendition.on("relocated", onRelocated);

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
      if (progressFrame !== null) cancelAnimationFrame(progressFrame);
      if (rendition && onContent) rendition.hooks.content.deregister(onContent);
      if (rendition && onRelocated) rendition.off("relocated", onRelocated);
      book?.destroy();
    };
  }, [source]);

  const epubSurfaceStyle = {
    "--epub-background": settings.backgroundColor,
    "--epub-text": settings.textColor,
  } as CSSProperties;

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
    <div ref={fullscreenRootRef} className="epub-fullscreen-root" data-reduce-motion={reduceMotion ? "true" : undefined} style={epubSurfaceStyle}>
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
          <>
            <button type="button" className="epub-appearance-button" aria-label="Appearance settings" aria-controls="epub-settings-panel" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
              <span aria-hidden="true">Aa</span><span className="epub-tool-label">Appearance</span>
            </button>
            <button type="button" onClick={() => void toggleFullscreen()}>
              Enter fullscreen
            </button>
          </>
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
            <button type="button" aria-controls="epub-settings-panel" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
              <span aria-hidden="true">Aa</span> Appearance
            </button>
            <button type="button" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </button>
          </div>
          <div ref={mountRef} className="epub-stage" aria-label="EPUB content" />
        </div>
      </ReaderShell>
      {settingsOpen && (
        <EpubSettingsPanel settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} onReset={resetSettings} />
      )}
    </div>
  );
}
