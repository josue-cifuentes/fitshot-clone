import { NextResponse } from "next/server";
import { GarminConnect } from "@flow-js/garmin-connect";
import { internalServerErrorJsonLogged } from "@/lib/api-internal-error";
import { encryptSecret } from "@/lib/coach-crypto";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { encryptGarminTokens } from "@/lib/garmin-client-from-profile";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
  if (!process.env.COACH_ENCRYPTION_KEY || !process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Coach storage is not configured (DATABASE_URL, COACH_ENCRYPTION_KEY)." },
      { status: 503 }
    );
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const gc = new GarminConnect({ username: email, password });
  try {
    await gc.login(email, password);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Garmin login failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const tokens = gc.exportToken();
  const encTok = encryptGarminTokens(tokens);
  const encPw = encryptSecret(password);

  await prisma.coachProfile.upsert({
    where: { stravaAthleteId: athleteId },
    create: {
      stravaAthleteId: athleteId,
      garminEmail: email,
      garminPasswordCipher: encPw.cipherText,
      garminPasswordIv: encPw.iv,
      garminPasswordTag: encPw.tag,
      garminTokensCipher: encTok.cipherText,
      garminTokensIv: encTok.iv,
      garminTokensTag: encTok.tag,
    },
    update: {
      garminEmail: email,
      garminPasswordCipher: encPw.cipherText,
      garminPasswordIv: encPw.iv,
      garminPasswordTag: encPw.tag,
      garminTokensCipher: encTok.cipherText,
      garminTokensIv: encTok.iv,
      garminTokensTag: encTok.tag,
    },
  });

  return NextResponse.json({ ok: true });
  } catch (e) {
    return internalServerErrorJsonLogged("POST /api/coach/garmin", e);
  }
}
