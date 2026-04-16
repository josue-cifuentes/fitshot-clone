"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppleHealthPage() {
  const [loading, setLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/apple-health/setup", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to setup Apple Health");
      }
      const data = await res.json();
      setWebhookUrl(data.webhookUrl);
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
          <h1 className="text-3xl font-bold tracking-tight">Apple Health</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Sync your health data using an iOS Shortcut.</p>
        </header>

        <div className="glass-panel rounded-3xl p-6 space-y-6">
          {!webhookUrl ? (
            <>
              <p className="text-sm text-[#F5F5F5]/70 leading-relaxed">
                To connect Apple Health, we'll generate a unique webhook URL for you to use with our iOS Shortcut.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Webhook"}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#F5F5F5]/50">Your Webhook URL</label>
                <div className="bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-[10px] font-mono break-all text-[#E8FF00]">
                  {webhookUrl}
                </div>
              </div>
              <p className="text-xs text-[#F5F5F5]/50 leading-relaxed">
                1. Copy this URL.<br />
                2. Download the FitShot iOS Shortcut.<br />
                3. Paste this URL into the Shortcut settings.
              </p>
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
