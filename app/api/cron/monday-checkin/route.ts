import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    const states = await prisma.telegramState.findMany({
      where: { telegramChatId: { not: "" } },
    });

    for (const state of states) {
      await prisma.telegramState.update({
        where: { id: state.id },
        data: { state: "AWAITING_DEFICIT_GOAL" },
      });

      await sendMessage(
        state.telegramChatId, 
        "🗓 *Monday Check-in!*\n\nLet's set your goals for the week. What is your daily calorie deficit goal for this week? (e.g., 500)"
      );
    }
    
    return NextResponse.json({ ok: true, processed: states.length });
  } catch (err) {
    console.error("Monday check-in cron failed:", err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
