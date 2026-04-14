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

const TELEGRAM_FLASH_MODEL = "gemini-2.5-flash";

const TELEGRAM_GENERATION = {
  maxOutputTokens: 400,
  temperature: 0.35,
} as const;

const TELEGRAM_HISTORY_MSG_CAP = 520;

function formatTelegramConversationBlock(
  history: { role: "user" | "assistant"; content: string }[]
): string {
  if (history.length === 0) return "";
  const lines = history.map((h) => {
    const label = h.role === "user" ? "User" : "Coach";
    const text =
      h.content.length > TELEGRAM_HISTORY_MSG_CAP
        ? `${h.content.slice(0, TELEGRAM_HISTORY_MSG_CAP)}…`
        : h.content;
    return `${label}: ${text}`;
  });
  return `Earlier in this chat (oldest first):\n${lines.join("\n\n")}`;
}

function trimTelegramReply(text: string): string {
  const max = 1100;
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

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

/** Conversational reply for Telegram; plain text, no structured JSON. */
export async function generateTelegramCoachChatReply(input: {
  userMessage: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
  athleteName?: string;
}): Promise<string> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: TELEGRAM_FLASH_MODEL,
    generationConfig: TELEGRAM_GENERATION,
  });

  const ctx = formatTelegramFitnessContext(input);
  const hist = formatTelegramConversationBlock(input.conversationHistory);
  const prompt = `FitShot Telegram coach. Reply in 2–3 short paragraphs, plain text only.

Rules: Tie every recommendation to the Athlete Context below—use their name when given, cite specific sessions (date/type/distance), and recovery signals (HRV, sleep score or duration, body battery, resting HR, steps/kcal as relevant). Do not give generic advice that ignores that data. If the context lacks what you need, say so in one sentence. Do not invent numbers.

${hist ? `${hist}\n\n` : ""}Athlete Context:
${ctx}

Current message:
"""${input.userMessage.replace(/"""/g, "'")}"""

Answer now.`;

  const res = await model.generateContent(prompt);
  return trimTelegramReply(res.response.text());
}

/** Photo + caption: vision analysis with same fitness context and concise Telegram style. */
export async function generateTelegramCoachPhotoReply(input: {
  userMessage: string;
  imageBase64: string;
  imageMimeType: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  stravaActivities: StravaActivity[];
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
  athleteName?: string;
}): Promise<string> {
  const model = new GoogleGenerativeAI(requireGeminiKey()).getGenerativeModel({
    model: TELEGRAM_FLASH_MODEL,
    generationConfig: TELEGRAM_GENERATION,
  });

  const ctx = formatTelegramFitnessContext(input);
  const hist = formatTelegramConversationBlock(input.conversationHistory);
  const prompt = `FitShot Telegram coach — user sent an image. Reply in 2–3 short paragraphs, plain text.

Rules: Connect what you see to the Athlete Context (name, recent sessions, HRV/sleep/recovery). No generic coaching—ground guidance in their data. If the image isn't training-related, say so briefly. Injury/medical: cautious tone; suggest a clinician if serious.

${hist ? `${hist}\n\n` : ""}Athlete Context:
${ctx}

Question about the image:
"""${input.userMessage.replace(/"""/g, "'")}"""

Describe what matters in the image, then advise.`;

  const res = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    },
  ]);
  return trimTelegramReply(res.response.text());
}
