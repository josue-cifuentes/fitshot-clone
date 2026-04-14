import { NextResponse } from "next/server";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import {
  formatRecommendationTelegram,
  notifyProfileIfConfigured,
} from "@/lib/coach-pipeline";
import type { AiTrainingRecommendation } from "@/lib/gemini-coach";
import { sendTelegramMessage } from "@/lib/telegram-notify";

export async function POST(request: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not configured." },
      { status: 503 }
    );
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string; recommendation?: AiTrainingRecommendation };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athleteId },
  });
  if (!profile?.telegramChatId?.trim()) {
    return NextResponse.json(
      { error: "Save a Telegram chat ID first." },
      { status: 400 }
    );
  }

  if (body.message) {
    await sendTelegramMessage(profile.telegramChatId.trim(), body.message);
    return NextResponse.json({ ok: true });
  }

  const rec =
    body.recommendation ??
    (profile.lastRecommendationJson
      ? (JSON.parse(profile.lastRecommendationJson) as AiTrainingRecommendation)
      : null);

  if (!rec) {
    return NextResponse.json(
      { error: "No recommendation yet. Run Get recommendation first." },
      { status: 400 }
    );
  }

  await notifyProfileIfConfigured(profile, rec);
  return NextResponse.json({ ok: true, text: formatRecommendationTelegram(rec) });
}
