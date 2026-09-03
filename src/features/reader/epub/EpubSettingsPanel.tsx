import type { Dispatch, SetStateAction } from "react";
import {
  EPUB_DYSLEXIA_PRESET,
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
  { value: "high-contrast-light", label: "High Contrast Light" },
  { value: "high-contrast-dark", label: "High Contrast Dark" },
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

  const applyDyslexiaPreset = () => {
    setSettings((current) => ({ ...current, ...EPUB_DYSLEXIA_PRESET }));
  };

  const dyslexiaPresetApplied = Object.entries(EPUB_DYSLEXIA_PRESET).every(
    ([key, value]) => settings[key as keyof EpubSettings] === value,
  );

  return (
    <aside id="epub-settings-panel" className="epub-settings-panel" aria-labelledby="epub-settings-heading">
      <div className="epub-settings-heading">
        <div>
          <h2 id="epub-settings-heading">Appearance</h2>
          <p>Changes apply as you read.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close EPUB appearance settings">×</button>
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

        <fieldset>
          <legend>Motion</legend>
          <div className="epub-motion-options">
            <label>
              <input type="radio" name="epub-motion" value="device" checked={settings.motionPreference === "device"} onChange={() => update("motionPreference", "device")} />
              <span>Use device setting</span>
            </label>
            <label>
              <input type="radio" name="epub-motion" value="reduce" checked={settings.motionPreference === "reduce"} onChange={() => update("motionPreference", "reduce")} />
              <span>Reduce motion</span>
            </label>
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
            <option value="open-dyslexic">OpenDyslexic</option>
          </select>
        </label>

        <label>
          <span>Font weight</span>
          <select value={settings.fontWeight} onChange={(event) => update("fontWeight", Number(event.target.value) as EpubSettings["fontWeight"])}>
            <option value={300}>Light</option>
            <option value={400}>Normal</option>
            <option value={500}>Medium</option>
            <option value={600}>Semi-bold</option>
            <option value={700}>Bold</option>
          </select>
        </label>

        <RangeControl label="Font size" value={settings.fontSize} suffix="%" range={EPUB_SETTING_RANGES.fontSize} onChange={(value) => update("fontSize", value)} />
        <RangeControl label="Line height" value={settings.lineHeight} range={EPUB_SETTING_RANGES.lineHeight} onChange={(value) => update("lineHeight", value)} />
        <RangeControl label="Letter spacing" value={settings.letterSpacing} suffix=" em" range={EPUB_SETTING_RANGES.letterSpacing} onChange={(value) => update("letterSpacing", value)} />
        <RangeControl label="Word spacing" value={settings.wordSpacing} suffix=" em" range={EPUB_SETTING_RANGES.wordSpacing} onChange={(value) => update("wordSpacing", value)} />
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

        <button type="button" className="epub-preset-button" aria-pressed={dyslexiaPresetApplied} onClick={applyDyslexiaPreset}>
          Apply dyslexia-friendly preset
        </button>

        <div className="epub-color-controls">
          <label>
            <span>Text colour</span>
            <input type="color" aria-label="EPUB text colour" value={settings.textColor} onChange={(event) => updateColor("textColor", event.target.value)} />
            <output>{settings.textColor.toUpperCase()}</output>
          </label>
          <label>
            <span>Background colour</span>
            <input type="color" aria-label="EPUB background colour" value={settings.backgroundColor} onChange={(event) => updateColor("backgroundColor", event.target.value)} />
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
  const displayedValue = `${Number(value.toFixed(2))}${suffix}`;
  return (
    <label className="epub-range-control">
      <span>{label} <output>{displayedValue}</output></span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value} aria-valuetext={displayedValue} onChange={(event) => onChange(event.target.valueAsNumber)} />
    </label>
  );
}
