import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { internalServerErrorJson } from "@/lib/api-internal-error";
import { appleDaysJsonHasData } from "@/lib/apple-health";
import { profileHasGarminCredentials } from "@/lib/coach-pipeline";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 }
    );
  }

  const auth = await verifyAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.coachProfile.findMany({
    orderBy: { createdAt: "desc" },
  });

  const users = profiles.map((p) => ({
    id: p.id,
    name:
      p.stravaDisplayName?.trim() ||
      p.stravaUsername?.trim() ||
      `Strava #${p.stravaAthleteId}`,
    email: p.stravaEmail?.trim() || "—",
    stravaAthleteId: p.stravaAthleteId,
    services: {
      strava: Boolean(
        p.stravaRefreshCipher && p.stravaRefreshIv && p.stravaRefreshTag
      ),
      garmin: profileHasGarminCredentials(p),
      apple:
        Boolean(p.healthExportToken?.trim()) ||
        appleDaysJsonHasData(p.appleHealthDaysJson),
      telegram: Boolean(p.telegramChatId?.trim()),
    },
  }));

  return NextResponse.json({ users });
  } catch {
    return internalServerErrorJson();
  }
}
