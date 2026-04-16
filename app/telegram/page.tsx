"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TelegramPage() {
  const [loading, setLoading] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/telegram/setup", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to setup Telegram");
      }
      const data = await res.json();
      setDeepLink(data.deepLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-[#F5F5F5] font-sans">
      <main className="mx-auto w-full max-w-md px-6 py-12 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Telegram Bot</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Connect your Telegram account for AI coaching and meal tracking.</p>
        </header>

        <div className="glass-panel rounded-3xl p-6 space-y-6">
          {!deepLink ? (
            <>
              <p className="text-sm text-[#F5F5F5]/70 leading-relaxed">
                Click below to generate a secure connection link for our Telegram bot.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Connect Telegram"}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[#F5F5F5]/70 leading-relaxed">
                Your connection link is ready. Click the button below to open Telegram and start the bot.
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 rounded-2xl bg-[#E8FF00] text-center text-[#0A0A0A] font-bold text-sm transition hover:brightness-110"
              >
                Open Telegram
              </a>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full py-4 rounded-2xl bg-[#F5F5F5]/10 text-[#F5F5F5] font-bold text-sm transition hover:bg-[#F5F5F5]/20"
              >
                Done
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <button
          onClick={() => router.back()}
          className="w-full text-xs font-bold text-[#F5F5F5]/30 hover:text-[#F5F5F5]/50 transition"
        >
          Go Back
        </button>
      </main>
    </div>
  );
}
