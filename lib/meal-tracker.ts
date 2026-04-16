import { prisma } from "@/lib/db";

export async function getDailyCalorieSummary(coachProfileId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const meals = await prisma.mealLog.findMany({
    where: {
      coachProfileId,
      createdAt: { gte: today },
      isMealPhoto: true,
    },
  });

  const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const totalProtein = meals.reduce((sum, m) => sum + (m.protein || 0), 0);
  const totalCarbs = meals.reduce((sum, m) => sum + (m.carbs || 0), 0);
  const totalFat = meals.reduce((sum, m) => sum + (m.fat || 0), 0);

  return {
    count: meals.length,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
  };
}

export async function createMealLog(data: {
  coachProfileId: string;
  imageFileId?: string;
  description?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}) {
  return prisma.mealLog.create({
    data: {
      ...data,
      isMealPhoto: true,
    },
  });
}

export async function getPendingMealLog(coachProfileId: string) {
  // Find a meal log from the last 30 minutes that has a description but no calories yet
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  return prisma.mealLog.findFirst({
    where: {
      coachProfileId,
      createdAt: { gte: thirtyMinsAgo },
      calories: null,
      description: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateMealLog(id: string, data: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  return prisma.mealLog.update({
    where: { id },
    data,
  });
}
