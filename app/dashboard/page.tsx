import { cookies } from "next/headers";
import { STRAVA_ACCESS_TOKEN_COOKIE, fetchStravaActivities, fetchStravaAthlete } from "@/lib/strava";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShareButton } from "@/app/components/share-button";

export default async function Dashboard() {
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

  const activities = await fetchStravaActivities(token, 10);

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <main className="mx-auto w-full max-w-lg px-6 py-12 space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">FitShot</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Welcome back, {athlete.firstname || athlete.username}.</p>
        </header>

        <section className="space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">Recent Activities</h2>
          <div className="grid gap-4">
            {activities.length === 0 ? (
              <p className="text-sm text-[#F5F5F5]/40 text-center py-8">No recent activities found.</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="glass-panel rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{activity.name}</h3>
                      <p className="text-xs text-[#F5F5F5]/40">{new Date(activity.start_date).toLocaleDateString()}</p>
                    </div>
                    <ShareButton 
                      title={activity.name} 
                      text={`Check out my ${activity.type} on FitShot! ${(activity.distance / 1000).toFixed(2)}km in ${Math.round(activity.moving_time / 60)}min.`}
                    />
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-[#F5F5F5]/40 text-xs uppercase font-bold tracking-tighter">Distance</p>
                      <p className="font-mono">{(activity.distance / 1000).toFixed(2)} km</p>
                    </div>
                    <div>
                      <p className="text-[#F5F5F5]/40 text-xs uppercase font-bold tracking-tighter">Time</p>
                      <p className="font-mono">{Math.round(activity.moving_time / 60)} min</p>
                    </div>
                    {activity.average_heartrate && (
                      <div>
                        <p className="text-[#F5F5F5]/40 text-xs uppercase font-bold tracking-tighter">Avg HR</p>
                        <p className="font-mono">{Math.round(activity.average_heartrate)} bpm</p>
                      </div>
                    )}
                  </div>
                  <Link 
                    href={`/editor?activityId=${activity.id}`}
                    className="block w-full py-3 rounded-xl bg-[#F5F5F5]/5 text-center text-xs font-bold hover:bg-[#F5F5F5]/10 transition"
                  >
                    Open in Editor
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
