"use client";

import { useCallback, useEffect, useState } from "react";
import type { StravaActivity } from "@/lib/strava";
import type { GarminRecoveryDay } from "@/lib/garmin-recovery";
import type { AiTrainingRecommendation } from "@/lib/gemini-coach";

type DashboardPayload = {
  error?: string;
  activities?: StravaActivity[];
  garmin?: { days: GarminRecoveryDay[] } | { error: string } | null;
  recommendation?: AiTrainingRecommendation | null;
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
  const [telegramSavedId, setTelegramSavedId] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telegram, setTelegram] = useState("");
  const [submitGarmin, setSubmitGarmin] = useState(false);
  const [submitTg, setSubmitTg] = useState(false);
  const [garminFormError, setGarminFormError] = useState<string | null>(null);
  const [telegramFormError, setTelegramFormError] = useState<string | null>(
    null
  );
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyOk, setNotifyOk] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      const tid = data.profile?.telegramChatId?.trim() ?? "";
      setTelegramLinked(Boolean(tid));
      setTelegramSavedId(tid);
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

  async function saveTelegram(e: React.FormEvent) {
    e.preventDefault();
    setTelegramFormError(null);
    setSubmitTg(true);
    try {
      const res = await fetch("/api/coach/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: telegram }),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setTelegram("");
      await load();
    } catch (e) {
      setTelegramFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitTg(false);
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
          Go to Connect
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

  const latestRecovery =
    garminDays && garminDays.length > 0
      ? garminDays[garminDays.length - 1]
      : null;

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
          Strava load, Garmin recovery, and a daily plan from Gemini. Telegram
          for optional pings.
        </p>
      </header>

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
            No recommendation yet. Connect Garmin, then generate one below.
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
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Garmin Connect
        </h2>
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

      {latestRecovery && !garminError && (
        <section className="glass-panel rounded-2xl border border-[#E8FF00]/25 bg-[#E8FF00]/[0.06] p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
            Latest recovery snapshot
          </h2>
          <p className="mt-1 text-xs text-[#F5F5F5]/45">
            Most recent day in your Garmin data ({fmtShortDate(latestRecovery.date)}).
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[#F5F5F5]/45">Body Battery</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestRecovery.bodyBattery ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">HRV status</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestRecovery.hrvStatus ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Sleep score</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestRecovery.sleepScore ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Training readiness</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestRecovery.trainingReadiness ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#F5F5F5]/45">Resting HR</dt>
              <dd className="font-semibold text-[#F5F5F5]">
                {latestRecovery.restingHeartRate ?? "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="glass-panel rounded-2xl p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Recovery (last 7 days)
        </h2>
        {garminError && (
          <p className="mt-2 text-sm text-amber-200/90">{garminError}</p>
        )}
        {garminDays && garminDays.length > 0 ? (
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
        ) : (
          !garminError && (
            <p className="mt-3 text-sm text-[#F5F5F5]/45">
              Connect Garmin above to load Body Battery, HRV, sleep, readiness,
              and resting HR.
            </p>
          )
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
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8FF00]">
          Telegram
        </h2>
        <p className="mt-1 text-xs text-[#F5F5F5]/45">
          Use your numeric chat ID if possible (from @userinfobot). @username
          works after you open your bot and tap Start.
        </p>
        {telegramSavedId && (
          <p className="mt-2 text-xs text-[#F5F5F5]/55">
            Linked: <span className="text-[#F5F5F5]">{telegramSavedId}</span>
          </p>
        )}
        {telegramFormError && (
          <p className="mt-2 text-sm text-amber-200/90">{telegramFormError}</p>
        )}
        <form
          onSubmit={saveTelegram}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            required
            placeholder="Chat ID or @username"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            className="min-h-12 flex-1 rounded-2xl border border-[#F5F5F5]/12 bg-[#141414] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#F5F5F5]/35"
          />
          <button
            type="submit"
            disabled={submitTg}
            className="glass-panel min-h-12 shrink-0 rounded-2xl px-5 text-sm font-semibold text-[#F5F5F5] disabled:opacity-50"
          >
            {submitTg ? "Saving…" : "Save"}
          </button>
        </form>
      </section>
    </div>
  );
}
