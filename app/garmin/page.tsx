"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GarminConnectPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/coach/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect Garmin");
      }

      router.push("/dashboard");
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
          <h1 className="text-3xl font-bold tracking-tight">Connect Garmin</h1>
          <p className="text-[#F5F5F5]/50 text-sm">Enter your Garmin Connect credentials to sync your recovery data.</p>
        </header>

        <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-[#F5F5F5]/50">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#E8FF00]/50"
              placeholder="your@email.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-[#F5F5F5]/50">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1A1A1A] border border-[#F5F5F5]/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#E8FF00]/50"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-[#E8FF00] text-[#0A0A0A] font-bold text-sm transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Connecting..." : "Connect Garmin"}
          </button>
        </form>

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
