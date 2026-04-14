import type { GarminRecoveryDay } from "./garmin-recovery";
import type { AppleHealthDay } from "./apple-health";

/** Unified recovery row for Gemini (Garmin and/or Apple Health). */
export type RecoveryDayForPrompt = {
  date: string;
  bodyBattery?: number | null;
  hrv?: number | null;
  hrvStatus?: string | null;
  sleepScore?: number | null;
  trainingReadiness?: number | null;
  restingHr?: number | null;
  sleepDurationMinutes?: number | null;
  activeEnergyKcal?: number | null;
  steps?: number | null;
};

export function garminDaysToPrompt(
  days: GarminRecoveryDay[]
): RecoveryDayForPrompt[] {
  return days.map((d) => ({
    date: d.date,
    bodyBattery: d.bodyBattery ?? null,
    hrv: d.hrv ?? null,
    hrvStatus: d.hrvStatus ?? null,
    sleepScore: d.sleepScore ?? null,
    trainingReadiness: d.trainingReadiness ?? null,
    restingHr: d.restingHeartRate ?? null,
    sleepDurationMinutes: null,
    activeEnergyKcal: null,
    steps: null,
  }));
}

export function appleDaysToPrompt(days: AppleHealthDay[]): RecoveryDayForPrompt[] {
  return days.map((d) => ({
    date: d.date,
    bodyBattery: null,
    hrv: d.hrv ?? null,
    hrvStatus: d.hrv != null ? `${Math.round(d.hrv)} ms` : null,
    sleepScore: d.sleepQuality ?? null,
    trainingReadiness: null,
    restingHr: d.restingHeartRate ?? null,
    sleepDurationMinutes: d.sleepDurationMinutes ?? null,
    activeEnergyKcal: d.activeEnergyKcal ?? null,
    steps: d.steps ?? null,
  }));
}
