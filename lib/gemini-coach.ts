import { GoogleGenerativeAI } from "@google/generative-ai";
import type { StravaActivity } from "./strava";
import type { RecoveryDayForPrompt } from "./recovery-prompt";

export type AiTrainingRecommendation = {
  type: string;
  durationMinutes: number;
  intensity: string;
  reasoning: string;
};

function requireGeminiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

export async function generateTrainingRecommendation(input: {
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
  athleteName?: string;
}): Promise<AiTrainingRecommendation> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const stravaSummary = input.stravaActivities.slice(0, 30).map((a) => ({
    name: a.name,
    type: a.type,
    date: a.start_date,
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    movingMin: Math.round(a.moving_time / 60),
    avgHr: a.average_heartrate ?? null,
  }));

  const recoverySummary = input.recoveryDays.map((d) => ({
    date: d.date,
    bodyBattery: d.bodyBattery ?? null,
    hrv: d.hrv ?? null,
    hrvStatus: d.hrvStatus ?? null,
    sleepScore: d.sleepScore ?? null,
    trainingReadiness: d.trainingReadiness ?? null,
    restingHr: d.restingHr ?? null,
    sleepDurationMinutes: d.sleepDurationMinutes ?? null,
    activeEnergyKcal: d.activeEnergyKcal ?? null,
    steps: d.steps ?? null,
  }));

  const sourceLabel =
    input.recoverySource === "garmin"
      ? "Garmin Connect"
      : "Apple Health (Health Auto Export)";

  const prompt = `You are an endurance coach. Based on the athlete's last Strava sessions and recovery metrics from ${sourceLabel}, recommend ONE training session for TODAY.

Athlete: ${input.athleteName ?? "Athlete"}

Strava (recent, newest first):
${JSON.stringify(stravaSummary, null, 2)}

Recovery metrics — ${sourceLabel} (last days, oldest → newest):
${JSON.stringify(recoverySummary, null, 2)}

Respond with ONLY valid JSON (no markdown) in this exact shape:
{"type":"string workout category e.g. Easy run, Rest, Cross-train","durationMinutes":number,"intensity":"e.g. Z2 / moderate / easy","reasoning":"2-4 sentences citing recovery metrics"}

Rules:
- If recovery is poor (low sleep score or quality, low body battery when present, poor HRV, high fatigue from low sleep duration), prefer rest, easy work, or short duration.
- If readiness is strong, you can suggest quality or longer endurance.
- For Apple-only data, use HRV, resting HR, sleep duration/quality, steps, and active energy as recovery signals.
- durationMinutes between 0 (rest) and 180.`;

  const res = await model.generateContent(prompt);
  const text = res.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : text;
  const parsed = JSON.parse(raw) as AiTrainingRecommendation;
  if (
    typeof parsed.type !== "string" ||
    typeof parsed.durationMinutes !== "number" ||
    typeof parsed.intensity !== "string" ||
    typeof parsed.reasoning !== "string"
  ) {
    throw new Error("Invalid Gemini JSON shape");
  }
  return {
    type: parsed.type,
    durationMinutes: Math.max(0, Math.min(300, Math.round(parsed.durationMinutes))),
    intensity: parsed.intensity,
    reasoning: parsed.reasoning,
  };
}

/** Conversational reply for Telegram; plain text, no structured JSON. */
export async function generateTelegramCoachChatReply(input: {
  userMessage: string;
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
  athleteName?: string;
}): Promise<string> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const stravaSummary = input.stravaActivities.slice(0, 30).map((a) => ({
    name: a.name,
    type: a.type,
    date: a.start_date,
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    movingMin: Math.round(a.moving_time / 60),
    avgHr: a.average_heartrate ?? null,
  }));

  const recoverySummary = input.recoveryDays.map((d) => ({
    date: d.date,
    bodyBattery: d.bodyBattery ?? null,
    hrv: d.hrv ?? null,
    hrvStatus: d.hrvStatus ?? null,
    sleepScore: d.sleepScore ?? null,
    trainingReadiness: d.trainingReadiness ?? null,
    restingHr: d.restingHr ?? null,
    sleepDurationMinutes: d.sleepDurationMinutes ?? null,
    activeEnergyKcal: d.activeEnergyKcal ?? null,
    steps: d.steps ?? null,
  }));

  const sourceLabel =
    input.recoverySource === "garmin"
      ? "Garmin Connect"
      : "Apple Health (Health Auto Export)";

  const prompt = `You are a supportive endurance and recovery coach replying on Telegram.

Athlete: ${input.athleteName ?? "Athlete"}

Their message:
"""${input.userMessage.replace(/"""/g, "'")}"""

Use ONLY the data below. If they ask for something not covered (e.g. routes, power zones without data), say what you can infer from recovery and load, or that the data isn't available in FitShot yet.

Strava (last ~7 days, newest first):
${JSON.stringify(stravaSummary, null, 2)}

Recovery — ${sourceLabel} (oldest → newest):
${JSON.stringify(recoverySummary, null, 2)}

Reply in plain language only. No JSON, no markdown code fences. Be concise but helpful (under 3500 characters). Reference specific metrics when useful.`;

  const res = await model.generateContent(prompt);
  let text = res.response.text().trim();
  if (text.length > 3900) {
    text = `${text.slice(0, 3880)}…`;
  }
  return text;
}
