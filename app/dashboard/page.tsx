"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import { 
  IconLink, 
  IconActivities, 
  IconCoach 
} from "@/app/components/nav-icons";

type ConnectionStatus = {
  strava: boolean;
  garmin: boolean;
  appleHealth: boolean;
  telegram: boolean;
  instagram: boolean;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>({
    strava: false,
    garmin: false,
    appleHealth: false,
    telegram: false,
    instagram: false,
  });

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/coach/dashboard");
      if (res.ok) {
        const data = await res.json();
        setStatus({
          strava: true, // If we can reach this, Strava is connected via NextAuth
          garmin: !!data.profile?.hasGarmin,
          appleHealth: !!data.appleHealth?.hasData,
          telegram: !!data.telegram?.isLinked,
          instagram: !!data.profile?.instagramAccessToken,
        });
      }
    } catch (e) {
      console.error("Failed to load status", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] text-[#F5F5F5]/50">
        Loading...
      </div>
    );
  }

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
              onDisconnect={() => signOut({ callbackUrl: "/login" })}
            />
            <ConnectionCard 
              name="Garmin" 
              connected={status.garmin} 
              href="/coach" // Keep existing Garmin login UI for now
            />
            <ConnectionCard 
              name="Apple Health" 
              connected={status.appleHealth} 
              href="/coach"
            />
            <ConnectionCard 
              name="Telegram" 
              connected={status.telegram} 
              href="/coach"
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
  onDisconnect,
  href 
}: { 
  name: string; 
  connected: boolean; 
  onDisconnect?: () => void;
  href?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#E8FF00]' : 'bg-[#F5F5F5]/20'}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      {connected ? (
        <button 
          onClick={onDisconnect}
          className="text-xs font-bold text-red-400/80 hover:text-red-400 transition"
        >
          Disconnect
        </button>
      ) : (
        <a 
          href={href}
          className="text-xs font-bold text-[#E8FF00] hover:brightness-110 transition"
        >
          Connect
        </a>
      )}
    </div>
  );
}
