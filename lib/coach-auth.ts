import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import {
  fetchStravaAthlete,
  STRAVA_ACCESS_TOKEN_COOKIE,
} from "@/lib/strava";

async function getJwtFromRequest() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const h = await headers();
  return getToken({
    req: { headers: h } as Parameters<typeof getToken>[0]["req"],
    secret,
    secureCookie: process.env.NODE_ENV === "production",
  });
}

export async function getStravaAthleteIdFromCookies(): Promise<number | null> {
  const jwt = await getJwtFromRequest();
  if (jwt?.stravaAthleteId != null && typeof jwt.stravaAthleteId === "number") {
    return jwt.stravaAthleteId;
  }

  const token = (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const athlete = await fetchStravaAthlete(token);
    return athlete.id;
  } catch {
    return null;
  }
}

export async function getStravaAccessTokenFromCookies(): Promise<string | null> {
  const jwt = await getJwtFromRequest();
  if (jwt?.accessToken && typeof jwt.accessToken === "string") {
    return jwt.accessToken;
  }

  return (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value ?? null;
}
