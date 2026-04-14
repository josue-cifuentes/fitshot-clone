import { NextResponse } from "next/server";
import {
  getStravaAthleteIdFromCookies,
  getStravaAccessTokenFromCookies,
} from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import { STRAVA_ACCESS_TOKEN_COOKIE } from "@/lib/strava";

export async function POST() {
  const athleteId = await getStravaAthleteIdFromCookies();
  const token = await getStravaAccessTokenFromCookies();
  if (athleteId == null || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.DATABASE_URL) {
    try {
      await prisma.coachProfile.updateMany({
        where: { stravaAthleteId: athleteId },
        data: {
          stravaRefreshCipher: null,
          stravaRefreshIv: null,
          stravaRefreshTag: null,
        },
      });
    } catch (e) {
      console.error("coach strava disconnect db:", e);
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
