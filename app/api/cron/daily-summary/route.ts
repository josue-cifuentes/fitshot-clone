import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Daily summary cron.
 * Sends a summary of total calories consumed vs goal at 8pm Guatemala time.
 * Guatemala (UTC-6) 20:00 -> 02:00 UTC next day.
 * Vercel Cron: 0 2 * * *
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const users = await prisma.userProfile.findMany({
      where: {
        targetCalories: { not: null },
      },
      include: {
        calorieEntries: {
          where: {
            date: { gte: today },
          },
        },
      },
    });

    const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

    for (const user of users) {
      const chatId = user.telegramChatId?.trim();
      if (!chatId) continue;

      const total = user.calorieEntries.reduce((sum, e) => sum + e.calories, 0);
      const goal = user.targetCalories || 2000;
      const diff = goal - total;

      let message = `🌙 *Daily Calorie Summary*\n\n`;
      message += `Total Consumed: ${total} kcal\n`;
      message += `Daily Goal: ${goal} kcal\n\n`;

      if (diff >= 0) {
        message += `Great job! You finished the day with ${diff} kcal remaining to hit your deficit goal. ✅`;
      } else {
        message += `You went over your daily goal by ${Math.abs(diff)} kcal. Tomorrow is a new day! 💪`;
      }

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      });
    }
    
    return NextResponse.json({ ok: true, processed: users.length });
  } catch (err) {
    console.error("Daily summary cron failed:", err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
