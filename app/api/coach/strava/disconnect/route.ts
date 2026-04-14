import { NextResponse } from "next/server";
import {
  getStravaAthleteIdFromCookies,
  getStravaAccessTokenFromCookies,
} from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import {
  deauthorizeStravaAccessToken,
  STRAVA_ACCESS_TOKEN_COOKIE,
} from "@/lib/strava";

/**
 * Disconnect Strava for the **current browser session only**:
 * 1. Revoke access at Strava (invalidates access + refresh for this grant).
 * 2. Delete this athlete's `CoachProfile` row (removes stravaAthleteId + encrypted refresh + all coach data for that Strava user).
 * 3. Clear the httpOnly access-token cookie.
 *
 * Identity is always taken from the cookie token — never from the request body — so users cannot affect each other's rows.
 */
export async function POST() {
  const athleteId = await getStravaAthleteIdFromCookies();
  const accessToken = await getStravaAccessTokenFromCookies();
  if (athleteId == null || !accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deauthorizeStravaAccessToken(accessToken);
  } catch (e) {
    console.warn("Strava deauthorize:", e);
  }

  if (process.env.DATABASE_URL) {
    try {
      await prisma.coachProfile.deleteMany({
        where: { stravaAthleteId: athleteId },
      });
    } catch (e) {
      console.error("coach strava disconnect delete:", e);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STRAVA_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
