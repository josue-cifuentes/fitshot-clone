import { NextRequest, NextResponse } from "next/server";
import { internalServerErrorJson } from "@/lib/api-internal-error";
import { encryptSecret } from "@/lib/coach-crypto";
import { prisma } from "@/lib/db";
import {
  STRAVA_ACCESS_TOKEN_COOKIE,
  STRAVA_OAUTH_STATE_COOKIE,
  exchangeStravaCodeForToken,
  fetchStravaAthlete,
} from "@/lib/strava";

function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set");
  }
  return base.replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  try {
  const base = appBaseUrl();
  const connect = (q?: string) =>
    NextResponse.redirect(
      q ? `${base}/connect?${q}` : `${base}/connect`
    );

  const error = request.nextUrl.searchParams.get("error");
  if (error === "access_denied") {
    return connect("error=access_denied");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const savedState = request.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return connect("error=invalid_state");
  }

  if (!code) {
    return connect("error=missing_code");
  }

  let token;
  try {
    token = await exchangeStravaCodeForToken(code);
  } catch {
    return connect("error=token_exchange");
  }

  // Persist refresh token for this Strava athlete only (multi-user: keyed by athlete.id).
  if (process.env.DATABASE_URL && process.env.COACH_ENCRYPTION_KEY) {
    try {
      const athlete = await fetchStravaAthlete(token.access_token);
      const enc = encryptSecret(token.refresh_token);
      const displayName =
        [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim() ||
        athlete.username;
      await prisma.coachProfile.upsert({
        where: { stravaAthleteId: athlete.id },
        create: {
          stravaAthleteId: athlete.id,
          stravaEmail: athlete.email?.trim() || null,
          stravaUsername: athlete.username,
          stravaDisplayName: displayName,
          stravaRefreshCipher: enc.cipherText,
          stravaRefreshIv: enc.iv,
          stravaRefreshTag: enc.tag,
        },
        update: {
          stravaEmail: athlete.email?.trim() || null,
          stravaUsername: athlete.username,
          stravaDisplayName: displayName,
          stravaRefreshCipher: enc.cipherText,
          stravaRefreshIv: enc.iv,
          stravaRefreshTag: enc.tag,
        },
      });
    } catch (err) {
      console.error("coach strava refresh store failed:", err);
    }
  }

  const res = NextResponse.redirect(`${base}/activities`);
  res.cookies.delete(STRAVA_OAUTH_STATE_COOKIE);
  res.cookies.set(STRAVA_ACCESS_TOKEN_COOKIE, token.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, token.expires_in),
  });

  return res;
  } catch (e) {
    console.error("strava callback:", e);
    try {
      const base = appBaseUrl();
      return NextResponse.redirect(`${base}/connect?error=server`);
    } catch {
      return internalServerErrorJson();
    }
  }
}
