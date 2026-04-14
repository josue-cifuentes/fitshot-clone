import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GarminRecoveryDay } from "./garmin-recovery";
import type { StravaActivity } from "./strava";

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
  garminDays: GarminRecoveryDay[];
  athleteName?: string;
}): Promise<AiTrainingRecommendation> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: "gemini-1.5-flash",
  });

  const stravaSummary = input.stravaActivities.slice(0, 30).map((a) => ({
    name: a.name,
    type: a.type,
    date: a.start_date,
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    movingMin: Math.round(a.moving_time / 60),
    avgHr: a.average_heartrate ?? null,
  }));

  const garminSummary = input.garminDays.map((d) => ({
    date: d.date,
    bodyBattery: d.bodyBattery ?? null,
    hrv: d.hrv ?? null,
    hrvStatus: d.hrvStatus ?? null,
    sleepScore: d.sleepScore ?? null,
    trainingReadiness: d.trainingReadiness ?? null,
    restingHr: d.restingHeartRate ?? null,
  }));

  const prompt = `You are an endurance coach. Based on the athlete's last Strava sessions and Garmin recovery metrics, recommend ONE training session for TODAY.

Athlete: ${input.athleteName ?? "Athlete"}

Strava (recent, newest first):
${JSON.stringify(stravaSummary, null, 2)}

Garmin recovery (last days, oldest → newest):
${JSON.stringify(garminSummary, null, 2)}

Respond with ONLY valid JSON (no markdown) in this exact shape:
{"type":"string workout category e.g. Easy run, Rest, Cross-train","durationMinutes":number,"intensity":"e.g. Z2 / moderate / easy","reasoning":"2-4 sentences citing recovery metrics"}

Rules:
- If recovery is poor (low sleep score, low body battery, poor HRV), prefer rest, easy work, or short duration.
- If readiness is strong, you can suggest quality or longer endurance.
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
