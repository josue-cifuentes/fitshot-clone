import { cookies } from "next/headers";
import {
  fetchStravaAthlete,
  STRAVA_ACCESS_TOKEN_COOKIE,
} from "@/lib/strava";

export async function getStravaAthleteIdFromCookies(): Promise<number | null> {
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
  return (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value ?? null;
}
