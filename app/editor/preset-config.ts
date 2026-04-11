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
    description: "Bottom bar — distance & time only",
  },
  full: {
    label: "Full stats",
    description: "Title, all stats, route map",
  },
  mapFocus: {
    label: "Map focus",
    description: "Large route + side stats",
  },
  storyMode: {
    label: "Story mode",
    description: "Vertical stack for stories",
  },
  darkCard: {
    label: "Dark card",
    description: "Centered stat grid",
  },
};

export const PRESET_ORDER: PresetId[] = [
  "minimal",
  "full",
  "mapFocus",
  "storyMode",
  "darkCard",
];

export function layersForPreset(id: PresetId): LayerToggles {
  const allStats: Pick<
    LayerToggles,
    | "distance"
    | "duration"
    | "avgSpeed"
    | "heartRate"
    | "elevation"
    | "calories"
  > = {
    distance: true,
    duration: true,
    avgSpeed: true,
    heartRate: true,
    elevation: true,
    calories: true,
  };

  switch (id) {
    case "minimal":
      return {
        topBar: false,
        bottomBar: true,
        map: false,
        distance: true,
        duration: true,
        avgSpeed: false,
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
        topBar: false,
        bottomBar: false,
        map: true,
        ...allStats,
      };
    case "storyMode":
      return {
        topBar: false,
        bottomBar: false,
        map: false,
        ...allStats,
      };
    case "darkCard":
      return {
        topBar: false,
        bottomBar: false,
        map: false,
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

/** Story preset forces tall canvas; others respect current feed/story toggle unless null */
export function preferredExportForPreset(id: PresetId): "feed" | "story" | null {
  if (id === "storyMode") return "story";
  return null;
}
