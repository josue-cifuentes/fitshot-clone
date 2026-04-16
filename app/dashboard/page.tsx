import { cookies } from "next/headers";
import { STRAVA_ACCESS_TOKEN_COOKIE } from "@/lib/strava";
import { prisma } from "@/lib/db";
import { fetchStravaAthlete } from "@/lib/strava";
import { redirect } from "next/navigation";

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

  const profile = await prisma.coachProfile.findUnique({
    where: { stravaAthleteId: athlete.id },
  });

  const status = {
    strava: true,
    garmin: !!(profile?.garminEmail && profile?.garminPasswordCipher),
    appleHealth: !!profile?.healthExportToken,
    telegram: !!profile?.telegramChatId,
    instagram: !!profile?.instagramAccessToken,
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <main className="mx-auto w-full max-w-lg px-6 py-12 space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">FitShot</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Minimalist fitness tracking & coaching.</p>
        </header>

        {/* Section 1: Connections */}
        <section className="space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">Connections</h2>
          <div className="grid gap-4">
            <ConnectionCard 
              name="Strava" 
              connected={status.strava} 
              href="/login" // Re-authorizing is fine
            />
            <ConnectionCard 
              name="Garmin" 
              connected={status.garmin} 
              href="/garmin"
            />
            <ConnectionCard 
              name="Apple Health" 
              connected={status.appleHealth} 
              href="/apple-health"
            />
            <ConnectionCard 
              name="Telegram" 
              connected={status.telegram} 
              href="/telegram"
            />
          </div>
        </section>

        {/* Section 2: Instagram */}
        <section className="space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">Instagram</h2>
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <p className="text-sm text-[#F5F5F5]/70">
              Connect your Instagram Business account to post your workout photos directly from the editor.
            </p>
            <button className="w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110">
              {status.instagram ? "Manage Instagram" : "Connect Instagram"}
            </button>
          </div>
        </section>

        {/* Section 3: Meal Tracker */}
        <section className="space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">Meal Tracker</h2>
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <p className="text-sm text-[#F5F5F5]/70">
              Send a photo of your meal to our Telegram bot. Gemini AI will analyze the portions and calculate your calories automatically.
            </p>
            <div className="flex items-center gap-3 text-[#E8FF00] text-sm font-medium">
              <div className="w-2 h-2 rounded-full bg-[#E8FF00] animate-pulse" />
              AI-powered calorie tracking
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ConnectionCard({ 
  name, 
  connected, 
  href 
}: { 
  name: string; 
  connected: boolean; 
  href: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#E8FF00]' : 'bg-[#F5F5F5]/20'}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <a 
        href={href}
        className={`text-xs font-bold transition ${connected ? 'text-[#F5F5F5]/40 hover:text-[#F5F5F5]/60' : 'text-[#E8FF00] hover:brightness-110'}`}
      >
        {connected ? 'Reconnect' : 'Connect'}
      </a>
    </div>
  );
}
