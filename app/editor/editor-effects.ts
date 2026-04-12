import type { Filter } from "konva/lib/Node";
import type { Image as KonvaImage } from "konva/lib/shapes/Image";
import Konva from "konva";

export type EffectPresetId =
  | "original"
  | "vivid"
  | "fade"
  | "noir"
  | "warm"
  | "cool"
  | "matte"
  | "dramatic";

export type ActiveEffectPreset = EffectPresetId | "custom";

export type EffectValues = {
  /** Additive brighten, roughly -1…1 (Konva Brighten ×255). */
  brightness: number;
  /** Konva contrast, ~-50…50 (0 = neutral). */
  contrast: number;
  /** HSL saturation exponent input, ~-1…1 (0 = neutral). */
  saturation: number;
  /** HSL hue in degrees. */
  hue: number;
  /** HSL luminance offset. */
  luminance: number;
  blurRadius: number;
  /** 0…1 vignette strength. */
  vignette: number;
  useGrayscale: boolean;
};

export const DEFAULT_EFFECT_VALUES: EffectValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  luminance: 0,
  blurRadius: 0,
  vignette: 0,
  useGrayscale: false,
};

export const EFFECT_PRESET_META: Record<EffectPresetId, { label: string }> = {
  original: { label: "Original" },
  vivid: { label: "Vivid" },
  fade: { label: "Fade" },
  noir: { label: "Noir" },
  warm: { label: "Warm" },
  cool: { label: "Cool" },
  matte: { label: "Matte" },
  dramatic: { label: "Dramatic" },
};

export const EFFECT_PRESET_ORDER: EffectPresetId[] = [
  "original",
  "vivid",
  "fade",
  "noir",
  "warm",
  "cool",
  "matte",
  "dramatic",
];

export const PRESET_EFFECT_VALUES: Record<EffectPresetId, EffectValues> = {
  original: { ...DEFAULT_EFFECT_VALUES },
  vivid: {
    ...DEFAULT_EFFECT_VALUES,
    brightness: 0.06,
    contrast: 24,
    saturation: 0.42,
  },
  fade: {
    ...DEFAULT_EFFECT_VALUES,
    brightness: 0.1,
    contrast: -16,
    saturation: -0.52,
    luminance: 0.12,
  },
  noir: {
    ...DEFAULT_EFFECT_VALUES,
    useGrayscale: true,
    contrast: 32,
    brightness: -0.05,
  },
  warm: {
    ...DEFAULT_EFFECT_VALUES,
    hue: 14,
    saturation: 0.18,
    brightness: 0.06,
    contrast: 5,
  },
  cool: {
    ...DEFAULT_EFFECT_VALUES,
    hue: -17,
    saturation: 0.14,
    brightness: -0.02,
    contrast: 7,
  },
  matte: {
    ...DEFAULT_EFFECT_VALUES,
    contrast: -22,
    luminance: 0.16,
    brightness: 0.1,
    saturation: -0.22,
  },
  dramatic: {
    ...DEFAULT_EFFECT_VALUES,
    contrast: 45,
    brightness: -0.11,
    saturation: 0.1,
  },
};

export function cloneEffects(v: EffectValues): EffectValues {
  return { ...v };
}

export function effectsNeedKonvaProcessing(v: EffectValues): boolean {
  return (
    v.useGrayscale ||
    Math.abs(v.brightness) > 0.0001 ||
    Math.abs(v.contrast) > 0.0001 ||
    Math.abs(v.saturation) > 0.0001 ||
    Math.abs(v.hue) > 0.0001 ||
    Math.abs(v.luminance) > 0.0001 ||
    v.blurRadius > 0.25
  );
}

/** CSS filter string for preset thumbnails (approximate). */
export function effectValuesToCssFilter(v: EffectValues): string {
  const parts: string[] = [];
  if (v.useGrayscale) parts.push("grayscale(1)");
  const bright = Math.max(0.35, Math.min(1.85, 1 + v.brightness * 0.9));
  parts.push(`brightness(${bright})`);
  const cont = Math.max(0.45, Math.min(1.85, 1 + v.contrast / 100));
  parts.push(`contrast(${cont})`);
  const satMul = Math.pow(2, v.saturation);
  parts.push(`saturate(${Math.max(0, satMul)})`);
  if (Math.abs(v.hue) > 0.01) parts.push(`hue-rotate(${v.hue}deg)`);
  if (Math.abs(v.luminance) > 0.001) {
    parts.push(`brightness(${Math.max(0.5, 1 + v.luminance * 0.55)})`);
  }
  if (v.blurRadius > 0.25) {
    parts.push(`blur(${Math.min(10, v.blurRadius * 0.5)}px)`);
  }
  return parts.join(" ");
}

export function buildKonvaFilters(v: EffectValues): Filter[] {
  const out: Filter[] = [];
  if (v.useGrayscale) out.push(Konva.Filters.Grayscale);
  out.push(Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL);
  if (v.blurRadius > 0.25) out.push(Konva.Filters.Blur);
  return out;
}

export function applyKonvaEffectAttrs(node: KonvaImage, v: EffectValues): void {
  node.brightness(v.brightness);
  node.contrast(v.contrast);
  node.saturation(v.saturation);
  node.hue(v.hue);
  node.luminance(v.luminance);
  node.blurRadius(Math.max(0, Math.round(v.blurRadius)));
}
