import { NextResponse } from "next/server";
import { getStravaAccessTokenFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import {
  generateAndSaveRecommendation,
  profileHasAppleHealthData,
  profileHasGarminCredentials,
} from "@/lib/coach-pipeline";
import { fetchStravaAthlete } from "@/lib/strava";

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 503 }
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const token = await getStravaAccessTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athlete = await fetchStravaAthlete(token);
  const profile = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athlete.id },
  });
  if (!profile) {
    return NextResponse.json(
      { error: "Connect Garmin or set up Apple Health first." },
      { status: 400 }
    );
  }
  if (
    !profileHasGarminCredentials(profile) &&
    !profileHasAppleHealthData(profile)
  ) {
    return NextResponse.json(
      {
        error:
          "Connect Garmin, or set up Apple Health and wait for the first webhook sync.",
      },
      { status: 400 }
    );
  }

  try {
    const rec = await generateAndSaveRecommendation(profile, token);
    return NextResponse.json({ recommendation: rec });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Recommendation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
