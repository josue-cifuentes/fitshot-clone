import { GarminConnect } from "@flow-js/garmin-connect";
import type { SleepData } from "@flow-js/garmin-connect/dist/garmin/types/sleep";

export type GarminRecoveryDay = {
  date: string;
  bodyBattery?: number;
  hrv?: number;
  hrvStatus?: string;
  sleepScore?: number;
  trainingReadiness?: number | null;
  restingHeartRate?: number;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromSleepData(date: Date, data: SleepData | null): GarminRecoveryDay {
  const dateStr = dayKey(date);
  if (!data) {
    return { date: dateStr, trainingReadiness: null };
  }
  const bbLast =
    data.sleepBodyBattery && data.sleepBodyBattery.length > 0
      ? data.sleepBodyBattery[data.sleepBodyBattery.length - 1]?.value
      : undefined;
  const overall = data.dailySleepDTO?.sleepScores?.overall?.value;
  return {
    date: dateStr,
    bodyBattery: bbLast,
    hrv:
      typeof data.avgOvernightHrv === "number"
        ? Math.round(data.avgOvernightHrv)
        : undefined,
    hrvStatus: data.hrvStatus || undefined,
    sleepScore: typeof overall === "number" ? overall : undefined,
    restingHeartRate:
      typeof data.restingHeartRate === "number"
        ? Math.round(data.restingHeartRate)
        : undefined,
    trainingReadiness: null,
  };
}

/**
 * Best-effort training readiness / load from Garmin user summary (structure varies by account).
 */
async function fetchTrainingReadinessGuess(
  gc: GarminConnect,
  profileId: number,
  dateStr: string
): Promise<number | null> {
  try {
    const base = `https://connect.garmin.com/modern/proxy/usersummary-service/usersummary/daily/${profileId}`;
    const row = await gc.get<Record<string, unknown>>(base, {
      params: { date: dateStr },
    });
    const tr =
      row?.trainingReadinessScore ??
      row?.trainingReadiness ??
      row?.dailyTrainingLoad ??
      row?.trainingStatus;
    if (typeof tr === "number" && Number.isFinite(tr)) return tr;
    if (typeof tr === "object" && tr !== null && "value" in tr) {
      const v = (tr as { value?: unknown }).value;
      if (typeof v === "number") return v;
    }
  } catch {
    /* endpoint may differ */
  }
  return null;
}

/** Heuristic 0–100 when Garmin does not expose training readiness. */
export function estimateReadiness(day: GarminRecoveryDay): number | null {
  const parts: number[] = [];
  if (day.bodyBattery != null) parts.push(Math.min(100, day.bodyBattery));
  if (day.sleepScore != null) parts.push(day.sleepScore);
  if (day.hrv != null) {
    parts.push(Math.min(100, Math.max(0, (day.hrv / 80) * 100)));
  }
  if (parts.length === 0) return null;
  return Math.round(
    parts.reduce((a, b) => a + b, 0) / parts.length
  );
}

export async function fetchGarminRecoveryLastDays(
  gc: GarminConnect,
  days = 7
): Promise<{
  profile: Awaited<ReturnType<GarminConnect["getUserProfile"]>>;
  days: GarminRecoveryDay[];
}> {
  const profile = await gc.getUserProfile();
  const profileId = profile.profileId;
  const out: GarminRecoveryDay[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(12, 0, 0, 0);
    let sleep: SleepData | null = null;
    try {
      sleep = await gc.getSleepData(d);
    } catch {
      sleep = null;
    }
    const row = fromSleepData(d, sleep);
    const dateStr = row.date;
    const tr = await fetchTrainingReadinessGuess(gc, profileId, dateStr);
    row.trainingReadiness =
      tr ?? estimateReadiness(row);
    out.push(row);
  }
  return { profile, days: out.reverse() };
}

export { GarminConnect };
