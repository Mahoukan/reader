"use client";

import { useCallback, useSyncExternalStore, type SetStateAction } from "react";

export type EpubTheme = "light" | "dark" | "sepia" | "amoled" | "high-contrast-light" | "high-contrast-dark" | "custom";
export type EpubFontFamily = "publisher" | "serif" | "sans-serif" | "georgia" | "arial" | "verdana" | "open-dyslexic";
export type EpubFontWeight = 300 | 400 | 500 | 600 | 700;
export type EpubTextAlignment = "publisher" | "left" | "justify";
export type EpubMotionPreference = "device" | "reduce";

export interface EpubSettings {
  theme: EpubTheme;
  fontFamily: EpubFontFamily;
  fontWeight: EpubFontWeight;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  wordSpacing: number;
  paragraphSpacing: number;
  paragraphIndentation: boolean;
  textAlignment: EpubTextAlignment;
  columnWidth: number;
  textColor: string;
  backgroundColor: string;
  motionPreference: EpubMotionPreference;
}

export const EPUB_SETTINGS_STORAGE_KEY = "ebook-reader.epub-settings.v1";
const EPUB_SETTINGS_CHANGE_EVENT = "ebook-reader:epub-settings-change";

export const EPUB_THEME_COLORS: Record<Exclude<EpubTheme, "custom">, { textColor: string; backgroundColor: string }> = {
  light: { textColor: "#202422", backgroundColor: "#f7f7f4" },
  dark: { textColor: "#e7e7e2", backgroundColor: "#252725" },
  sepia: { textColor: "#4a3526", backgroundColor: "#f4ecd8" },
  amoled: { textColor: "#eeeeea", backgroundColor: "#050505" },
  "high-contrast-light": { textColor: "#000000", backgroundColor: "#ffffff" },
  "high-contrast-dark": { textColor: "#ffffff", backgroundColor: "#000000" },
};

export const EPUB_SETTINGS_DEFAULTS: EpubSettings = {
  theme: "light",
  fontFamily: "publisher",
  fontWeight: 400,
  fontSize: 100,
  lineHeight: 1.6,
  letterSpacing: 0,
  wordSpacing: 0,
  paragraphSpacing: 0.75,
  paragraphIndentation: false,
  textAlignment: "publisher",
  columnWidth: 760,
  motionPreference: "device",
  ...EPUB_THEME_COLORS.light,
};

export const EPUB_DYSLEXIA_PRESET = {
  fontFamily: "open-dyslexic",
  fontWeight: 400,
  fontSize: 110,
  lineHeight: 1.8,
  letterSpacing: 0.03,
  wordSpacing: 0.08,
  paragraphSpacing: 1,
  paragraphIndentation: false,
  textAlignment: "left",
  columnWidth: 680,
} as const satisfies Partial<EpubSettings>;

export const EPUB_SETTING_RANGES = {
  fontSize: { min: 80, max: 180, step: 5 },
  lineHeight: { min: 1.2, max: 2.2, step: 0.05 },
  letterSpacing: { min: -0.05, max: 0.15, step: 0.01 },
  wordSpacing: { min: -0.1, max: 0.3, step: 0.01 },
  paragraphSpacing: { min: 0, max: 2, step: 0.1 },
  columnWidth: { min: 480, max: 1000, step: 20 },
} as const;

const THEMES: EpubTheme[] = ["light", "dark", "sepia", "amoled", "high-contrast-light", "high-contrast-dark", "custom"];
const FONTS: EpubFontFamily[] = ["publisher", "serif", "sans-serif", "georgia", "arial", "verdana", "open-dyslexic"];
const FONT_WEIGHTS: EpubFontWeight[] = [300, 400, 500, 600, 700];
const ALIGNMENTS: EpubTextAlignment[] = ["publisher", "left", "justify"];
const MOTION_PREFERENCES: EpubMotionPreference[] = ["device", "reduce"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

function safeNumber(value: unknown, fallback: number, range: { min: number; max: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function parseStoredSettings(value: string | null): EpubSettings {
  if (!value) return EPUB_SETTINGS_DEFAULTS;
  try {
    const stored: unknown = JSON.parse(value);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return EPUB_SETTINGS_DEFAULTS;
    const candidate = stored as Record<string, unknown>;
    return {
      theme: isChoice(candidate.theme, THEMES) ? candidate.theme : EPUB_SETTINGS_DEFAULTS.theme,
      fontFamily: isChoice(candidate.fontFamily, FONTS) ? candidate.fontFamily : EPUB_SETTINGS_DEFAULTS.fontFamily,
      fontWeight: typeof candidate.fontWeight === "number" && FONT_WEIGHTS.includes(candidate.fontWeight as EpubFontWeight)
        ? candidate.fontWeight as EpubFontWeight
        : EPUB_SETTINGS_DEFAULTS.fontWeight,
      fontSize: safeNumber(candidate.fontSize, EPUB_SETTINGS_DEFAULTS.fontSize, EPUB_SETTING_RANGES.fontSize),
      lineHeight: safeNumber(candidate.lineHeight, EPUB_SETTINGS_DEFAULTS.lineHeight, EPUB_SETTING_RANGES.lineHeight),
      letterSpacing: safeNumber(candidate.letterSpacing, EPUB_SETTINGS_DEFAULTS.letterSpacing, EPUB_SETTING_RANGES.letterSpacing),
      wordSpacing: safeNumber(candidate.wordSpacing, EPUB_SETTINGS_DEFAULTS.wordSpacing, EPUB_SETTING_RANGES.wordSpacing),
      paragraphSpacing: safeNumber(candidate.paragraphSpacing, EPUB_SETTINGS_DEFAULTS.paragraphSpacing, EPUB_SETTING_RANGES.paragraphSpacing),
      paragraphIndentation: typeof candidate.paragraphIndentation === "boolean" ? candidate.paragraphIndentation : EPUB_SETTINGS_DEFAULTS.paragraphIndentation,
      textAlignment: isChoice(candidate.textAlignment, ALIGNMENTS) ? candidate.textAlignment : EPUB_SETTINGS_DEFAULTS.textAlignment,
      columnWidth: safeNumber(candidate.columnWidth, EPUB_SETTINGS_DEFAULTS.columnWidth, EPUB_SETTING_RANGES.columnWidth),
      textColor: typeof candidate.textColor === "string" && HEX_COLOR.test(candidate.textColor) ? candidate.textColor : EPUB_SETTINGS_DEFAULTS.textColor,
      backgroundColor: typeof candidate.backgroundColor === "string" && HEX_COLOR.test(candidate.backgroundColor) ? candidate.backgroundColor : EPUB_SETTINGS_DEFAULTS.backgroundColor,
      motionPreference: isChoice(candidate.motionPreference, MOTION_PREFERENCES) ? candidate.motionPreference : EPUB_SETTINGS_DEFAULTS.motionPreference,
    };
  } catch {
    return EPUB_SETTINGS_DEFAULTS;
  }
}

let currentSettings = EPUB_SETTINGS_DEFAULTS;
let settingsInitialized = false;

function loadStoredSettings() {
  try {
    return parseStoredSettings(window.localStorage.getItem(EPUB_SETTINGS_STORAGE_KEY));
  } catch {
    return EPUB_SETTINGS_DEFAULTS;
  }
}

function subscribeToSettings(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== EPUB_SETTINGS_STORAGE_KEY) return;
    currentSettings = loadStoredSettings();
    settingsInitialized = true;
    onChange();
  };
  window.addEventListener(EPUB_SETTINGS_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EPUB_SETTINGS_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSettingsSnapshot() {
  if (!settingsInitialized) {
    currentSettings = loadStoredSettings();
    settingsInitialized = true;
  }
  return currentSettings;
}

export function useEpubSettings() {
  const settings = useSyncExternalStore(subscribeToSettings, getSettingsSnapshot, () => EPUB_SETTINGS_DEFAULTS);

  const setSettings = useCallback((update: SetStateAction<EpubSettings>) => {
    const next = typeof update === "function" ? update(currentSettings) : update;
    currentSettings = next;
    settingsInitialized = true;
    try {
      window.localStorage.setItem(EPUB_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep live in-memory settings when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(EPUB_SETTINGS_CHANGE_EVENT));
  }, []);

  const resetSettings = useCallback(() => setSettings(EPUB_SETTINGS_DEFAULTS), [setSettings]);
  return { settings, setSettings, resetSettings };
}
