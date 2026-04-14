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

const TELEGRAM_STRAVA_CAP = 12;

/** Compact fitness context for Telegram (text + vision) — smaller prompt = faster. */
function formatTelegramFitnessContext(input: {
  athleteName?: string;
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
}): string {
  const src =
    input.recoverySource === "garmin" ? "Garmin Connect" : "Apple Health";
  const lines = input.stravaActivities.slice(0, TELEGRAM_STRAVA_CAP).map(
    (a) =>
      `- ${a.start_date.slice(0, 10)} ${a.name || a.type} | ${a.type} | ${(Math.round((a.distance / 1000) * 10) / 10).toFixed(1)}km | ${Math.round(a.moving_time / 60)}min | HR ${a.average_heartrate ?? "—"}`
  );
  const rec = input.recoveryDays.map((d) => {
    const bits = [
      d.date,
      d.bodyBattery != null ? `BB ${d.bodyBattery}` : null,
      d.hrv != null ? `HRV ${d.hrv}` : d.hrvStatus,
      d.sleepScore != null ? `sleep ${d.sleepScore}` : null,
      d.sleepDurationMinutes != null ? `sleepMin ${d.sleepDurationMinutes}` : null,
      d.restingHr != null ? `rHR ${d.restingHr}` : null,
      d.steps != null ? `steps ${Math.round(d.steps)}` : null,
      d.activeEnergyKcal != null ? `kcal ${Math.round(d.activeEnergyKcal)}` : null,
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  });
  return `Athlete: ${input.athleteName ?? "Athlete"}
Recovery source: ${src}

Strava (up to ${TELEGRAM_STRAVA_CAP} sessions, newest listed first):
${lines.join("\n") || "(none)"}

Recovery (oldest → newest):
${rec.join("\n") || "(none)"}`;
}

const TELEGRAM_REPLY_RULES = `Telegram mobile — keep answers fast to read:
- Maximum 3–4 short paragraphs total.
- No long bullet lists; avoid numbered lists unless 2–3 items max. Prefer short sentences.
- Lead with the direct answer, then brief context. Plain text only, no code fences.
- Stay under ~1200 characters when you can; never ramble.`;

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

  const ctx = formatTelegramFitnessContext(input);
  const prompt = `You are FitShot's endurance & recovery coach on Telegram.

${TELEGRAM_REPLY_RULES}

Their message:
"""${input.userMessage.replace(/"""/g, "'")}"""

Use only the fitness context below (do not invent Strava/recovery numbers). If something isn't in the data, say so briefly.

--- Context ---
${ctx}
---

Reply now.`;

  const res = await model.generateContent(prompt);
  let text = res.response.text().trim();
  if (text.length > 1600) {
    text = `${text.slice(0, 1580)}…`;
  }
  return text;
}

/** Photo + caption: vision analysis with same fitness context and concise Telegram style. */
export async function generateTelegramCoachPhotoReply(input: {
  userMessage: string;
  imageBase64: string;
  imageMimeType: string;
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
  athleteName?: string;
}): Promise<string> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const ctx = formatTelegramFitnessContext(input);
  const prompt = `You are FitShot's coach on Telegram. The user sent a photo.

User question (or instruction):
"""${input.userMessage.replace(/"""/g, "'")}"""

${TELEGRAM_REPLY_RULES}

Personalize using this athlete context (do not invent metrics):
--- Context ---
${ctx}
---

Look at the image. Give practical fitness/training-related help: e.g. food/meal → brief nutrition angle; workout screenshot → interpret key numbers; map/route → training relevance; injury or body area → safe, non-alarming guidance and when to see a pro if serious; equipment/form if visible. If the image isn't fitness-related, say so in one short line and stop.

Reply now in plain text.`;

  const res = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    },
  ]);
  let text = res.response.text().trim();
  if (text.length > 1600) {
    text = `${text.slice(0, 1580)}…`;
  }
  return text;
}
