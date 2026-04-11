export type StatKey =
  | "distance"
  | "duration"
  | "avgSpeed"
  | "heartRate"
  | "elevation"
  | "calories";

export type LayerToggles = {
  topBar: boolean;
  bottomBar: boolean;
  map: boolean;
} & Record<StatKey, boolean>;
