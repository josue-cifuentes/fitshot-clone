import { cookies } from "next/headers";
import {
  fetchStravaAthlete,
  STRAVA_ACCESS_TOKEN_COOKIE,
  type StravaAthlete,
} from "@/lib/strava";

/**
 * Admin gate: `ADMIN_EMAIL` must match Strava `/athlete` email (case-insensitive),
 * or `ADMIN_STRAVA_ATHLETE_ID` must match the signed-in athlete id when email is missing.
 */
export async function verifyAdminSession(): Promise<
  | { ok: true; athlete: StravaAthlete }
  | { ok: false }
> {
  const token = (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false };

  let athlete: StravaAthlete;
  try {
    athlete = await fetchStravaAthlete(token);
  } catch {
    return { ok: false };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = athlete.email?.trim().toLowerCase();
  if (adminEmail && userEmail && userEmail === adminEmail) {
    return { ok: true, athlete };
  }

  const adminAthleteId = process.env.ADMIN_STRAVA_ATHLETE_ID?.trim();
  if (adminAthleteId && String(athlete.id) === adminAthleteId) {
    return { ok: true, athlete };
  }

  return { ok: false };
}
