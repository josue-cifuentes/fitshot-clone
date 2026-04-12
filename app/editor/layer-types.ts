export type StatKey =
  | "distance"
  | "duration"
  | "avgSpeed"
  | "maxSpeed"
  | "heartRate"
  | "elevation"
  | "calories";

export type LayerToggles = {
  topBar: boolean;
  bottomBar: boolean;
  map: boolean;
} & Record<StatKey, boolean>;
