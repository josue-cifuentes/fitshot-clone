import { NextResponse } from "next/server";
import {
  getStravaAccessTokenFromCookies,
  getStravaAthleteIdFromCookies,
} from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import { createGarminClientFromProfile } from "@/lib/garmin-client-from-profile";
import { fetchGarminRecoveryLastDays } from "@/lib/garmin-recovery";
import {
  fetchStravaActivitiesSince,
  fetchStravaAthlete,
} from "@/lib/strava";
import type { AiTrainingRecommendation } from "@/lib/gemini-coach";

export async function GET() {
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

  if (profile?.garminEmail && profile.garminPasswordCipher) {
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
    recommendation,
    profile: {
      hasGarmin: Boolean(profile?.garminEmail),
      telegramChatId: profile?.telegramChatId ?? "",
    },
    lastRecommendationAt: profile?.lastRecommendationAt ?? null,
  });
}
