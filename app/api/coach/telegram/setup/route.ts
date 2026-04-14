import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { internalServerErrorJsonLogged } from "@/lib/api-internal-error";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";

function requireBotUsername(): string {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!u) {
    throw new Error("TELEGRAM_BOT_USERNAME is not set (bot username without @).");
  }
  return u;
}

/**
 * Creates a one-time deep link token for t.me/Bot?start=TOKEN.
 * TELEGRAM_BOT_TOKEN stays server-side only; only the public username is used in URLs.
 */
export async function POST() {
  try {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 }
    );
  }

  let botUsername: string;
  try {
    botUsername = requireBotUsername();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bot not configured" },
      { status: 503 }
    );
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = randomBytes(24).toString("hex");

  await prisma.coachProfile.upsert({
    where: { stravaAthleteId: athleteId },
    create: {
      stravaAthleteId: athleteId,
      telegramLinkToken: token,
    },
    update: { telegramLinkToken: token },
  });

  const deepLink = `https://t.me/${botUsername}?start=${token}`;

  return NextResponse.json({ ok: true, deepLink, token });
  } catch (e) {
    return internalServerErrorJsonLogged("POST /api/coach/telegram/setup", e);
  }
}
