import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { 
  STRAVA_OAUTH_STATE_COOKIE,
  buildStravaAuthorizationUrl 
} from "@/lib/strava";
import { NextResponse } from "next/server";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const authUrl = buildStravaAuthorizationUrl(state);

  const cookieStore = await cookies();
  cookieStore.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return NextResponse.redirect(authUrl);
}
