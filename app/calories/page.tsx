import { cookies } from "next/headers";
import { STRAVA_ACCESS_TOKEN_COOKIE, fetchStravaAthlete } from "@/lib/strava";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { CalorieTrackerClient } from "./calorie-tracker-client";

export default async function CaloriesPage() {
  const token = (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect("/login");
  }

  let athlete;
  try {
    athlete = await fetchStravaAthlete(token);
  } catch (e) {
    redirect("/login?error=token_expired");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { stravaAthleteId: athlete.id },
    include: {
      calorieEntries: {
        where: {
          date: {
            gte: getStartOfWeek(),
          },
        },
        orderBy: {
          date: "desc",
        },
      },
    },
  });

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <main className="mx-auto w-full max-w-lg px-6 py-12 space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Calorie Tracker</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Track your weekly intake and deficit goal.</p>
        </header>

        <CalorieTrackerClient 
          initialEntries={profile.calorieEntries.map(e => ({
            id: e.id,
            type: e.type,
            calories: e.calories,
            description: e.description || "",
            date: e.date.toISOString(),
          }))} 
          userProfileId={profile.id}
        />
      </main>
    </div>
  );
}

function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
}
