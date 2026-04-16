import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Sunday midnight reset cron.
 * Automatically clears all calorie entries to start fresh on Monday.
 * Vercel Cron: 0 6 * * 1 (Monday 6:00 UTC -> Sunday 0:00 Guatemala UTC-6)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // Delete all calorie entries
    const result = await prisma.calorieEntry.deleteMany({});
    
    return NextResponse.json({ 
      message: "Weekly calorie reset successful", 
      deletedCount: result.count 
    });
  } catch (err) {
    console.error("Calorie reset cron failed:", err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
