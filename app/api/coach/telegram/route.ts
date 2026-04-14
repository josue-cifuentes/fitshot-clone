import { NextResponse } from "next/server";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const athleteId = await getStravaAthleteIdFromCookies();
  if (athleteId == null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { chatId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chatId = body.chatId?.trim() ?? "";
  await prisma.coachProfile.upsert({
    where: { stravaAthleteId: athleteId },
    create: {
      stravaAthleteId: athleteId,
      telegramChatId: chatId || null,
    },
    update: { telegramChatId: chatId || null },
  });

  return NextResponse.json({ ok: true });
}
