import { NextResponse } from "next/server";
import { compileFitshotAppleShortcutBuffer } from "@/lib/apple-health-shortcut";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const athleteId = await getStravaAthleteIdFromCookies();
    if (!athleteId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const profile = await prisma.coachProfile.findUnique({
      where: { stravaAthleteId: athleteId },
      select: { healthExportToken: true },
    });

    if (!profile?.healthExportToken) {
      return new NextResponse("Apple Health not set up. Generate a webhook first.", { status: 400 });
    }

    const baseUrl = getPublicAppUrl();
    if (!baseUrl) {
      return new NextResponse("NEXT_PUBLIC_APP_URL not configured", { status: 500 });
    }

    const webhookUrl = `${baseUrl}/api/health/apple?token=${profile.healthExportToken}`;
    const buffer = compileFitshotAppleShortcutBuffer(webhookUrl);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="FitShot-Apple-Health.shortcut"',
      },
    });
  } catch (error) {
    console.error("Shortcut download error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
