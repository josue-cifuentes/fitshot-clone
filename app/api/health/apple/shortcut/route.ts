import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { internalServerErrorJsonLogged } from "@/lib/api-internal-error";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { compileFitshotAppleShortcutBuffer } from "@/lib/apple-health-shortcut";
import { prisma } from "@/lib/db";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

  let token: string;
  const existing = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athleteId },
    select: { healthExportToken: true },
  });

  if (existing?.healthExportToken?.trim()) {
    token = existing.healthExportToken.trim();
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

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/health/apple?token=${encodeURIComponent(token)}`;

  try {
    const buf = compileFitshotAppleShortcutBuffer(webhookUrl);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          'attachment; filename="FitShot Apple Health.shortcut"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return internalServerErrorJsonLogged("GET /api/health/apple/shortcut (compile)", e);
  }
  } catch (e) {
    return internalServerErrorJsonLogged("GET /api/health/apple/shortcut", e);
  }
}
