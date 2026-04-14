import { redirect } from "next/navigation";
import { getStravaAccessTokenFromCookies } from "@/lib/coach-auth";
import {
  fetchStravaActivities,
  type StravaActivity,
} from "@/lib/strava";
import { EditorShell } from "./editor-shell";

export default async function EditorPage() {
  const token = await getStravaAccessTokenFromCookies();
  if (!token) {
    redirect("/login");
  }

  let activities: StravaActivity[] = [];
  try {
    activities = await fetchStravaActivities(token, 40);
  } catch {
    activities = [];
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-2 px-2 pb-2 pt-2 sm:gap-3 sm:px-4 sm:pb-3 sm:pt-4 lg:gap-6 lg:px-6 lg:py-8">
        <header className="hidden shrink-0 lg:block">
          <h1 className="text-2xl font-semibold tracking-tight text-[#F5F5F5]">
            Editor
          </h1>
          <p className="mt-1 text-sm text-[#F5F5F5]/50">
            Layout presets, glass overlays, photo or MP4 (≤15s) background, and
            export at 1080×1080 or 1080×1920.
          </p>
        </header>

        <EditorShell activities={activities} appUrl={appUrl} />
      </div>
    </div>
  );
}
