import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  notifyProfileIfConfigured,
  runCoachJobForProfile,
} from "@/lib/coach-pipeline";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Vercel Cron: 7:00 Guatemala (UTC-6) → 13:00 UTC daily.
 * Configure in vercel.json: `"schedule": "0 13 * * *"`
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 503 });
  }

  const profiles = await prisma.coachProfile.findMany({
    where: {
      garminEmail: { not: null },
      garminPasswordCipher: { not: null },
      telegramChatId: { not: null },
      stravaRefreshCipher: { not: null },
    },
  });

  const results: { athleteId: number; ok: boolean; error?: string }[] = [];

  for (const p of profiles) {
    try {
      const rec = await runCoachJobForProfile(p);
      await notifyProfileIfConfigured(p, rec);
      results.push({ athleteId: p.stravaAthleteId, ok: true });
    } catch (e) {
      results.push({
        athleteId: p.stravaAthleteId,
        ok: false,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
