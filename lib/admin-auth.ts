import type { StravaAthlete } from "@/lib/strava";
import { auth } from "@/auth";
import { fetchStravaAthlete } from "@/lib/strava";
import { getStravaAccessTokenFromCookies } from "@/lib/coach-auth";

/**
 * Admin gate: `ADMIN_EMAIL` must match the signed-in user's email (NextAuth session),
 * or `ADMIN_STRAVA_ATHLETE_ID` must match session `stravaAthleteId` when email is missing.
 */
export async function verifyAdminSession(): Promise<
  | { ok: true; athlete: StravaAthlete }
  | { ok: false }
> {
  const session = await auth();
  if (!session?.user) return { ok: false };

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = session.user.email?.trim().toLowerCase();
  if (adminEmail && userEmail && userEmail === adminEmail) {
    const token = await getStravaAccessTokenFromCookies();
    if (!token) return { ok: false };
    try {
      const athlete = await fetchStravaAthlete(token);
      return { ok: true, athlete };
    } catch {
      return { ok: false };
    }
  }

  const adminAthleteId = process.env.ADMIN_STRAVA_ATHLETE_ID?.trim();
  const sid = session.user.stravaAthleteId;
  if (adminAthleteId && sid != null && String(sid) === adminAthleteId) {
    const token = await getStravaAccessTokenFromCookies();
    if (!token) return { ok: false };
    try {
      const athlete = await fetchStravaAthlete(token);
      return { ok: true, athlete };
    } catch {
      return { ok: false };
    }
  }

  return { ok: false };
}
