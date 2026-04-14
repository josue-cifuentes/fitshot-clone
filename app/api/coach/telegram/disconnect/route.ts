import { NextResponse } from "next/server";
import { internalServerErrorJsonLogged } from "@/lib/api-internal-error";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
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
      telegramChatId: null,
      telegramLinkToken: null,
    },
  });

  return NextResponse.json({ ok: true });
  } catch (e) {
    return internalServerErrorJsonLogged("POST /api/coach/telegram/disconnect", e);
  }
}
