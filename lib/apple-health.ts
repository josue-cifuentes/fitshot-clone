/** One day of metrics from Apple Health (Shortcuts POST or legacy Health Auto Export). */
export type AppleHealthDay = {
  date: string;
  hrv?: number;
  restingHeartRate?: number;
  sleepDurationMinutes?: number;
  sleepQuality?: number;
  activeEnergyKcal?: number;
  steps?: number;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseAppleHealthDaysJson(
  json: string | null | undefined
): AppleHealthDay[] {
  if (!json?.trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(isAppleHealthDay);
  } catch {
    return [];
  }
}

function isAppleHealthDay(x: unknown): x is AppleHealthDay {
  if (!x || typeof x !== "object") return false;
  const d = x as AppleHealthDay;
  return typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
}

function num(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Normalize Apple Health JSON (Shortcuts POST, Health Auto Export, etc.).
 * Accepts flat or nested shapes and common key aliases.
 */
export function normalizeAppleHealthPayload(
  payload: unknown,
  now: Date = new Date()
): AppleHealthDay {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : {};
  const m = { ...root, ...nested };

  const dateRaw =
    (typeof m.date === "string" && m.date) ||
    (typeof m.day === "string" && m.day) ||
    (typeof (m as { dateKey?: string }).dateKey === "string" &&
      (m as { dateKey: string }).dateKey) ||
    "";

  let date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : dayKey(now);

  const hrv =
    num(m.hrv) ??
    num(m.heartRateVariability) ??
    num(m.heart_rate_variability) ??
    num(m.HRV) ??
    num((m.metrics as Record<string, unknown> | undefined)?.hrv);

  const restingHeartRate =
    num(m.restingHeartRate) ??
    num(m.resting_heart_rate) ??
    num(m.restingHR) ??
    num(m.resting_hr) ??
    num((m.metrics as Record<string, unknown> | undefined)?.restingHeartRate);

  let sleepDurationMinutes =
    num(m.sleepDurationMinutes) ??
    num(m.sleep_duration_minutes) ??
    num(m.sleepDuration) ??
    num(m.sleep_duration);
  if (sleepDurationMinutes == null) {
    const hrs = num(m.sleepHours) ?? num(m.sleep_hours);
    if (hrs != null) sleepDurationMinutes = Math.round(hrs * 60);
  }

  const sleepQuality =
    num(m.sleepQuality) ??
    num(m.sleep_quality) ??
    num(m.sleepScore) ??
    num(m.sleep_score);

  const activeEnergyKcal =
    num(m.activeEnergy) ??
    num(m.active_energy) ??
    num(m.activeEnergyKcal) ??
    num(m.active_kcal) ??
    num(m.activeCalories);

  const steps =
    num(m.steps) ??
    num(m.stepCount) ??
    num(m.step_count);

  return {
    date,
    hrv,
    restingHeartRate,
    sleepDurationMinutes,
    sleepQuality,
    activeEnergyKcal,
    steps,
  };
}

function mergeDay(
  prev: AppleHealthDay | undefined,
  incoming: AppleHealthDay
): AppleHealthDay {
  return {
    date: incoming.date,
    hrv: incoming.hrv ?? prev?.hrv,
    restingHeartRate: incoming.restingHeartRate ?? prev?.restingHeartRate,
    sleepDurationMinutes:
      incoming.sleepDurationMinutes ?? prev?.sleepDurationMinutes,
    sleepQuality: incoming.sleepQuality ?? prev?.sleepQuality,
    activeEnergyKcal: incoming.activeEnergyKcal ?? prev?.activeEnergyKcal,
    steps: incoming.steps ?? prev?.steps,
  };
}

/** Merge webhook payload into stored JSON; keeps last 14 day records max. */
export function mergeAppleHealthIntoStoredJson(
  existingJson: string | null | undefined,
  payload: unknown,
  now?: Date
): { mergedJson: string; days: AppleHealthDay[] } {
  const t = now ?? new Date();
  const incoming = normalizeAppleHealthPayload(payload, t);
  const existing = parseAppleHealthDaysJson(existingJson);
  const map = new Map<string, AppleHealthDay>();
  for (const d of existing) {
    map.set(d.date, d);
  }
  const merged = mergeDay(map.get(incoming.date), incoming);
  map.set(merged.date, merged);
  const sorted = [...map.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const trimmed = sorted.slice(-14);
  return { mergedJson: JSON.stringify(trimmed), days: trimmed };
}

export function appleDaysJsonHasData(json: string | null | undefined): boolean {
  const days = parseAppleHealthDaysJson(json);
  return days.some(
    (d) =>
      d.hrv != null ||
      d.restingHeartRate != null ||
      d.sleepDurationMinutes != null ||
      d.sleepQuality != null ||
      d.activeEnergyKcal != null ||
      d.steps != null
  );
}
