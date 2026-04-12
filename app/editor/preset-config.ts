import type { LayerToggles } from "./layer-types";

export type PresetId =
  | "minimal"
  | "full"
  | "mapFocus"
  | "storyMode"
  | "darkCard";

export const PRESET_META: Record<
  PresetId,
  { label: string; description: string }
> = {
  minimal: {
    label: "Minimal",
    description: "Header optional · distance & time in bottom stack",
  },
  full: {
    label: "Full stats",
    description: "Header, map, all stats in bottom stack",
  },
  mapFocus: {
    label: "Map focus",
    description: "Larger route card · stats below",
  },
  storyMode: {
    label: "Story mode",
    description: "9:16 defaults · full stack",
  },
  darkCard: {
    label: "Dark card",
    description: "Darker bottom glass panel",
  },
};

export const PRESET_ORDER: PresetId[] = [
  "minimal",
  "full",
  "mapFocus",
  "storyMode",
  "darkCard",
];

const allStats: Pick<
  LayerToggles,
  | "distance"
  | "duration"
  | "avgSpeed"
  | "maxSpeed"
  | "heartRate"
  | "elevation"
  | "calories"
> = {
  distance: true,
  duration: true,
  avgSpeed: true,
  maxSpeed: true,
  heartRate: true,
  elevation: true,
  calories: true,
};

export function layersForPreset(id: PresetId): LayerToggles {
  switch (id) {
    case "minimal":
      return {
        topBar: false,
        bottomBar: true,
        map: false,
        distance: true,
        duration: true,
        avgSpeed: false,
        maxSpeed: false,
        heartRate: false,
        elevation: false,
        calories: false,
      };
    case "full":
      return {
        topBar: true,
        bottomBar: true,
        map: true,
        ...allStats,
      };
    case "mapFocus":
      return {
        topBar: true,
        bottomBar: true,
        map: true,
        ...allStats,
      };
    case "storyMode":
      return {
        topBar: true,
        bottomBar: true,
        map: true,
        ...allStats,
      };
    case "darkCard":
      return {
        topBar: true,
        bottomBar: true,
        map: true,
        ...allStats,
      };
    default:
      return {
        topBar: true,
        bottomBar: true,
        map: true,
        ...allStats,
      };
  }
}

/** Story Mode → 9:16; all other presets → 1:1 feed. */
export function exportFormatForPreset(id: PresetId): "feed" | "story" {
  return id === "storyMode" ? "story" : "feed";
}

export function mapScaleForPreset(id: PresetId): number {
  return id === "mapFocus" ? 1.22 : 1;
}
