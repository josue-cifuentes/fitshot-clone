import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";
import { getPublicAppUrl } from "@/lib/public-app-url";

export async function POST() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 }
    );
  }

  const baseUrl = getPublicAppUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not configured." },
      { status: 503 }
    );
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let token: string | undefined;
  const existing = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athleteId },
    select: { healthExportToken: true },
  });

  if (existing?.healthExportToken) {
    token = existing.healthExportToken;
  } else {
    token = randomBytes(24).toString("hex");
    await prisma.coachProfile.upsert({
      where: { stravaAthleteId: athleteId },
      create: {
        stravaAthleteId: athleteId,
        healthExportToken: token,
      },
      update: { healthExportToken: token },
    });
  }

  const webhookUrl = `${baseUrl}/api/health/apple?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, webhookUrl, token });
}
