import type { Dispatch, SetStateAction } from "react";
import {
  EPUB_SETTING_RANGES,
  EPUB_SETTINGS_DEFAULTS,
  EPUB_THEME_COLORS,
  type EpubSettings,
  type EpubTheme,
} from "./useEpubSettings";

interface EpubSettingsPanelProps {
  settings: EpubSettings;
  setSettings: Dispatch<SetStateAction<EpubSettings>>;
  onClose(): void;
  onReset(): void;
}

const PRESET_THEMES: Array<{ value: Exclude<EpubTheme, "custom">; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
  { value: "amoled", label: "AMOLED" },
];

export function EpubSettingsPanel({ settings, setSettings, onClose, onReset }: EpubSettingsPanelProps) {
  const update = <K extends keyof EpubSettings>(key: K, value: EpubSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const selectTheme = (theme: Exclude<EpubTheme, "custom">) => {
    setSettings((current) => ({ ...current, theme, ...EPUB_THEME_COLORS[theme] }));
  };

  const updateColor = (key: "textColor" | "backgroundColor", value: string) => {
    setSettings((current) => ({ ...current, theme: "custom", [key]: value }));
  };

  return (
    <aside id="epub-settings-panel" className="epub-settings-panel" aria-label="EPUB appearance settings">
      <div className="epub-settings-heading">
        <div>
          <h2>Appearance</h2>
          <p>Changes apply as you read.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close appearance settings">×</button>
      </div>

      <div className="epub-settings-scroll">
        <fieldset>
          <legend>Theme{settings.theme === "custom" ? " — Custom" : ""}</legend>
          <div className="epub-theme-options">
            {PRESET_THEMES.map((theme) => (
              <button
                type="button"
                key={theme.value}
                aria-pressed={settings.theme === theme.value}
                onClick={() => selectTheme(theme.value)}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>Font family</span>
          <select value={settings.fontFamily} onChange={(event) => update("fontFamily", event.target.value as EpubSettings["fontFamily"])}>
            <option value="publisher">Publisher default</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="georgia">Georgia</option>
            <option value="arial">Arial</option>
            <option value="verdana">Verdana</option>
          </select>
        </label>

        <RangeControl label="Font size" value={settings.fontSize} suffix="%" range={EPUB_SETTING_RANGES.fontSize} onChange={(value) => update("fontSize", value)} />
        <RangeControl label="Line height" value={settings.lineHeight} range={EPUB_SETTING_RANGES.lineHeight} onChange={(value) => update("lineHeight", value)} />
        <RangeControl label="Paragraph spacing" value={settings.paragraphSpacing} suffix=" rem" range={EPUB_SETTING_RANGES.paragraphSpacing} onChange={(value) => update("paragraphSpacing", value)} />

        <label className="epub-toggle-control">
          <span>Paragraph indentation</span>
          <input type="checkbox" checked={settings.paragraphIndentation} onChange={(event) => update("paragraphIndentation", event.target.checked)} />
        </label>

        <label>
          <span>Text alignment</span>
          <select value={settings.textAlignment} onChange={(event) => update("textAlignment", event.target.value as EpubSettings["textAlignment"])}>
            <option value="publisher">Publisher default</option>
            <option value="left">Left</option>
            <option value="justify">Justified</option>
          </select>
        </label>

        <RangeControl label="Reading-column width" value={settings.columnWidth} suffix=" px" range={EPUB_SETTING_RANGES.columnWidth} onChange={(value) => update("columnWidth", value)} />

        <div className="epub-color-controls">
          <label>
            <span>Text colour</span>
            <input type="color" value={settings.textColor} onChange={(event) => updateColor("textColor", event.target.value)} />
            <output>{settings.textColor.toUpperCase()}</output>
          </label>
          <label>
            <span>Background colour</span>
            <input type="color" value={settings.backgroundColor} onChange={(event) => updateColor("backgroundColor", event.target.value)} />
            <output>{settings.backgroundColor.toUpperCase()}</output>
          </label>
        </div>

        <button type="button" className="epub-reset-button" onClick={onReset} disabled={JSON.stringify(settings) === JSON.stringify(EPUB_SETTINGS_DEFAULTS)}>
          Reset to defaults
        </button>
      </div>
    </aside>
  );
}

interface RangeControlProps {
  label: string;
  value: number;
  suffix?: string;
  range: { min: number; max: number; step: number };
  onChange(value: number): void;
}

function RangeControl({ label, value, suffix = "", range, onChange }: RangeControlProps) {
  return (
    <label className="epub-range-control">
      <span>{label} <output>{Number(value.toFixed(2))}{suffix}</output></span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value} onChange={(event) => onChange(event.target.valueAsNumber)} />
    </label>
  );
}
