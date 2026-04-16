import { cookies } from "next/headers";
import { STRAVA_ACCESS_TOKEN_COOKIE } from "@/lib/strava";
import { redirect } from "next/navigation";

export default async function CaloriesPage() {
  const token = (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect("/login");
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <main className="mx-auto w-full max-w-lg px-6 py-12 space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Calorie Tracker</h1>
          <p className="text-[#F5F5F5]/50 text-sm">
            Track your daily calories by chatting with your AI nutrition assistant on Telegram.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-8 space-y-8 text-center">
          <div className="w-20 h-20 bg-[#E8FF00]/10 rounded-full flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8FF00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-bold">AI Nutrition Assistant</h2>
            <p className="text-sm text-[#F5F5F5]/50 leading-relaxed">
              Send photos of your meals, ask questions about portions, and get daily summaries directly in Telegram.
            </p>
          </div>

          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110"
          >
            Open Telegram Bot
          </a>
        </div>

        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#E8FF00]">How it works</h3>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-[#F5F5F5]/10 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
              <p className="text-sm text-[#F5F5F5]/70">Snap a photo of your meal and send it to the bot.</p>
            </li>
            <li className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-[#F5F5F5]/10 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
              <p className="text-sm text-[#F5F5F5]/70">The AI identifies the food and asks for portion sizes.</p>
            </li>
            <li className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-[#F5F5F5]/10 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
              <p className="text-sm text-[#F5F5F5]/70">Get instant calorie calculations and daily progress updates.</p>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
