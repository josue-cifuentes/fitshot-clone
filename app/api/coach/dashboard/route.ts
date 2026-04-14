import { NextResponse } from "next/server";
import { internalServerErrorJson } from "@/lib/api-internal-error";
import {
  parseAppleHealthDaysJson,
  appleDaysJsonHasData,
  type AppleHealthDay,
} from "@/lib/apple-health";
import {
  getStravaAccessTokenFromCookies,
  getStravaAthleteIdFromCookies,
} from "@/lib/coach-auth";
import {
  profileHasGarminCredentials,
} from "@/lib/coach-pipeline";
import { prisma } from "@/lib/db";
import { createGarminClientFromProfile } from "@/lib/garmin-client-from-profile";
import { fetchGarminRecoveryLastDays } from "@/lib/garmin-recovery";
import type { AiTrainingRecommendation } from "@/lib/gemini-coach";
import { getPublicAppUrl } from "@/lib/public-app-url";
import {
  fetchStravaActivitiesSince,
  fetchStravaAthlete,
} from "@/lib/strava";
import type { CoachProfile } from "@prisma/client";

function buildTelegramDeepLink(profile: CoachProfile | null): string | null {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  const tok = profile?.telegramLinkToken?.trim();
  if (!bot || !tok) return null;
  return `https://t.me/${bot}?start=${encodeURIComponent(tok)}`;
}

export async function GET() {
  try {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  const token = await getStravaAccessTokenFromCookies();
  if (athleteId == null || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athlete = await fetchStravaAthlete(token);
  const after = Math.floor(Date.now() / 1000) - 7 * 86400;
  const activities = await fetchStravaActivitiesSince(token, after, 50);

  const profile = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athlete.id },
  });

  let garmin:
    | { days: Awaited<ReturnType<typeof fetchGarminRecoveryLastDays>>["days"] }
    | { error: string }
    | null = null;

  if (profile && profileHasGarminCredentials(profile)) {
    try {
      const gc = await createGarminClientFromProfile(profile);
      const data = await fetchGarminRecoveryLastDays(gc, 7);
      garmin = { days: data.days };
    } catch (e) {
      garmin = {
        error: e instanceof Error ? e.message : "Garmin fetch failed",
      };
    }
  }

  const baseUrl = getPublicAppUrl();
  const healthExportToken = profile?.healthExportToken?.trim();
  const appleWebhookUrl =
    baseUrl && healthExportToken
      ? `${baseUrl}/api/health/apple?token=${encodeURIComponent(healthExportToken)}`
      : null;

  let appleDays: AppleHealthDay[] = [];
  if (profile?.appleHealthDaysJson) {
    appleDays = parseAppleHealthDaysJson(profile.appleHealthDaysJson);
  }

  const appleHasData = profile ? appleDaysJsonHasData(profile.appleHealthDaysJson) : false;
  const garminOk =
    garmin !== null && garmin !== undefined && "days" in garmin && !("error" in garmin);
  const recoveryPrimary: "garmin" | "apple" | null = garminOk
    ? "garmin"
    : appleHasData
      ? "apple"
      : null;

  let recommendation: AiTrainingRecommendation | null = null;
  if (profile?.lastRecommendationJson) {
    try {
      recommendation = JSON.parse(
        profile.lastRecommendationJson
      ) as AiTrainingRecommendation;
    } catch {
      recommendation = null;
    }
  }

  return NextResponse.json({
    athlete: { id: athlete.id, username: athlete.username },
    activities,
    garmin,
    recoveryPrimary,
    appleHealth: {
      webhookUrl: appleWebhookUrl,
      lastSyncAt: profile?.appleHealthLastSyncAt?.toISOString() ?? null,
      hasToken: Boolean(healthExportToken),
      hasData: appleHasData,
      waitingForSync: Boolean(healthExportToken) && !appleHasData,
      days: appleDays,
    },
    recommendation,
    telegram: {
      deepLink: buildTelegramDeepLink(profile),
      isLinked: Boolean(profile?.telegramChatId?.trim()),
      botConfigured: Boolean(
        process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim()
      ),
    },
    profile: {
      hasGarmin: profileHasGarminCredentials(profile),
      telegramChatId: profile?.telegramChatId ?? "",
    },
    lastRecommendationAt: profile?.lastRecommendationAt ?? null,
  });
  } catch {
    return internalServerErrorJson();
  }
}
