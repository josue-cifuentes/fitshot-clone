import Link from "next/link";
import { getStravaAccessTokenFromCookies } from "@/lib/coach-auth";

export default async function Home() {
  const token = await getStravaAccessTokenFromCookies();
  const connected = Boolean(token);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-6 sm:max-w-xl sm:gap-8 sm:px-6 sm:py-10">
        <header className="text-center sm:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8FF00]">
            Fitshot
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5] sm:text-3xl lg:text-4xl">
            Training photos with activity stats
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#F5F5F5]/55 sm:text-base">
            Connect Strava, pick an activity, add a photo or short video, then
            share a feed or story export.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:gap-4">
          {connected ? (
            <Link
              href="/dashboard"
              className="flex min-h-14 items-center justify-center rounded-2xl bg-[#E8FF00] px-6 text-base font-bold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/15 transition hover:brightness-110 active:scale-[0.99] sm:min-h-16 sm:text-lg"
            >
              Open dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex min-h-14 items-center justify-center rounded-2xl bg-[#E8FF00] px-6 text-base font-bold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/15 transition hover:brightness-110 active:scale-[0.99] sm:min-h-16 sm:text-lg"
            >
              Connect Strava
            </Link>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <Link
              href="/activities"
              className="glass-panel flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-bold text-[#F5F5F5] transition hover:bg-[#F5F5F5]/[0.08] active:scale-[0.99] sm:min-h-14 sm:text-base"
            >
              Activities
            </Link>
            <Link
              href="/editor"
              className="glass-panel flex min-h-12 items-center justify-center rounded-2xl px-4 text-sm font-bold text-[#F5F5F5] transition hover:bg-[#F5F5F5]/[0.08] active:scale-[0.99] sm:min-h-14 sm:text-base"
            >
              Editor
            </Link>
          </div>

          {!connected ? (
            <p className="text-center text-xs text-[#F5F5F5]/45 sm:text-sm">
              Connect once to load activities and unlock the editor.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
