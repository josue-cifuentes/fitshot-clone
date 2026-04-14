"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppleHealthDay } from "@/lib/apple-health";
import type { StravaActivity } from "@/lib/strava";
import type { GarminRecoveryDay } from "@/lib/garmin-recovery";
import type { AiTrainingRecommendation } from "@/lib/gemini-coach";

type DashboardPayload = {
  error?: string;
  activities?: StravaActivity[];
  garmin?: { days: GarminRecoveryDay[] } | { error: string } | null;
  recoveryPrimary?: "garmin" | "apple" | null;
  appleHealth?: {
    webhookUrl: string | null;
    lastSyncAt: string | null;
    hasToken: boolean;
    hasData: boolean;
    waitingForSync: boolean;
    days: AppleHealthDay[];
  };
  recommendation?: AiTrainingRecommendation | null;
  telegram?: {
    deepLink: string | null;
    isLinked: boolean;
    botConfigured: boolean;
  };
  profile?: { hasGarmin: boolean; telegramChatId: string };
  lastRecommendationAt?: string | null;
};

function fmtPaceSecondsPerKm(sPerKm: number): string {
  if (!Number.isFinite(sPerKm) || sPerKm <= 0) return "—";
  const m = Math.floor(sPerKm / 60);
  const sec = Math.floor(sPerKm % 60);
  return `${m}:${sec.toString().padStart(2, "0")}/km`;
}

function fmtShortDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(isoDate + "T12:00:00Z"));
  } catch {
    return isoDate;
  }
}

export function CoachDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [garminDays, setGarminDays] = useState<GarminRecoveryDay[] | null>(
    null
  );
  const [garminError, setGarminError] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<AiTrainingRecommendation | null>(null);
  const [recAt, setRecAt] = useState<string | null>(null);
  const [hasGarmin, setHasGarmin] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramBotConfigured, setTelegramBotConfigured] = useState(false);
  const [tgSetupLoading, setTgSetupLoading] = useState(false);
  const [tgDisconnectLoading, setTgDisconnectLoading] = useState(false);
  const [tgCopyOk, setTgCopyOk] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitGarmin, setSubmitGarmin] = useState(false);
  const [garminFormError, setGarminFormError] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyOk, setNotifyOk] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const [recoveryPrimary, setRecoveryPrimary] = useState<
    "garmin" | "apple" | null
  >(null);
  const [appleHealth, setAppleHealth] = useState<
    DashboardPayload["appleHealth"] | undefined
  >(undefined);
  const [disconnectGarminLoading, setDisconnectGarminLoading] = useState(false);
  const [appleSetupLoading, setAppleSetupLoading] = useState(false);
  const [appleDisconnectLoading, setAppleDisconnectLoading] = useState(false);
  const [appleCopyOk, setAppleCopyOk] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stravaDisconnectLoading, setStravaDisconnectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/coach/dashboard", { credentials: "include" });
      setStatus(res.status);
      const data = (await res.json()) as DashboardPayload;
      if (!res.ok) {
        throw new Error(data.error || "Failed to load");
      }
      setActivities(data.activities ?? []);
      if (!data.garmin) {
        setGarminDays(null);
        setGarminError(null);
      } else if ("error" in data.garmin) {
        setGarminDays(null);
        setGarminError(data.garmin.error);
      } else {
        setGarminDays(data.garmin.days);
        setGarminError(null);
      }
      setHasGarmin(Boolean(data.profile?.hasGarmin));
      setRecoveryPrimary(data.recoveryPrimary ?? null);
      setAppleHealth(data.appleHealth);
      const tid = data.profile?.telegramChatId?.trim() ?? "";
      setTelegramLinked(Boolean(tid));
      setTelegramDeepLink(data.telegram?.deepLink ?? null);
      setTelegramBotConfigured(Boolean(data.telegram?.botConfigured));
      setRecommendation(data.recommendation ?? null);
      setRecAt(data.lastRecommendationAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connectGarmin(e: React.FormEvent) {
    e.preventDefault();
    setGarminFormError(null);
    setSubmitGarmin(true);
    try {
      const res = await fetch("/api/coach/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Garmin connect failed");
      setEmail("");
      setPassword("");
      await load();
    } catch (e) {
      setGarminFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitGarmin(false);
    }
  }

  async function setupTelegramLink() {
    setTgSetupLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/coach/telegram/setup", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; deepLink?: string };
      if (!res.ok) throw new Error(data.error || "Could not create link");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Telegram setup failed");
    } finally {
      setTgSetupLoading(false);
    }
  }

  async function disconnectTelegram() {
    if (!confirm("Unlink Telegram from FitShot?")) return;
    setTgDisconnectLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/coach/telegram/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setTgDisconnectLoading(false);
    }
  }

  async function copyTelegramLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setTgCopyOk(true);
      setTimeout(() => setTgCopyOk(false), 2000);
    } catch {
      setActionError("Could not copy to clipboard");
    }
  }

  async function getRecommendation() {
    setRecLoading(true);
    setRecError(null);
    try {
      const res = await fetch("/api/coach/recommend", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        recommendation?: AiTrainingRecommendation;
      };
      if (!res.ok) throw new Error(data.error || "Recommendation failed");
      if (data.recommendation) {
        setRecommendation(data.recommendation);
        setRecAt(new Date().toISOString());
      }
    } catch (e) {
      setRecError(e instanceof Error ? e.message : "Error");
    } finally {
      setRecLoading(false);
    }
  }

  async function disconnectStrava() {
    if (!confirm("Disconnect Strava? Coach will lose access until you connect again."))
      return;
    setStravaDisconnectLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/coach/strava/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Strava disconnect failed");
    } finally {
      setStravaDisconnectLoading(false);
    }
  }

  async function disconnectGarmin() {
    if (!confirm("Disconnect Garmin and remove stored credentials?")) return;
    setDisconnectGarminLoading(true);
    try {
      const res = await fetch("/api/coach/garmin/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnectGarminLoading(false);
    }
  }

  async function ensureAppleWebhook() {
    setAppleSetupLoading(true);
    try {
      const res = await fetch("/api/coach/apple-health/setup", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; webhookUrl?: string };
      if (!res.ok) throw new Error(data.error || "Setup failed");
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Apple Health setup failed"
      );
    } finally {
      setAppleSetupLoading(false);
    }
  }

  async function disconnectAppleHealth() {
    if (!confirm("Remove Apple Health data and webhook for this account?"))
      return;
    setAppleDisconnectLoading(true);
    try {
      const res = await fetch("/api/coach/apple-health/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Apple disconnect failed");
    } finally {
      setAppleDisconnectLoading(false);
    }
  }

  async function copyWebhookUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setAppleCopyOk(true);
      setTimeout(() => setAppleCopyOk(false), 2000);
    } catch {
      setActionError("Could not copy to clipboard");
    }
  }

  async function notifyTelegram() {
    setNotifyLoading(true);
    setNotifyOk(false);
    setNotifyError(null);
    try {
      const res = await fetch("/api/coach/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Notify failed");
      setNotifyOk(true);
    } catch (e) {
      setNotifyError(e instanceof Error ? e.message : "Notify failed");
    } finally {
      setNotifyLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#F5F5F5]/55">
        Loading…
      </div>
    );
  }

  if (status === 401 || error === "Unauthorized") {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center">
        <p className="text-sm text-[#F5F5F5]/80">
          Connect Strava from the Connect tab to use AI Coach.
        </p>
        <a
          href="/connect"
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-bold text-[#0A0A0A] transition hover:brightness-110"
          style={{ backgroundColor: "#E8FF00" }}
        >
          Connect Strava
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  const sortedAppleDays = appleHealth?.days?.length
    ? [...appleHealth.days].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const latestAppleDay =
    sortedAppleDays.length > 0 ? sortedAppleDays[sortedAppleDays.length - 1] : null;

  const latestGarminDay =
    garminDays && garminDays.length > 0
      ? garminDays[garminDays.length - 1]
      : null;

  const showGarminSnapshot =
    recoveryPrimary === "garmin" && latestGarminDay && !garminError;
  const showAppleSnapshot =
    recoveryPrimary === "apple" && latestAppleDay;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8FF00]">
          AI Coach
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5]">
          Training & recovery
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#F5F5F5]/55">
          Strava load, recovery from Garmin (preferred) or Apple Health, and a
          daily plan from Gemini. Telegram for optional pings.
        </p>
      </header>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Strava
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#E8FF00]/40 bg-[#E8FF00]/10 px-3 py-1 text-xs font-semibold text-[#E8FF00]">
              Connected
            </span>
            <button
              type="button"
              onClick={() => void disconnectStrava()}
              disabled={stravaDisconnectLoading}
              className="rounded-xl border border-red-500/50 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-950/40 disabled:opacity-50"
            >
              {stravaDisconnectLoading ? "…" : "Disconnect"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#F5F5F5]/45">
          Disconnect revokes this Strava link at Strava, deletes your coach data
          for this account (including refresh token, Garmin, Apple Health, and
          Telegram links), and clears your session cookie. Other Strava users are
          unaffected. Reconnect anytime from Connect Strava.
        </p>
      </section>

      {actionError && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {actionError}
        </div>
      )}

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Today&apos;s recommendation
        </h2>
        {recommendation ? (
          <div className="mt-3 space-y-2 text-sm text-[#F5F5F5]/90">
            <p className="text-lg font-semibold text-[#F5F5F5]">
              {recommendation.type}
            </p>
            <p>
              <span className="text-[#F5F5F5]/45">Duration</span>{" "}
              {recommendation.durationMinutes} min
            </p>
            <p>
              <span className="text-[#F5F5F5]/45">Intensity</span>{" "}
              {recommendation.intensity}
            </p>
            <p className="leading-relaxed text-[#F5F5F5]/70">
              {recommendation.reasoning}
            </p>
            {recAt && (
              <p className="text-xs text-[#F5F5F5]/40">
                Updated{" "}
                {new Date(recAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#F5F5F5]/45">
            No recommendation yet. Connect Garmin or Apple Health, then generate
            below.
          </p>
        )}
        {recError && (
          <p className="mt-2 text-sm text-amber-200/90">{recError}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void getRecommendation()}
            disabled={recLoading}
            className="flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-bold text-[#0A0A0A] transition hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: "#E8FF00" }}
          >
            {recLoading ? "Generating…" : "Get recommendation"}
          </button>
          {telegramLinked && (
            <button
              type="button"
              onClick={() => void notifyTelegram()}
              disabled={notifyLoading || !recommendation}
              className="glass-panel flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-[#F5F5F5] disabled:opacity-50"
            >
              {notifyLoading ? "Sending…" : "Send to Telegram"}
            </button>
          )}
        </div>
        {notifyOk && (
          <p className="mt-2 text-sm text-emerald-300/90">
            Sent to Telegram.
          </p>
        )}
        {notifyError && (
          <p className="mt-2 text-sm text-amber-200/90">{notifyError}</p>
        )}
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Garmin Connect
          </h2>
          {hasGarmin && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#E8FF00]/40 bg-[#E8FF00]/10 px-3 py-1 text-xs font-semibold text-[#E8FF00]">
                Connected
              </span>
              <button
                type="button"
                onClick={() => void disconnectGarmin()}
                disabled={disconnectGarminLoading}
                className="rounded-xl border border-red-500/50 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-950/40 disabled:opacity-50"
              >
                {disconnectGarminLoading ? "…" : "Disconnect"}
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-[#F5F5F5]/45">
          Credentials are encrypted (AES-GCM) in the database. We use the{" "}
          <code className="rounded bg-[#141414] px-1 py-0.5 text-[11px]">
            @flow-js/garmin-connect
          </code>{" "}
          client (Node equivalent to Python garth).
        </p>
        {garminFormError && (
          <p className="mt-2 text-sm text-amber-200/90">{garminFormError}</p>
        )}
        <form onSubmit={connectGarmin} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="Garmin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 rounded-2xl border border-[#F5F5F5]/12 bg-[#141414] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#F5F5F5]/35"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Garmin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 rounded-2xl border border-[#F5F5F5]/12 bg-[#141414] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#F5F5F5]/35"
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitGarmin}
              className="glass-panel min-h-12 rounded-2xl border border-[#E8FF00]/40 px-5 text-sm font-bold text-[#E8FF00] disabled:opacity-50"
            >
              {submitGarmin
                ? "Connecting…"
                : hasGarmin
                  ? "Update Garmin login"
                  : "Connect Garmin"}
            </button>
          </div>
        </form>
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Apple Health
          </h2>
          {appleHealth?.hasData && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-200">
              Connected ✓
            </span>
          )}
          {appleHealth?.waitingForSync && (
            <span className="rounded-full border border-[#F5F5F5]/20 bg-[#141414] px-3 py-1 text-xs text-[#F5F5F5]/65">
              Waiting for first sync…
            </span>
          )}
          {(appleHealth?.hasToken || appleHealth?.hasData) && (
            <button
              type="button"
              onClick={() => void disconnectAppleHealth()}
              disabled={appleDisconnectLoading}
              className="rounded-xl border border-red-500/50 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-950/40 disabled:opacity-50"
            >
              {appleDisconnectLoading ? "…" : "Disconnect"}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-[#F5F5F5]/70">
          Sync HRV, resting heart rate, sleep, active energy, and steps via the{" "}
          <strong className="text-[#F5F5F5]">Health Auto Export</strong> app
          (iOS). FitShot gives you a private webhook URL; the app POSTs JSON to
          it.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[#F5F5F5]/80">
          <li>
            Install{" "}
            <span className="text-[#F5F5F5]">Health Auto Export</span> from the
            App Store and open it.
          </li>
          <li>
            Tap <strong>Automation</strong> (or <strong>Servers</strong> /
            <strong>Webhooks</strong>, depending on your version).
          </li>
          <li>
            Add a new server / webhook and choose <strong>POST</strong> with{" "}
            <strong>JSON</strong> body.
          </li>
          <li>
            Paste your FitShot URL below as the endpoint. Use one export per day
            or on a schedule that includes the metrics you care about.
          </li>
          <li>
            Enable metrics: <strong>HRV</strong>, <strong>Resting Heart Rate</strong>,{" "}
            <strong>Sleep</strong> (duration &amp; quality if available),{" "}
            <strong>Active Energy</strong>, and <strong>Steps</strong>.
          </li>
          <li>Save and send a test export — status below should update.</li>
        </ol>
        {!appleHealth?.hasToken && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void ensureAppleWebhook()}
              disabled={appleSetupLoading}
              className="glass-panel min-h-11 rounded-2xl border border-[#E8FF00]/40 px-4 text-sm font-bold text-[#E8FF00] disabled:opacity-50"
            >
              {appleSetupLoading ? "Working…" : "Generate webhook URL"}
            </button>
          </div>
        )}
        {appleHealth?.webhookUrl ? (
          <div className="mt-4 rounded-2xl border border-[#F5F5F5]/12 bg-[#141414] p-3">
            <p className="text-xs font-medium text-[#F5F5F5]/45">Your webhook</p>
            <p className="mt-1 break-all font-mono text-xs text-[#E8FF00] sm:text-sm">
              {appleHealth.webhookUrl}
            </p>
            <button
              type="button"
              onClick={() => void copyWebhookUrl(appleHealth.webhookUrl!)}
              className="mt-3 rounded-xl border border-[#F5F5F5]/20 px-3 py-1.5 text-xs font-semibold text-[#F5F5F5]"
            >
              {appleCopyOk ? "Copied" : "Copy URL"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-amber-200/80">
            Set <code className="rounded bg-[#141414] px-1">NEXT_PUBLIC_APP_URL</code>{" "}
            so FitShot can build your webhook link (same as Strava OAuth).
          </p>
        )}
        {appleHealth?.lastSyncAt && (
          <p className="mt-2 text-xs text-[#F5F5F5]/45">
            Last sync:{" "}
            {new Date(appleHealth.lastSyncAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </section>

      {showGarminSnapshot && latestGarminDay && (
        <section className="glass-panel rounded-2xl border border-[#E8FF00]/25 bg-[#E8FF00]/[0.06] p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Latest recovery snapshot (Garmin)
          </h2>
          <p className="mt-1 text-xs text-[#F5F5F5]/45">
            Most recent day ({fmtShortDate(latestGarminDay.date)}). AI uses
            Garmin when connected.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[#F5F5F5]/45">Body Battery</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestGarminDay.bodyBattery ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">HRV status</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestGarminDay.hrvStatus ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Sleep score</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestGarminDay.sleepScore ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Training readiness</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestGarminDay.trainingReadiness ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Resting HR</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestGarminDay.restingHeartRate ?? "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {showAppleSnapshot && latestAppleDay && (
        <section className="glass-panel rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            Latest recovery snapshot (Apple Health)
          </h2>
          <p className="mt-1 text-xs text-[#F5F5F5]/45">
            Most recent day ({fmtShortDate(latestAppleDay.date)}). Used when
            Garmin isn&apos;t connected; otherwise Garmin is preferred for AI.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[#F5F5F5]/45">HRV</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.hrv != null ? Math.round(latestAppleDay.hrv) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Resting HR</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.restingHeartRate ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Sleep (min)</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.sleepDurationMinutes ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Sleep quality</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.sleepQuality ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Active energy (kcal)</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.activeEnergyKcal != null
                  ? Math.round(latestAppleDay.activeEnergyKcal)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Steps</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestAppleDay.steps != null
                  ? Math.round(latestAppleDay.steps)
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Recovery (last 7 days)
        </h2>
        {recoveryPrimary === "garmin" && garminError && (
          <p className="mt-2 text-sm text-amber-200/90">{garminError}</p>
        )}
        {recoveryPrimary === "garmin" &&
          garminDays &&
          garminDays.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[#F5F5F5]/45">
                  <th className="pb-2 pr-2 font-medium">Date</th>
                  <th className="pb-2 pr-2 font-medium">Body Battery</th>
                  <th className="pb-2 pr-2 font-medium">HRV</th>
                  <th className="pb-2 pr-2 font-medium">Sleep</th>
                  <th className="pb-2 pr-2 font-medium">Readiness</th>
                  <th className="pb-2 font-medium">Resting HR</th>
                </tr>
              </thead>
              <tbody className="text-[#F5F5F5]/90">
                {garminDays.map((d) => (
                  <tr key={d.date} className="border-t border-[#F5F5F5]/10">
                    <td className="py-2 pr-2">{fmtShortDate(d.date)}</td>
                    <td className="py-2 pr-2">{d.bodyBattery ?? "—"}</td>
                    <td className="py-2 pr-2">{d.hrvStatus ?? "—"}</td>
                    <td className="py-2 pr-2">{d.sleepScore ?? "—"}</td>
                    <td className="py-2 pr-2">{d.trainingReadiness ?? "—"}</td>
                    <td className="py-2">{d.restingHeartRate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recoveryPrimary === "apple" && sortedAppleDays.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="text-[#F5F5F5]/45">
                  <th className="pb-2 pr-2 font-medium">Date</th>
                  <th className="pb-2 pr-2 font-medium">HRV</th>
                  <th className="pb-2 pr-2 font-medium">Resting HR</th>
                  <th className="pb-2 pr-2 font-medium">Sleep (min)</th>
                  <th className="pb-2 pr-2 font-medium">Sleep Q</th>
                  <th className="pb-2 pr-2 font-medium">Active kcal</th>
                  <th className="pb-2 font-medium">Steps</th>
                </tr>
              </thead>
              <tbody className="text-[#F5F5F5]/90">
                {sortedAppleDays.slice(-7).map((d) => (
                  <tr key={d.date} className="border-t border-[#F5F5F5]/10">
                    <td className="py-2 pr-2">{fmtShortDate(d.date)}</td>
                    <td className="py-2 pr-2">
                      {d.hrv != null ? Math.round(d.hrv) : "—"}
                    </td>
                    <td className="py-2 pr-2">{d.restingHeartRate ?? "—"}</td>
                    <td className="py-2 pr-2">{d.sleepDurationMinutes ?? "—"}</td>
                    <td className="py-2 pr-2">{d.sleepQuality ?? "—"}</td>
                    <td className="py-2 pr-2">
                      {d.activeEnergyKcal != null
                        ? Math.round(d.activeEnergyKcal)
                        : "—"}
                    </td>
                    <td className="py-2">
                      {d.steps != null ? Math.round(d.steps) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!recoveryPrimary && (
          <p className="mt-3 text-sm text-[#F5F5F5]/45">
            Connect Garmin or complete Apple Health setup and wait for the first
            webhook sync.
          </p>
        )}
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Strava (last 7 days)
        </h2>
        {activities.length === 0 ? (
          <p className="mt-3 text-sm text-[#F5F5F5]/45">
            No activities in the last 7 days.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-[#F5F5F5]/45">
                  <th className="pb-2 pr-2 font-medium">Activity</th>
                  <th className="pb-2 pr-2 font-medium">Type</th>
                  <th className="pb-2 pr-2 font-medium">Distance</th>
                  <th className="pb-2 pr-2 font-medium">Pace</th>
                  <th className="pb-2 font-medium">Avg HR</th>
                </tr>
              </thead>
              <tbody className="text-[#F5F5F5]/90">
                {activities.map((a) => {
                  const distKm = a.distance / 1000;
                  const pace =
                    distKm > 0 && a.moving_time > 0
                      ? a.moving_time / distKm
                      : NaN;
                  return (
                    <tr key={a.id} className="border-t border-[#F5F5F5]/10">
                      <td className="py-2 pr-2">{a.name}</td>
                      <td className="py-2 pr-2">{a.sport_type ?? a.type}</td>
                      <td className="py-2 pr-2">{distKm.toFixed(2)} km</td>
                      <td className="py-2 pr-2">{fmtPaceSecondsPerKm(pace)}</td>
                      <td className="py-2">
                        {a.average_heartrate != null
                          ? Math.round(a.average_heartrate)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Connect Telegram
          </h2>
          {telegramLinked && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-500/40 bg-sky-950/40 px-3 py-1 text-xs font-semibold text-sky-200">
                Connected
              </span>
              <button
                type="button"
                onClick={() => void disconnectTelegram()}
                disabled={tgDisconnectLoading}
                className="rounded-xl border border-red-500/50 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-950/40 disabled:opacity-50"
              >
                {tgDisconnectLoading ? "…" : "Disconnect"}
              </button>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-[#F5F5F5]/70">
          The bot token stays on the server only. You get a one-time link to
          open Telegram and link this chat to your FitShot account. After
          linking, you can message the coach anytime, and you&apos;ll receive
          your daily training recommendation each morning (Guatemala time).
        </p>
        {!telegramBotConfigured && (
          <p className="mt-3 text-sm text-amber-200/90">
            Server env: set <code className="rounded bg-[#141414] px-1">TELEGRAM_BOT_TOKEN</code>{" "}
            and <code className="rounded bg-[#141414] px-1">TELEGRAM_BOT_USERNAME</code>{" "}
            (public bot name, no @). Register the webhook once (see deploy notes).
          </p>
        )}
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[#F5F5F5]/80">
          <li>Tap <strong>Generate connection link</strong> below.</li>
          <li>
            Open the link on your phone — Telegram starts the bot with a
            secure token.
          </li>
          <li>
            Send <code className="rounded bg-[#141414] px-1">/start</code> if
            prompted — FitShot links your chat ID to your account.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          {telegramBotConfigured && (
            <button
              type="button"
              onClick={() => void setupTelegramLink()}
              disabled={tgSetupLoading}
              className="glass-panel min-h-11 rounded-2xl border border-[#E8FF00]/40 px-4 text-sm font-bold text-[#E8FF00] disabled:opacity-50"
            >
              {tgSetupLoading
                ? "Working…"
                : telegramLinked
                  ? "New connection link"
                  : "Generate connection link"}
            </button>
          )}
        </div>
        {telegramDeepLink && (
          <div className="mt-4 rounded-2xl border border-[#F5F5F5]/12 bg-[#141414] p-3">
            <p className="text-xs font-medium text-[#F5F5F5]/45">
              Your link (expires after you connect)
            </p>
            <p className="mt-1 break-all font-mono text-xs text-sky-300 sm:text-sm">
              {telegramDeepLink}
            </p>
            <button
              type="button"
              onClick={() => void copyTelegramLink(telegramDeepLink)}
              className="mt-3 rounded-xl border border-[#F5F5F5]/20 px-3 py-1.5 text-xs font-semibold text-[#F5F5F5]"
            >
              {tgCopyOk ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
