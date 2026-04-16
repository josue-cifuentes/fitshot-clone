import type { PrismaClient } from "@prisma/client";
import {
  guatemalaDateKey,
  weekRangeUtcContaining,
} from "@/lib/guatemala-week";

export async function mealLogMetricsForUser(
  prisma: PrismaClient,
  userProfileId: string,
  atUtc: Date
): Promise<{ mealNumber: number; dailyTotal: number; weeklyTotal: number }> {
  const entries = await prisma.calorieEntry.findMany({
    where: { userProfileId },
    select: { date: true, calories: true },
  });

  const dayKey = guatemalaDateKey(atUtc);
  const { start: wStart, end: wEnd } = weekRangeUtcContaining(atUtc);

  const todayEntries = entries.filter((e) => guatemalaDateKey(e.date) === dayKey);
  const weekEntries = entries.filter((e) => e.date >= wStart && e.date < wEnd);

  const dailyTotal = todayEntries.reduce((s, e) => s + e.calories, 0);
  const weeklyTotal = weekEntries.reduce((s, e) => s + e.calories, 0);
  const mealNumber = todayEntries.length;

  return { mealNumber, dailyTotal, weeklyTotal };
}
