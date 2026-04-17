import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureWeekSheetExists } from "@/lib/googleSheets";
import { weekSheetTitleForDate } from "@/lib/guatemala-week";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId: string | number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

/**
 * Monday check-in cron.
 * Guatemala (UTC-6) 07:00 -> 13:00 UTC Monday.
 * Vercel Cron: 0 13 * * 1
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    await prisma.telegramSession.updateMany({
      data: { conversationHistory: Prisma.JsonNull },
    });

    try {
      await ensureWeekSheetExists(weekSheetTitleForDate(new Date()));
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: unknown } };
      console.error("Google Sheets full error:", err?.message, err?.response?.data);
    }

    const profiles = await prisma.userProfile.findMany({
      where: { telegramChatId: { not: null } },
    });

    for (const p of profiles) {
      const chatId = p.telegramChatId?.trim();
      if (!chatId) continue;

      await sendMessage(
        chatId,
        "🗓 *Monday Check-in!*\n\nLet's set your goals for the week. What is your daily calorie deficit goal for this week? (e.g., 500)"
      );
    }
    
    return NextResponse.json({ ok: true, processed: profiles.length });
  } catch (err) {
    console.error("Monday check-in cron failed:", err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
