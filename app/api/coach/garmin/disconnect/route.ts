import { NextResponse } from "next/server";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";

export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 }
    );
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.coachProfile.updateMany({
    where: { stravaAthleteId: athleteId },
    data: {
      garminEmail: null,
      garminPasswordCipher: null,
      garminPasswordIv: null,
      garminPasswordTag: null,
      garminTokensCipher: null,
      garminTokensIv: null,
      garminTokensTag: null,
    },
  });

  return NextResponse.json({ ok: true });
}
