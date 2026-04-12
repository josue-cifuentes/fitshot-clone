"use client";

import { useId, useState } from "react";
import {
  cloneEffects,
  effectValuesToCssFilter,
  EFFECT_PRESET_META,
  EFFECT_PRESET_ORDER,
  type ActiveEffectPreset,
  type EffectPresetId,
  type EffectValues,
  PRESET_EFFECT_VALUES,
} from "./editor-effects";

type EffectsPanelProps = {
  effects: EffectValues;
  onEffectsChange: (next: EffectValues) => void;
  activePreset: ActiveEffectPreset;
  onPresetChange: (id: ActiveEffectPreset) => void;
  /** Optional preview source (photo src or video object URL). */
  previewUrl: string | null;
  isVideo: boolean;
};

function EffectThumbnail({
  presetId,
  previewUrl,
  isVideo,
  values,
  selected,
  onSelect,
}: {
  presetId: EffectPresetId;
  previewUrl: string | null;
  isVideo: boolean;
  values: EffectValues;
  selected: boolean;
  onSelect: () => void;
}) {
  const css = effectValuesToCssFilter(values);
  const label = EFFECT_PRESET_META[presetId].label;
  const vignette = values.vignette;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border-2 p-0.5 transition ${
        selected
          ? "border-[#E8FF00] bg-[#E8FF00]/10 shadow-[0_0_16px_-4px_rgba(232,255,0,0.45)]"
          : "border-[#F5F5F5]/12 bg-[#F5F5F5]/[0.04] hover:border-[#F5F5F5]/25"
      }`}
    >
      <div className="relative h-16 w-14 overflow-hidden rounded-lg bg-[#1a1a1a] sm:h-[4.5rem] sm:w-[3.75rem]">
        {previewUrl ? (
          isVideo ? (
            <video
              key={previewUrl}
              src={previewUrl}
              className="h-full w-full object-cover"
              style={{ filter: css }}
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ filter: css }}
              draggable={false}
            />
          )
        ) : (
          <div
            className="h-full w-full bg-gradient-to-br from-[#2a2a2c] to-[#121214]"
            style={{ filter: css }}
          />
        )}
        {vignette > 0.02 ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-lg"
            style={{
              background: `radial-gradient(circle at 50% 42%, transparent 32%, rgba(0,0,0,${0.5 + vignette * 0.45}) 100%)`,
            }}
          />
        ) : null}
      </div>
      <span
        className={`max-w-[4rem] px-0.5 text-center text-[9px] font-bold leading-tight sm:text-[10px] ${
          selected ? "text-[#E8FF00]" : "text-[#F5F5F5]/65"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export function EffectsPanel({
  effects,
  onEffectsChange,
  activePreset,
  onPresetChange,
  previewUrl,
  isVideo,
}: EffectsPanelProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const baseId = useId();

  const pickPreset = (id: EffectPresetId) => {
    onPresetChange(id);
    onEffectsChange(cloneEffects(PRESET_EFFECT_VALUES[id]));
  };

  const setCustom = (patch: Partial<EffectValues>) => {
    onPresetChange("custom");
    onEffectsChange({ ...effects, ...patch });
  };

  const brightnessPct = Math.round(effects.brightness * 100);
  const contrastPct = Math.round(effects.contrast);
  const saturationPct = Math.round(effects.saturation * 100);
  const blurPx = effects.blurRadius;
  const vignettePct = Math.round(effects.vignette * 100);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F5F5F5]/50">
        Effects
      </p>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
        role="listbox"
        aria-label="Effect presets"
      >
        {EFFECT_PRESET_ORDER.map((id) => (
          <EffectThumbnail
            key={id}
            presetId={id}
            previewUrl={previewUrl}
            isVideo={isVideo}
            values={PRESET_EFFECT_VALUES[id]}
            selected={activePreset === id}
            onSelect={() => pickPreset(id)}
          />
        ))}
      </div>

      <details
        open={manualOpen}
        onToggle={(e) => setManualOpen(e.currentTarget.open)}
        className="group rounded-xl border border-[#F5F5F5]/10 bg-[#F5F5F5]/[0.03]"
      >
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-[#F5F5F5] marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Manual adjustments
            <span className="text-xs font-extrabold text-[#E8FF00]/80 group-open:rotate-180">
              ▼
            </span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-[#F5F5F5]/10 px-3 pb-4 pt-3">
          <div className="min-h-[44px]">
            <label
              className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45"
              htmlFor={`${baseId}-brightness`}
            >
              Brightness ({brightnessPct >= 0 ? "+" : ""}
              {brightnessPct})
            </label>
            <input
              id={`${baseId}-brightness`}
              type="range"
              min={-100}
              max={100}
              value={brightnessPct}
              onChange={(e) =>
                setCustom({ brightness: Number(e.target.value) / 100 })
              }
              className="editor-range-touch"
            />
          </div>
          <div className="min-h-[44px]">
            <label
              className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45"
              htmlFor={`${baseId}-contrast`}
            >
              Contrast ({contrastPct >= 0 ? "+" : ""}
              {contrastPct})
            </label>
            <input
              id={`${baseId}-contrast`}
              type="range"
              min={-100}
              max={100}
              value={contrastPct}
              onChange={(e) =>
                setCustom({ contrast: Number(e.target.value) })
              }
              className="editor-range-touch"
            />
          </div>
          <div className="min-h-[44px]">
            <label
              className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45"
              htmlFor={`${baseId}-saturation`}
            >
              Saturation ({saturationPct >= 0 ? "+" : ""}
              {saturationPct})
            </label>
            <input
              id={`${baseId}-saturation`}
              type="range"
              min={-100}
              max={100}
              value={saturationPct}
              onChange={(e) =>
                setCustom({ saturation: Number(e.target.value) / 100 })
              }
              className="editor-range-touch"
            />
          </div>
          <div className="min-h-[44px]">
            <label
              className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45"
              htmlFor={`${baseId}-blur`}
            >
              Blur ({blurPx.toFixed(0)}px)
            </label>
            <input
              id={`${baseId}-blur`}
              type="range"
              min={0}
              max={24}
              step={1}
              value={blurPx}
              onChange={(e) =>
                setCustom({ blurRadius: Number(e.target.value) })
              }
              className="editor-range-touch"
            />
          </div>
          <div className="min-h-[44px]">
            <label
              className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#F5F5F5]/45"
              htmlFor={`${baseId}-vignette`}
            >
              Vignette ({vignettePct}%)
            </label>
            <input
              id={`${baseId}-vignette`}
              type="range"
              min={0}
              max={100}
              value={vignettePct}
              onChange={(e) =>
                setCustom({ vignette: Number(e.target.value) / 100 })
              }
              className="editor-range-touch"
            />
          </div>
          <button
            type="button"
            onClick={() => pickPreset("original")}
            className="w-full rounded-xl border border-[#F5F5F5]/15 py-2.5 text-xs font-bold text-[#F5F5F5]/70 transition hover:border-[#E8FF00]/40 hover:text-[#E8FF00]"
          >
            Reset to original
          </button>
        </div>
      </details>
    </div>
  );
}
